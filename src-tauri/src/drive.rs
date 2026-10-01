//! The Sunkiss drive: the server's files as a folder in Finder, at ~/Sunkiss, that takes no
//! space on this Mac. It's a small NFS server inside the app, which macOS mounts the way it
//! would a network drive, so any app can open the files: Photoshop, Premiere, a script.
//! Every read is answered from Sunkiss's memory (store.rs) or fetched from the server a
//! block at a time. Nothing is written to disk.
//!
//! Read-only for now. Saving into it, as new versions, comes later.

use std::collections::HashMap;
use std::os::unix::fs::MetadataExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use async_trait::async_trait;
use nfsserve::nfs::{fattr3, fileid3, filename3, ftype3, nfspath3, nfsstat3, nfstime3, sattr3, specdata3};
use nfsserve::tcp::{NFSTcp, NFSTcpListener};
use nfsserve::vfs::{DirEntry, NFSFileSystem, ReadDirResult, VFSCapabilities};

use crate::store::{FileInfo, Problem, Store};

/// How old a listing of the server's files may be before the drive asks for a new one.
/// macOS also holds on to what it's told for a few seconds (actimeo, below), so a change
/// on the server shows up in Finder within a few seconds.
const FRESH: Duration = Duration::from_secs(3);

/// The folder itself. (0 isn't allowed as an id.)
const ROOT: fileid3 = 1;

/// Where the drive is mounted, while it is.
static MOUNTED: Mutex<Option<PathBuf>> = Mutex::new(None);

/// Where the drive is, or nothing while it isn't mounted.
pub fn folder() -> Option<PathBuf> {
    MOUNTED.lock().unwrap().clone()
}

/// Where the drive appears.
pub fn mount_point() -> Option<PathBuf> {
    std::env::var_os("HOME").map(|home| PathBuf::from(home).join("Sunkiss"))
}

struct Drive {
    store: Arc<Store>,
    /// Each file's id: the number macOS knows it by. A file keeps its id for as long as the
    /// app runs, even when it's saved again, so an app with it open still has it.
    ids: Mutex<Ids>,
    /// The files show as belonging to whoever is running the app.
    uid: u32,
    gid: u32,
}

#[derive(Default)]
struct Ids {
    by_name: HashMap<String, fileid3>,
    names: HashMap<fileid3, String>,
}

impl Drive {
    fn id_of(&self, name: &str) -> fileid3 {
        let mut ids = self.ids.lock().unwrap();
        if let Some(&id) = ids.by_name.get(name) {
            return id;
        }
        let id = ROOT + 1 + ids.names.len() as fileid3;
        ids.by_name.insert(name.to_string(), id);
        ids.names.insert(id, name.to_string());
        id
    }

    async fn info(&self, id: fileid3, max_age: Duration) -> Result<FileInfo, nfsstat3> {
        let name = self.ids.lock().unwrap().names.get(&id).cloned();
        let name = name.ok_or(nfsstat3::NFS3ERR_STALE)?;
        self.store.file(&name, max_age).await.map_err(to_nfs)
    }

    fn file_attr(&self, id: fileid3, info: &FileInfo) -> fattr3 {
        let time = time_of(&info.modified);
        fattr3 {
            ftype: ftype3::NF3REG,
            mode: 0o444, // read-only, for now
            nlink: 1,
            uid: self.uid,
            gid: self.gid,
            size: info.size,
            // None of it is stored on this Mac. (macOS works disk use out from the size
            // anyway, so Finder and du still show the full size for the drive's files.)
            used: 0,
            rdev: specdata3::default(),
            fsid: 0,
            fileid: id,
            atime: time,
            mtime: time,
            ctime: time,
        }
    }

    fn folder_attr(&self) -> fattr3 {
        // macOS re-reads the folder when this time moves, so it moves whenever the list of
        // files on the server changes.
        let time = system_time(self.store.changed_at());
        fattr3 {
            ftype: ftype3::NF3DIR,
            mode: 0o555,
            nlink: 2,
            uid: self.uid,
            gid: self.gid,
            size: 4096,
            used: 0,
            rdev: specdata3::default(),
            fsid: 0,
            fileid: ROOT,
            atime: time,
            mtime: time,
            ctime: time,
        }
    }
}

fn to_nfs(problem: Problem) -> nfsstat3 {
    match problem {
        Problem::NotFound => nfsstat3::NFS3ERR_NOENT,
        _ => nfsstat3::NFS3ERR_IO,
    }
}

/// A date from the server ("2026-09-14T07:21:06.380Z") the way NFS wants it.
fn time_of(iso: &str) -> nfstime3 {
    match chrono::DateTime::parse_from_rfc3339(iso) {
        Ok(time) => nfstime3 { seconds: time.timestamp() as u32, nseconds: time.timestamp_subsec_nanos() },
        Err(_) => nfstime3::default(),
    }
}

fn system_time(time: SystemTime) -> nfstime3 {
    let since = time.duration_since(UNIX_EPOCH).unwrap_or_default();
    nfstime3 { seconds: since.as_secs() as u32, nseconds: since.subsec_nanos() }
}

#[async_trait]
impl NFSFileSystem for Drive {
    fn capabilities(&self) -> VFSCapabilities {
        VFSCapabilities::ReadOnly
    }

    fn root_dir(&self) -> fileid3 {
        ROOT
    }

    async fn lookup(&self, dirid: fileid3, filename: &filename3) -> Result<fileid3, nfsstat3> {
        if dirid != ROOT {
            return Err(nfsstat3::NFS3ERR_NOTDIR);
        }
        let name = std::str::from_utf8(filename).map_err(|_| nfsstat3::NFS3ERR_NOENT)?;
        match name {
            "." | ".." => return Ok(ROOT),
            // Finder looks for these in every folder it opens. They're never on the server,
            // so there's no need to ask it.
            ".DS_Store" => return Err(nfsstat3::NFS3ERR_NOENT),
            name if name.starts_with("._") => return Err(nfsstat3::NFS3ERR_NOENT),
            _ => {}
        }
        self.store.file(name, FRESH).await.map_err(to_nfs)?;
        Ok(self.id_of(name))
    }

    async fn getattr(&self, id: fileid3) -> Result<fattr3, nfsstat3> {
        if id == ROOT {
            return Ok(self.folder_attr());
        }
        let info = self.info(id, FRESH).await?;
        Ok(self.file_attr(id, &info))
    }

    async fn read(&self, id: fileid3, offset: u64, count: u32) -> Result<(Vec<u8>, bool), nfsstat3> {
        if id == ROOT {
            return Err(nfsstat3::NFS3ERR_ISDIR);
        }
        // A file can be saved again between looking it up and reading it. Then look again, once.
        for max_age in [FRESH, Duration::ZERO] {
            let info = self.info(id, max_age).await?;
            if offset >= info.size || count == 0 {
                return Ok((Vec::new(), offset >= info.size));
            }
            let end = (offset + count as u64).min(info.size) - 1;
            match self.store.read(&info, offset, end).await {
                Ok(bytes) => return Ok((bytes, end + 1 == info.size)),
                Err(Problem::Changed) => continue,
                Err(problem) => return Err(to_nfs(problem)),
            }
        }
        Err(nfsstat3::NFS3ERR_IO)
    }

    async fn readdir(&self, dirid: fileid3, start_after: fileid3, max_entries: usize) -> Result<ReadDirResult, nfsstat3> {
        if dirid != ROOT {
            return Err(nfsstat3::NFS3ERR_NOTDIR);
        }
        let files = self.store.list(FRESH).await.map_err(to_nfs)?;
        // A long folder comes in pages; each starts after the last file of the one before.
        let skip = if start_after == 0 {
            0
        } else {
            match files.iter().position(|info| self.id_of(&info.name) == start_after) {
                Some(position) => position + 1,
                None => return Err(nfsstat3::NFS3ERR_BAD_COOKIE), // that file has gone since
            }
        };
        let entries: Vec<DirEntry> = files
            .iter()
            .skip(skip)
            .take(max_entries)
            .map(|info| {
                let id = self.id_of(&info.name);
                DirEntry { fileid: id, name: info.name.as_bytes().into(), attr: self.file_attr(id, info) }
            })
            .collect();
        let end = skip + entries.len() >= files.len();
        Ok(ReadDirResult { entries, end })
    }

    // Read-only, for now: everything that would change the drive says so.

    async fn setattr(&self, _id: fileid3, _setattr: sattr3) -> Result<fattr3, nfsstat3> {
        Err(nfsstat3::NFS3ERR_ROFS)
    }

    async fn write(&self, _id: fileid3, _offset: u64, _data: &[u8]) -> Result<fattr3, nfsstat3> {
        Err(nfsstat3::NFS3ERR_ROFS)
    }

    async fn create(&self, _dirid: fileid3, _filename: &filename3, _attr: sattr3) -> Result<(fileid3, fattr3), nfsstat3> {
        Err(nfsstat3::NFS3ERR_ROFS)
    }

    async fn create_exclusive(&self, _dirid: fileid3, _filename: &filename3) -> Result<fileid3, nfsstat3> {
        Err(nfsstat3::NFS3ERR_ROFS)
    }

    async fn mkdir(&self, _dirid: fileid3, _dirname: &filename3) -> Result<(fileid3, fattr3), nfsstat3> {
        Err(nfsstat3::NFS3ERR_ROFS)
    }

    async fn remove(&self, _dirid: fileid3, _filename: &filename3) -> Result<(), nfsstat3> {
        Err(nfsstat3::NFS3ERR_ROFS)
    }

    async fn rename(
        &self,
        _from_dirid: fileid3,
        _from_filename: &filename3,
        _to_dirid: fileid3,
        _to_filename: &filename3,
    ) -> Result<(), nfsstat3> {
        Err(nfsstat3::NFS3ERR_ROFS)
    }

    async fn symlink(
        &self,
        _dirid: fileid3,
        _linkname: &filename3,
        _symlink: &nfspath3,
        _attr: &sattr3,
    ) -> Result<(fileid3, fattr3), nfsstat3> {
        Err(nfsstat3::NFS3ERR_ROFS)
    }

    async fn readlink(&self, _id: fileid3) -> Result<nfspath3, nfsstat3> {
        Err(nfsstat3::NFS3ERR_INVAL) // there are no links in it
    }
}

/// Starts the drive's NFS server on a free port and mounts it at ~/Sunkiss.
pub async fn start(store: Arc<Store>) -> Result<PathBuf, String> {
    let path = mount_point().ok_or("there's no home folder")?;
    // A run that ended without unmounting (a crash, or `tauri dev` restarting the app) leaves
    // its mount behind, pointing at a server that's gone. Clear that away first.
    unmount(&path);
    std::fs::create_dir_all(&path).map_err(|err| format!("couldn't create {}: {err}", path.display()))?;
    // Never mount over a folder with things in it: they'd be hidden until it's unmounted.
    let mut contents = std::fs::read_dir(&path).map_err(|err| err.to_string())?;
    if contents.next().is_some() {
        return Err(format!("{} already has files in it, so the drive wasn't put there", path.display()));
    }
    let owner = std::fs::metadata(&path).map_err(|err| err.to_string())?;

    let drive = Drive { store, ids: Mutex::default(), uid: owner.uid(), gid: owner.gid() };
    let listener = NFSTcpListener::bind("127.0.0.1:0", drive)
        .await
        .map_err(|err| format!("couldn't start the NFS server: {err}"))?;
    let port = listener.get_listen_port();
    tauri::async_runtime::spawn(async move {
        if let Err(err) = listener.handle_forever().await {
            eprintln!("[drive] the NFS server stopped: {err}");
        }
    });

    // mount_nfs waits until the drive is mounted, so it runs off the async threads.
    let target = path.clone();
    tauri::async_runtime::spawn_blocking(move || mount(&target, port))
        .await
        .map_err(|err| err.to_string())??;
    *MOUNTED.lock().unwrap() = Some(path.clone());
    Ok(path)
}

/// Mounts the drive as whoever runs the app. No admin password: mount_nfs only needs one
/// for a reserved port (its resvport option), which isn't used here.
fn mount(path: &Path, port: u16) -> Result<(), String> {
    let options = [
        "vers=3,tcp",    // what nfsserve speaks
        "nolocks",       // it has no lock service; file locks stay on this Mac
        "rdonly",        // nothing can be saved into it yet
        "soft,intr",     // if Sunkiss goes away, reads fail instead of freezing the app reading
        "rsize=1048576", // read 1 MB at a time: the store's block size
        "actimeo=3",     // check with Sunkiss for changes every few seconds
    ]
    .join(",");
    let output = Command::new("/sbin/mount_nfs")
        .arg("-o")
        .arg(format!("{options},port={port},mountport={port}"))
        .arg("127.0.0.1:/")
        .arg(path)
        .output()
        .map_err(|err| format!("couldn't run mount_nfs: {err}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

/// Unmounts the drive as the app quits. Forced: once the app is gone nothing could be read
/// from it anyway, and an app with a file open just gets an error on its next read.
pub fn stop() {
    MOUNTED.lock().unwrap().take();
    if let Some(path) = mount_point() {
        unmount(&path);
    }
}

fn unmount(path: &Path) {
    let _ = Command::new("/sbin/umount").arg("-f").arg(path).output();
}

#[cfg(test)]
mod tests {
    use super::time_of;

    #[test]
    fn reads_the_servers_dates() {
        let time = time_of("1970-01-01T00:00:01.500Z");
        assert_eq!((time.seconds, time.nseconds), (1, 500_000_000));
        let time = time_of("2026-09-14T07:21:06.380Z");
        assert_eq!((time.seconds, time.nseconds), (1_789_370_466, 380_000_000));
    }
}
