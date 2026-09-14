# Sunkiss

> Git for designers: one shared, cloud-first home for design files, where every save is a
> version and nothing gets lost.

_Last updated: 2026-09-13_

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
| Files on clients | None kept, only the browser's temporary cache | The server is the single source of truth |
| Saving | `POST /files/:name/versions`: commit and push are one step | Each save creates a new version |
| Conflicts | Save both, mark them as a conflict, a person picks | Timestamps can't decide which edit should win |
| Live updates | Server-Sent Events | One-way "file changed" messages; plain HTTP |
| Previews | Smaller copies made with `sharp` | Lists load fast; the full file downloads only when opened |

## Open questions

- **Where does editing happen?** Inside Sunkiss, or in Photoshop, Figma and other apps? The
  second needs a virtual file system (like LucidLink), which is a much bigger project.
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
| `GET /files` | List files: name, type, current version, preview URL |
| `GET /files/:name` | The current version, streamed, with an `ETag` header |
| `GET /files/:name?w=400` | A resized preview |
| `GET /files/:name/versions` | Version history |
| `GET /files/:name/versions/:id` | One specific version |
| `POST /files/:name/versions` | Save. Body: the bytes. `If-Match`: the version you started from. Returns `201 { version, conflict }` |
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
- [ ] `POST /files/:name/versions` with `If-Match` / `ETag`
- [ ] `GET /files/:name/versions` history
- [ ] App: drag and drop to upload; a version timeline

### 3. Conflicts
- [ ] Detect a save based on an old version: keep both, return `conflict: true`
- [ ] App: a conflict banner, side-by-side view, "Keep this one"
- [ ] Archive the losing version; compress it according to its file type

### 4. Live updates
- [ ] `GET /events` with `streamSSE`
- [ ] App: `EventSource`, refetch when something changes, show "Updated by …"

### 5. Compare
- [ ] Side by side, an overlay slider, and a pixel diff (`pixelmatch`)

### 6. People
- [ ] Accounts and sign-in; who saved what; permissions
- [ ] Comments pinned to a spot on an image

### 7. Cloud
- [ ] `S3Store`, tested against MinIO, then Cloudflare R2
- [ ] Deploy the server with HTTPS and environment-based config
- [ ] Large files: range requests and resumable uploads

### Later, maybe
- Editing inside the app without touching originals (edits saved as a list of steps)
- Import from Figma (Figma's web API)
- Access for AI agents (an MCP server)
- A virtual file system so other apps can edit files directly

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
