# Sunkiss

> Git for designers: one shared, cloud-first home for design files, where every save is a
> version and nothing gets lost.

_Last updated: 2026-10-01_

## The idea

Designers keep their images, SVGs and PDFs in one shared place. Files live on the server;
the desktop app streams them and never keeps its own copies. Every save becomes a new
version. When two people save conflicting changes, the server keeps both and a person
decides which one wins. Older versions are stored compressed.

The desktop app (Tauri + React) is where you browse, preview, compare and resolve.

## Decisions so far

| Area | Decision | Why |
|---|---|---|
| App | Tauri 2 + React + TypeScript (Vite) | Desktop app with a web UI; TypeScript is the design-engineering stack |
| Server | Node + Hono + TypeScript, in `server/` (npm workspace) | Same language on both sides; shared types later |
| Storage | Server's local disk first, behind a `BlobStore` interface. S3-compatible storage (MinIO, then Cloudflare R2) later | Switching storage shouldn't touch the routes |
| Files on clients | None on disk: files stream in as they're viewed, or are held in memory for the session ("Available this session") | The server is the single source of truth; nothing to sync or clean up |
| Saving | `POST /files/:name/versions`: commit and push are one step | Each save creates a new version |
| Conflicts | Save both, mark them as a conflict, a person picks | Timestamps can't decide which edit should win |
| Live updates | Server-Sent Events | One-way "file changed" messages; plain HTTP |
| Previews | Smaller copies made with `sharp` | Lists load fast; the full file downloads only when opened |
| Streaming | HTTP Range requests; in the desktop app, through the app's own `sunkiss://` address, answered in Rust | Video plays and seeks without a full download; Rust is where sign-in will attach later |
| Files in other apps | The Sunkiss drive: a localhost NFS server inside the app (`nfsserve`), mounted at `~/Sunkiss` | Any app can open the files, nothing is stored on the device, and users install nothing |

## Open questions

- **Where does editing happen?** Inside Sunkiss, or in Photoshop, Figma and other apps? The
  second needs a virtual file system (like LucidLink). The read-only Sunkiss drive is the
  first step; see "Streaming files to the device" below.
- **Who is it for?** Just you, a small team, or a whole company? This decides how much
  account and permission work there is.
- **What does "compressed" mean for each file type?**
  - SVG: gzip or brotli (70–90% smaller).
  - PNG and JPEG: already compressed. The options are lossless WebP, cheaper storage, or a
    deliberate lower quality.
- **Keep both, or lock?** For images, locking ("Alex is editing this") avoids conflicts
  entirely. Game studios do this for image files.
- **Folders or a flat list?** Do files belong to projects or folders?

## How it fits together

```
 Sunkiss app (Tauri + React)                     server (Hono)
   file list, previews  ── GET /files ─────────►  routes
   open a file          ── GET /files/:name ────►   │
   save a version       ── POST …/versions ─────►   ├─ SQLite: files + versions (who, when, based on)
   live updates         ◄── GET /events (SSE) ───   └─ BlobStore: file bytes named by hash
                                                        (disk now, S3 / R2 later)
```

In the desktop app the page doesn't call the server itself: it asks for
`sunkiss://localhost/files/…`, and Rust (`src-tauri/src/lib.rs`) passes the request on.

## Streaming files to the device

Files take no space on the device. They stream in as they're used, inside Sunkiss and in any
other app through the Sunkiss drive (`~/Sunkiss` in Finder), and "Download" holds a file in
memory for the session instead of writing it to disk.

```
 Photoshop · Premiere · Preview · scripts            the Sunkiss window
        │ read(offset, length)                        │ sunkiss://localhost/files/…
        ▼                                             ▼
 macOS NFS client ── ~/Sunkiss               serve_file (lib.rs)
        │ READ                                        │
        ▼                                             │
 drive.rs (nfsserve, on localhost) ─────┐  ┌──────────┘
                                        ▼  ▼
                       store.rs: file bytes in memory, in 1 MB blocks
                          kept files (Download) · recent reads · read-ahead
                                        │ only what isn't in memory
                                        ▼
                    server: GET /files/:name  Range: bytes=…  (206, ETag)
```

| Layer | What it does | Where |
|---|---|---|
| Range requests | `GET /files/:name` answers `Range: bytes=…` with `206 Partial Content`, so a video starts playing, and jumps around, without downloading the whole file. Originals are sent `Cache-Control: no-store`, which keeps them out of the browser's disk cache. Previews carry an `ETag` and get a `304` instead of being resized again. `GET /files` lists each file's ETag too | `server/src/routes/files.ts` |
| The store | Sunkiss's memory of file bytes, shared by the window and the drive. Files are fetched in 1 MB blocks (reading a few bytes fetches the whole block: that's the read-ahead), and every block is checked to come from the version being read (`ETag`). Recent reads stay up to 128 MB; downloaded files up to 256 MB; least recently used go first | `src-tauri/src/store.rs` |
| `sunkiss://` | In the desktop app the page asks for `sunkiss://localhost/files/…`, answered from the store. Tauri hands the webview whole bodies, not streams, so each answer is capped at 4 MB; video players simply ask for the next slice | `src-tauri/src/lib.rs` |
| Session downloads | "Download" asks Rust to keep the whole file in the store; the page mirrors its progress (`session-file` events). The file then opens instantly, in Sunkiss or from the drive, even with the server down. In a plain browser (no Rust) the page keeps a `Blob` instead | `src/sessionCache.ts`, `src/Components/DownloadButton.tsx` |
| The Sunkiss drive | A read-only NFS server inside the app (`nfsserve`), mounted at `~/Sunkiss` with macOS's own `mount_nfs`: no admin password, nothing for users to install. Unmounted when the app quits; a mount left behind by a crash is cleared on the next launch | `src-tauri/src/drive.rs` |
| Getting to the drive | On a file's stage: Show in Finder, and "Open in Photoshop" (the app chosen for images or videos in Settings, else the file's default app) with ▾ for any other app. Thumbnails drag out of the window into other apps as the file in the drive. A menu bar item keeps Sunkiss, and the drive, running after the window closes, with Open Sunkiss Folder | `src-tauri/src/finder.rs`, `src/drive.ts`, `src/preferences.ts`, `src/Components/FileActions.tsx` |

Things to know:

- **"0 bytes" is about files, not memory.** What's read lives in RAM (Sunkiss's store, and
  macOS's own cache of the drive), and like any memory it can be paged out to swap.
  Measured: reading all ~95 MB of the sample files through the drive, twice, didn't change
  the Mac's free disk space.
- **Finder still shows full sizes on the drive.** macOS works disk use out from a file's size,
  whatever the drive reports, so `du` and Get Info show the size, not zero.
- **Sunkiss has to be running** for the drive's files to open, because the drive lives inside
  it. The mount is `soft`, so if Sunkiss goes away, apps get a read error instead of hanging.
  Keeping Sunkiss alive in the menu bar when its window closes would remove most of this.
- **Previews are cached on purpose.** Small resized copies are worth keeping; originals never are.
- **Only reads so far.** Saving into the drive, and `POST …/versions` through `sunkiss://`,
  come next (see below).

### Next for the drive

1. **A cache policy for video.** RAM-only keeps "0 bytes" literally true, but scrubbing a big
   video over a real network needs more than 128 MB of recent blocks. An opt-in "Keep on this
   Mac" disk cache, with a size cap, is the honest trade-off (LucidLink keeps a local cache for
   the same reason).
2. **Saves become versions.** Photoshop saves by writing a temporary file and renaming it over
   the original. The drive holds those writes in memory, treats the rename (plus a moment of
   quiet) as "save finished", and uploads `POST /files/:name/versions` with `If-Match`;
   conflicts keep both. Finder's `.DS_Store` and `._*` files get refused.
3. **Folders**, once the server has them (see the open question above), and maybe a read-only
   `.versions/` folder showing past versions.
4. **Sunkiss in Finder's sidebar: built, waiting on signing.** The File Provider extension is
   in `file-provider/` (Swift, `NSFileProviderReplicatedExtension`, built by
   `file-provider/build.sh` without Xcode), the packaged app carries it in `Contents/PlugIns`,
   and `src-tauri/src/file_provider.rs` registers it at launch. Tested by driving the extension
   directly: it lists the files, tracks changes and downloads byte-identical copies. But macOS
   only runs a File Provider signed with a real Apple identity (a team ID): signed ad hoc, it's
   registered yet refused ("The application cannot be used right now"). To finish it: an Apple
   Developer identity (Xcode, Settings, Accounts), then
   `SIGN_IDENTITY="Apple Development: …" npm run tauri build` with the same identity in
   `bundle > macOS > signingIdentity`. Unlike the drive, it keeps opened files on disk until
   macOS needs the space.
5. **PSD previews in the window.** PSDs already stream through the drive (macOS opens them from
   it), but the server doesn't know the type, and `sharp` can't read them, so a "preview" would
   be the whole file. PSDs saved with Maximize Compatibility (Photoshop's default) carry a
   flattened image the server could read for previews.

Why NFS and not the alternatives: WebDAV (macOS's built-in client) is slow with Finder and
copies files to a local cache when they're opened; macFUSE makes every user install a system
extension; and File Provider, the polished option, means Swift, Xcode and code signing first.
`nfsserve` was written for exactly this (Hugging Face's `hf-mount` uses it), and it keeps
everything in Rust.

## Where things stand

What exists today:

- `server/src/index.ts`: the Hono app, `GET /health`, and `/files` mounted from the route file.
- `server/src/routes/files.ts`:
  - `GET /files` lists every file's name and type.
  - `GET /files/:name` returns one file, with a check that blocks `../` paths.
  - Placeholder routes for delete and update, not built yet.
- `src/App.tsx`: type a file name and submit, and the image appears below, or "No image named …".
- `dev.sh`: runs the server and the app together; Ctrl+C stops both.

Known issues, fix these first:

- [ ] Rename `server/Files` to `server/files`. It only works now because macOS ignores upper/lowercase.
- [ ] Add `server/files` to `.gitignore`.
- [ ] Make the placeholder routes return `501 Not Implemented`, and use method-based paths
      (`DELETE /files/:name`, `POST /files/:name/versions`).
- [ ] Put the name check in one `isSafeName` helper, have `/:name` use `typeOf`, and remove unused imports.
- [ ] Create the files folder when the server starts.
- [ ] `git init` and make a first commit. The project isn't a git repository yet.

## Data model (target)

- **Blobs**: a file's bytes, saved on disk under their SHA-256 hash (e.g. `storage/ab/abcdef…`).
  A blob is never changed, and identical files are stored once.
- **Files**: `id`, `name`, project or folder (see open questions), `currentVersionId`, `createdAt`.
- **Versions**: `id`, `fileId`, `blobHash`, `basedOn` (the version it was edited from), `author`,
  `createdAt`, `status` (`current` / `conflict` / `archived`), `compressed`, `size`, `contentType`.

A save creates a blob, if the bytes are new, plus a new row in versions.

## API (target)

| Route | What it does |
|---|---|
| `GET /health` | Is the server up? |
| `GET /files` | List files: name, type, size, ETag, current version id, number of versions |
| `GET /files/:name` | The current version, streamed, with an `ETag` header |
| `GET /files/:name?w=400` | A resized preview |
| `GET /files/:name/versions` | Version history, newest first: id, size, when saved, ETag, whether current |
| `GET /files/:name?V=<id>` | One specific version (works with `?w=` and Range too) |
| `POST /files/:name/versions` | Save. Body: the bytes. `If-Match`: the version you started from. Returns `201 { version, conflict }` |
| `POST /files/:name/restore?V=<id>` | Make an earlier version current again, saved as a new version (`If-Match`, like a save) |
| `POST /files/:name/resolve` | Pick which version wins a conflict |
| `DELETE /files/:name` | Delete (or archive) a file |
| `GET /events` | Live stream of changes (Server-Sent Events) |

## Milestones

### 0. Foundations
- [ ] Everything under "Known issues" above
- [ ] CORS on the server (`hono/cors`), so the app can `fetch` from it
- [ ] Stream files from disk (`createReadStream`) instead of `readFile`

### 1. Browse and preview
- [ ] Show the `GET /files` list in the app (TanStack Query)
- [ ] Click a file to preview it
- [ ] Thumbnails with `sharp` (`?w=`), saved after the first request
- [ ] Show SVGs safely: in `<img>`, never as raw HTML

### 2. Upload and versions
- [ ] `server/src/storage.ts`: `BlobStore` and `DiskStore` (hash names, subfolders, write to a temp file then rename)
- [ ] SQLite + Drizzle: `files` and `versions` tables
- [x] `POST /files/:name/versions`: `If-None-Match: *` adds a file, `If-Match: <ETag>` saves a new
      version; either answers `412` if that's not true any more. Written to a temporary file, then
      renamed into place. For now the replaced version is just moved to `.versions/<name>/`, until
      the `BlobStore` and the `versions` table exist
- [x] `GET /files/:name/versions` history, `GET /files/:name?V=<id>` for one version, and
      `POST /files/:name/restore?V=<id>`. For now a version is a file: the current one in
      `files/`, earlier ones in `.versions/<name>/`, and a version's id is its ETag without the
      quotes (size and modified time, which a version keeps when it moves). Restoring copies the
      version (an APFS clone, so no extra space) and saves it like any other save. A save that
      another save overtook while uploading is refused (`412`) instead of replacing a version its
      sender never saw
- [x] App: drag and drop to upload (the Upload screen: "Kiss it in"; Keep both or Replace when a
      name is taken; this session's images in a carousel, three at a time)
- [x] App: the file's history beside the stage (`VersionTree.tsx`): every version with a
      thumbnail, pick one to see it, restore it, or save a new version (choose a file, or drop
      one on the history). Prints show how many versions a file has. A Refresh button, top left,
      loads the list again

### 3. Conflicts
- [ ] Detect a save based on an old version: keep both, return `conflict: true`
- [ ] App: a conflict banner, side-by-side view, "Keep this one"
- [ ] Archive the losing version; compress it according to its file type

### 4. Live updates
- [ ] `GET /events` with `streamSSE`
- [ ] App: `EventSource`, refetch when something changes, show "Updated by …" (until then, the
      Refresh button)

### 5. Compare
- [ ] Side by side, an overlay slider, and a pixel diff (`pixelmatch`)

### 6. People
- [ ] Accounts and sign-in; who saved what; permissions
- [ ] Comments pinned to a spot on an image

### 7. Cloud
- [ ] `S3Store`, tested against MinIO, then Cloudflare R2
- [ ] Deploy the server with HTTPS and environment-based config
- [x] Large files: range requests (see "Streaming files to the device")
- [ ] Resumable uploads

### Later, maybe
- Editing inside the app without touching originals (edits saved as a list of steps)
- Import from Figma (Figma's web API)
- Access for AI agents (an MCP server)
- Saving from other apps straight into the Sunkiss drive (see "Next for the drive")

## Portfolio angle

- **The design-engineering parts are the ones people see and use:** the conflict screen,
  compare views, the version timeline, calling things "checkpoints" instead of "commits",
  polish and speed. The backend supports those; on its own it doesn't show design skill.
- **Finish a smaller piece well.** Milestones 0–5, polished, make a stronger portfolio piece
  than 0–7 done roughly.
- **Write it up.** A short case study (the problem, key decisions like keeping both
  versions, tradeoffs, what's next) and a 60–90 second demo video.
- **Know what exists.** Figma's version history and branching, and Abstract (version control
  for Sketch). Say what Sunkiss does differently.

## Running it

```bash
npm install
```

```bash
./dev.sh
```

`./dev.sh` runs the server and the app together. Or run them separately: `npm run server`
(port 8787) and `npm run tauri dev` (the app, with Vite on 1420). `npm run build` checks the
frontend compiles, and `curl http://localhost:8787/files` lists the stored files.

## Learning resources

| Topic | Where |
|---|---|
| Hono (routing, streaming helpers, CORS) | https://hono.dev |
| Node files and streams | https://nodejs.org/api/fs.html · https://nodejs.org/api/stream.html |
| ETag / If-Match (conflict detection) | https://developer.mozilla.org/en-US/docs/Web/HTTP/Conditional_requests |
| Server-Sent Events | https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events |
| CORS | https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS |
| TanStack Query | https://tanstack.com/query |
| sharp | https://sharp.pixelplumbing.com |
| Drizzle ORM | https://orm.drizzle.team |
| pixelmatch | https://github.com/mapbox/pixelmatch |
| Tauri 2 | https://v2.tauri.app |
