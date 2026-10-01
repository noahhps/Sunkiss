//! Sunkiss's own copy of file bytes, in memory, shared by everything that reads files: the
//! page (through sunkiss://, see lib.rs) and the Sunkiss drive in Finder (drive.rs). Nothing
//! here is ever written to disk.
//!
//! Files come from the server in blocks of BLOCK bytes. Blocks read recently are remembered
//! (up to RECENT_LIMIT), and files downloaded in the app are kept whole for the session (up
//! to KEPT_LIMIT). In both, whatever was used least recently goes first.

use std::collections::{BTreeMap, HashMap};
use std::fmt;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime};

use bytes::Bytes;
use lru::LruCache;
use percent_encoding::{utf8_percent_encode, AsciiSet, CONTROLS};
use reqwest::header::{ETAG, RANGE};
use serde::{Deserialize, Serialize};
use tokio::sync::OnceCell;

/// The file server (the Node app in server/). Keep in sync with SERVER in src/api.ts.
pub const SERVER: &str = "http://localhost:8787";

/// The size of the pieces files are fetched and remembered in. Fetching a whole block when
/// a reader wants a few bytes of it is the read-ahead: the next reads are usually close by,
/// and those are answered from memory.
pub const BLOCK: u64 = 1024 * 1024;

/// How much of what was read recently is remembered.
const RECENT_LIMIT: usize = 128 * 1024 * 1024;

/// How much room files downloaded for the session get.
pub const KEPT_LIMIT: u64 = 256 * 1024 * 1024;

/// Characters escaped when a file's name goes into a URL.
const PATH_SEGMENT: &AsciiSet = &CONTROLS
    .add(b' ').add(b'"').add(b'#').add(b'%').add(b'/').add(b'<').add(b'>').add(b'?')
    .add(b'[').add(b'\\').add(b']').add(b'^').add(b'`').add(b'{').add(b'|').add(b'}');

/// A file on the server, as GET /files describes it.
#[derive(Clone, Debug, Deserialize)]
pub struct FileInfo {
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub size: u64,
    pub modified: String,
    /// Changes with every save. Blocks are only ever reused for the version they came from.
    pub etag: String,
}

/// Why a read didn't work.
#[derive(Clone, Debug, PartialEq)]
pub enum Problem {
    NotFound,
    Unreachable,
    Server(u16),
    /// The file was saved again partway through, so its bytes wouldn't match up.
    Changed,
}

impl fmt::Display for Problem {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Problem::NotFound => write!(f, "The server doesn't have this file"),
            Problem::Unreachable => write!(f, "Couldn't reach the server"),
            Problem::Server(status) => write!(f, "The server answered {status}"),
            Problem::Changed => write!(f, "The file changed on the server partway through"),
        }
    }
}

/// A file downloaded for the session, as the page shows it. The page hears about every
/// change as a "session-file" event (see src/sessionCache.ts).
#[derive(Clone, Debug, Serialize)]
pub struct SessionFile {
    pub name: String,
    /// "downloading", "kept", "failed", or "gone".
    pub status: &'static str,
    pub received: u64,
    pub total: u64,
    pub message: Option<String>,
}

impl SessionFile {
    fn downloading(info: &FileInfo, received: u64) -> Self {
        let name = info.name.clone();
        Self { name, status: "downloading", received, total: info.size, message: None }
    }
    fn kept(info: &FileInfo) -> Self {
        let name = info.name.clone();
        Self { name, status: "kept", received: info.size, total: info.size, message: None }
    }
    fn failed(name: &str, message: String) -> Self {
        Self { name: name.to_string(), status: "failed", received: 0, total: 0, message: Some(message) }
    }
    fn gone(name: &str) -> Self {
        Self { name: name.to_string(), status: "gone", received: 0, total: 0, message: None }
    }
}

#[derive(Clone, Debug, Hash, PartialEq, Eq)]
struct BlockKey {
    name: String,
    etag: String,
    index: u64,
}

impl BlockKey {
    fn new(info: &FileInfo, index: u64) -> Self {
        Self { name: info.name.clone(), etag: info.etag.clone(), index }
    }
}

/// A whole file, downloaded for the session.
struct Kept {
    info: FileInfo,
    blocks: Vec<Bytes>,
}

struct Download {
    info: FileInfo,
    received: Arc<AtomicU64>,
    cancelled: Arc<AtomicBool>,
}

struct State {
    /// The server's files by name, as of the last time it was asked.
    files: BTreeMap<String, FileInfo>,
    listed_at: Option<Instant>,
    /// When a listing last came back different from the one before.
    changed_at: SystemTime,
    recent: LruCache<BlockKey, Bytes>,
    recent_bytes: usize,
    kept: LruCache<String, Kept>,
    kept_bytes: u64,
    downloads: HashMap<String, Download>,
    failures: HashMap<String, SessionFile>,
}

/// A block being fetched. Whoever else wants it meanwhile waits on this, instead of
/// fetching it again.
type Fetch = Arc<OnceCell<Result<Bytes, Problem>>>;

pub struct Store {
    client: reqwest::Client,
    state: Mutex<State>,
    fetching: Mutex<HashMap<BlockKey, Fetch>>,
    on_change: OnceLock<Box<dyn Fn(SessionFile) + Send + Sync>>,
}

/// How many blocks a file of `size` bytes takes.
pub fn blocks_in(size: u64) -> u64 {
    size.div_ceil(BLOCK)
}

/// The server's address for a file.
pub fn file_url(name: &str) -> String {
    format!("{SERVER}/files/{}", utf8_percent_encode(name, PATH_SEGMENT))
}

impl Store {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            // One client for every request, so connections to the server get reused.
            client: reqwest::Client::builder()
                .connect_timeout(Duration::from_secs(5))
                .build()
                .expect("couldn't set up the HTTP client"),
            state: Mutex::new(State {
                files: BTreeMap::new(),
                listed_at: None,
                changed_at: SystemTime::now(),
                recent: LruCache::unbounded(),
                recent_bytes: 0,
                kept: LruCache::unbounded(),
                kept_bytes: 0,
                downloads: HashMap::new(),
                failures: HashMap::new(),
            }),
            fetching: Mutex::default(),
            on_change: OnceLock::new(),
        })
    }

    pub fn client(&self) -> &reqwest::Client {
        &self.client
    }

    /// Sets who hears about changes to session downloads (the page; see lib.rs).
    pub fn on_change(&self, listener: impl Fn(SessionFile) + Send + Sync + 'static) {
        let _ = self.on_change.set(Box::new(listener));
    }

    fn tell(&self, file: SessionFile) {
        if let Some(listener) = self.on_change.get() {
            listener(file);
        }
    }

    /// Every file on the server, by name, from a listing no older than `max_age`.
    pub async fn list(&self, max_age: Duration) -> Result<Vec<FileInfo>, Problem> {
        self.refresh(max_age).await?;
        Ok(self.state.lock().unwrap().files.values().cloned().collect())
    }

    /// One file, from a listing no older than `max_age`. A name that isn't there may be a
    /// file added since, so the server is asked again first (at most once a second).
    pub async fn file(&self, name: &str, max_age: Duration) -> Result<FileInfo, Problem> {
        self.refresh(max_age).await?;
        if let Some(info) = self.state.lock().unwrap().files.get(name) {
            return Ok(info.clone());
        }
        self.refresh(Duration::from_secs(1)).await?;
        self.state.lock().unwrap().files.get(name).cloned().ok_or(Problem::NotFound)
    }

    /// When the list of files last changed: a file added, removed, or saved again.
    pub fn changed_at(&self) -> SystemTime {
        self.state.lock().unwrap().changed_at
    }

    async fn refresh(&self, max_age: Duration) -> Result<(), Problem> {
        if self.state.lock().unwrap().listed_at.is_some_and(|at| at.elapsed() < max_age) {
            return Ok(());
        }
        let res = self.client.get(format!("{SERVER}/files")).send().await.map_err(|_| Problem::Unreachable)?;
        if !res.status().is_success() {
            return Err(Problem::Server(res.status().as_u16()));
        }
        let body = res.bytes().await.map_err(|_| Problem::Unreachable)?;
        let listed: Vec<FileInfo> = serde_json::from_slice(&body).map_err(|_| Problem::Server(502))?;
        let files: BTreeMap<String, FileInfo> = listed.into_iter().map(|info| (info.name.clone(), info)).collect();

        let mut state = self.state.lock().unwrap();
        let same = state.files.len() == files.len()
            && state.files.iter().zip(&files).all(|((a, old), (b, new))| a == b && old.etag == new.etag);
        if !same {
            state.changed_at = SystemTime::now();
        }
        state.files = files;
        state.listed_at = Some(Instant::now());

        // Kept files that have been saved again since (or deleted) are old versions now. Let
        // them go, so nothing serves stale bytes and the page doesn't call them downloaded.
        let stale: Vec<String> = state
            .kept
            .iter()
            .filter(|(name, kept)| state.files.get(*name).map(|info| &info.etag) != Some(&kept.info.etag))
            .map(|(name, _)| name.clone())
            .collect();
        for name in &stale {
            if let Some(kept) = state.kept.pop(name) {
                state.kept_bytes -= kept.info.size;
            }
        }
        drop(state);
        for name in &stale {
            self.tell(SessionFile::gone(name));
        }
        Ok(())
    }

    /// Bytes `start..=end` of a file. Both must lie inside it.
    pub async fn read(self: &Arc<Self>, info: &FileInfo, start: u64, end: u64) -> Result<Vec<u8>, Problem> {
        let mut bytes = Vec::with_capacity((end - start + 1) as usize);
        for index in start / BLOCK..=end / BLOCK {
            let block = self.block(info, index).await?;
            let block_start = index * BLOCK;
            let from = (start.max(block_start) - block_start) as usize;
            let to = ((end + 1).min(block_start + block.len() as u64) - block_start) as usize;
            bytes.extend_from_slice(&block[from..to]);
        }
        // A reader past the middle of a block is most likely reading straight through the
        // file, so start on the next block before it's asked for.
        if end % BLOCK >= BLOCK / 2 {
            self.prefetch(info, end / BLOCK + 1);
        }
        Ok(bytes)
    }

    /// One block: from a kept file, from recent reads, or else from the server.
    async fn block(&self, info: &FileInfo, index: u64) -> Result<Bytes, Problem> {
        let key = BlockKey::new(info, index);
        if let Some(block) = self.held(&key, true) {
            return Ok(block);
        }
        // Readers often want the same block at once (macOS reads several pieces of a file in
        // parallel). The first one fetches it, and the rest wait for that.
        let fetch = self.fetching.lock().unwrap().entry(key.clone()).or_default().clone();
        let result = fetch
            .get_or_init(|| async {
                let result = self.fetch_block(info, index).await;
                if let Ok(block) = &result {
                    self.remember(key.clone(), block.clone());
                }
                result
            })
            .await
            .clone();
        self.fetching.lock().unwrap().remove(&key);
        result
    }

    /// A block already in memory. `touch` counts it as just used.
    fn held(&self, key: &BlockKey, touch: bool) -> Option<Bytes> {
        let mut state = self.state.lock().unwrap();
        let kept = if touch { state.kept.get(&key.name) } else { state.kept.peek(&key.name) };
        if let Some(kept) = kept.filter(|kept| kept.info.etag == key.etag) {
            return kept.blocks.get(key.index as usize).cloned();
        }
        if touch {
            state.recent.get(key).cloned()
        } else {
            state.recent.peek(key).cloned()
        }
    }

    async fn fetch_block(&self, info: &FileInfo, index: u64) -> Result<Bytes, Problem> {
        let start = index * BLOCK;
        let end = (start + BLOCK).min(info.size) - 1;
        let res = self
            .client
            .get(file_url(&info.name))
            .header(RANGE, format!("bytes={start}-{end}"))
            .send()
            .await
            .map_err(|_| Problem::Unreachable)?;
        match res.status().as_u16() {
            206 => {}
            404 => return Err(Problem::NotFound),
            200 | 416 => return Err(Problem::Changed), // it got shorter since it was listed
            status => return Err(Problem::Server(status)),
        }
        // Every block has to come from the version being read, or two versions get mixed.
        if res.headers().get(ETAG).and_then(|etag| etag.to_str().ok()) != Some(info.etag.as_str()) {
            return Err(Problem::Changed);
        }
        let bytes = res.bytes().await.map_err(|_| Problem::Unreachable)?;
        if bytes.len() as u64 != end - start + 1 {
            return Err(Problem::Changed);
        }
        Ok(bytes)
    }

    fn remember(&self, key: BlockKey, block: Bytes) {
        let mut state = self.state.lock().unwrap();
        state.recent_bytes += block.len();
        if let Some(replaced) = state.recent.put(key, block) {
            state.recent_bytes -= replaced.len();
        }
        while state.recent_bytes > RECENT_LIMIT {
            match state.recent.pop_lru() {
                Some((_, block)) => state.recent_bytes -= block.len(),
                None => break,
            }
        }
    }

    fn prefetch(self: &Arc<Self>, info: &FileInfo, index: u64) {
        let key = BlockKey::new(info, index);
        if index >= blocks_in(info.size) || self.held(&key, false).is_some() || self.fetching.lock().unwrap().contains_key(&key) {
            return;
        }
        let (store, info) = (self.clone(), info.clone());
        tauri::async_runtime::spawn(async move {
            let _ = store.block(&info, index).await;
        });
    }

    /// "Download" in the app: the whole file into memory for the session, telling the page
    /// how it's going.
    pub async fn keep(self: &Arc<Self>, name: &str) {
        let info = match self.file(name, Duration::from_secs(1)).await {
            Ok(info) => info,
            Err(problem) => return self.fail(name, problem.to_string()),
        };
        if info.size > KEPT_LIMIT {
            let limit = KEPT_LIMIT / 1024 / 1024;
            return self.fail(name, format!("Too big to keep in memory (the limit is {limit} MB)"));
        }
        let download = Download { info: info.clone(), received: Arc::default(), cancelled: Arc::default() };
        let (received, cancelled) = (download.received.clone(), download.cancelled.clone());
        {
            let mut state = self.state.lock().unwrap();
            let already_kept = state.kept.peek(name).is_some_and(|kept| kept.info.etag == info.etag);
            if already_kept || state.downloads.contains_key(name) {
                return;
            }
            state.failures.remove(name);
            state.downloads.insert(name.to_string(), download);
        }
        self.tell(SessionFile::downloading(&info, 0));

        let mut blocks = Vec::new();
        for index in 0..blocks_in(info.size) {
            if cancelled.load(Ordering::Relaxed) {
                return; // forget() has told the page already
            }
            match self.block(&info, index).await {
                Ok(block) => {
                    let so_far = received.fetch_add(block.len() as u64, Ordering::Relaxed) + block.len() as u64;
                    blocks.push(block);
                    self.tell(SessionFile::downloading(&info, so_far));
                }
                Err(problem) => {
                    self.state.lock().unwrap().downloads.remove(name);
                    return self.fail(name, problem.to_string());
                }
            }
        }

        let mut let_go = Vec::new();
        {
            let mut state = self.state.lock().unwrap();
            state.downloads.remove(name);
            if cancelled.load(Ordering::Relaxed) {
                return;
            }
            if let Some(old) = state.kept.pop(name) {
                state.kept_bytes -= old.info.size; // an older version of the same file
            }
            // Make room by letting go of the files used least recently.
            while state.kept_bytes + info.size > KEPT_LIMIT {
                let Some((gone, kept)) = state.kept.pop_lru() else { break };
                state.kept_bytes -= kept.info.size;
                let_go.push(gone);
            }
            // The blocks live in the kept file from now on: drop their copies among recent reads.
            for index in 0..blocks.len() as u64 {
                if let Some(copy) = state.recent.pop(&BlockKey::new(&info, index)) {
                    state.recent_bytes -= copy.len();
                }
            }
            state.kept_bytes += info.size;
            state.kept.put(name.to_string(), Kept { info: info.clone(), blocks });
        }
        for name in &let_go {
            self.tell(SessionFile::gone(name));
        }
        self.tell(SessionFile::kept(&info));
    }

    /// Lets go of a file downloaded for the session, or stops it downloading.
    pub fn forget(&self, name: &str) {
        {
            let mut state = self.state.lock().unwrap();
            if let Some(download) = state.downloads.remove(name) {
                download.cancelled.store(true, Ordering::Relaxed);
            }
            if let Some(kept) = state.kept.pop(name) {
                state.kept_bytes -= kept.info.size;
            }
            state.failures.remove(name);
        }
        self.tell(SessionFile::gone(name));
    }

    fn fail(&self, name: &str, message: String) {
        let file = SessionFile::failed(name, message);
        self.state.lock().unwrap().failures.insert(name.to_string(), file.clone());
        self.tell(file);
    }

    /// Everything the page should show: files downloading, kept, or that failed to download.
    pub fn session(&self) -> Vec<SessionFile> {
        let state = self.state.lock().unwrap();
        let downloading = state
            .downloads
            .values()
            .map(|download| SessionFile::downloading(&download.info, download.received.load(Ordering::Relaxed)));
        let kept = state.kept.iter().map(|(_, kept)| SessionFile::kept(&kept.info));
        downloading.chain(kept).chain(state.failures.values().cloned()).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_blocks() {
        assert_eq!(blocks_in(0), 0);
        assert_eq!(blocks_in(1), 1);
        assert_eq!(blocks_in(BLOCK), 1);
        assert_eq!(blocks_in(BLOCK + 1), 2);
    }

    #[test]
    fn escapes_names_in_urls() {
        assert_eq!(file_url("a b#1?.png"), format!("{SERVER}/files/a%20b%231%3F.png"));
        assert_eq!(file_url("Bridge1.JPG"), format!("{SERVER}/files/Bridge1.JPG"));
    }

    // The tests below talk to the real server, so they're skipped unless asked for. With the
    // server running (npm run server) and its sample files in place:
    //   cargo test --lib -- --ignored

    async fn whole_file(name: &str) -> Vec<u8> {
        reqwest::get(file_url(name)).await.unwrap().bytes().await.unwrap().to_vec()
    }

    #[tokio::test]
    #[ignore = "needs the server running"]
    async fn reads_match_the_file_wherever_they_start_and_end() {
        let store = Store::new();
        let info = store.file("PostcardsFromTokyo.mov", Duration::ZERO).await.unwrap();
        let file = whole_file(&info.name).await;
        let size = info.size;
        for (start, end) in [(0, 0), (0, 99), (BLOCK - 10, BLOCK + 10), (30_000_000, 30_000_099), (size - 100, size - 1)] {
            let bytes = store.read(&info, start, end).await.unwrap();
            assert_eq!(bytes, &file[start as usize..=end as usize], "bytes {start}-{end}");
        }
    }

    #[tokio::test]
    #[ignore = "needs the server running"]
    async fn keeps_a_whole_file_then_lets_it_go() {
        let store = Store::new();
        let heard = Arc::new(Mutex::new(Vec::new()));
        let log = heard.clone();
        store.on_change(move |file| log.lock().unwrap().push((file.status, file.received)));

        store.keep("HanedaSkyline.JPG").await;
        let info = store.file("HanedaSkyline.JPG", Duration::ZERO).await.unwrap();
        assert_eq!(store.read(&info, 0, info.size - 1).await.unwrap(), whole_file(&info.name).await);
        let statuses = heard.lock().unwrap().clone();
        assert_eq!(statuses.first(), Some(&("downloading", 0)));
        assert_eq!(statuses.last(), Some(&("kept", info.size)));
        assert_eq!(store.session().len(), 1);

        store.forget("HanedaSkyline.JPG");
        assert!(store.session().is_empty());
        assert_eq!(heard.lock().unwrap().last().map(|(status, _)| *status), Some("gone"));
    }
}
