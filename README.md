<p align="center">
  <img src="public/sunkiss.svg" width="120" alt="The Sunkiss logo: a white eight-point sun over an orange ground, on a blue sky">
</p>

<h1 align="center">Sunkiss</h1>

<p align="center">
  Version control for designers: one shared home for your design files, where every save is a version and nothing gets lost.
</p>

<p align="center">
  <a href="#what-it-does">What it does</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#running-it">Running it</a> ·
  <a href="#the-code">The code</a> ·
  <a href="PROJECT.md">Plan and decisions</a>
</p>

---

Designers get the parts of git that matter, without git. Files live on a server and stream to the app as they're looked at, so nothing piles up on your disk. Saving a file again is a *kiss*: it becomes the file's next version, and the one before is kept. You can look back through every version, compare one against the current one, and bring an earlier one back. Other apps, Photoshop and Premiere among them, open the files through a drive that appears in Finder.

It's a desktop app for the Mac, built with Tauri and React, with a small Node server behind it. The design is the logo's three colours, each with a job: **blue** is for what you can do, **orange** for what's chosen, and **white** for the surfaces. Headings are set in Mincho, the serif of Japanese print.

## What it does

**Browse.** The Home screen is a grid of *prints*: thumbnails with a white border, like photos on a table. Filter them by kind (images, videos, design files), sort them, size them, star the ones you keep coming back to, or type to narrow the list. Drop files anywhere on the page to upload them.

**Open.** A print opens on the stage, streaming in at the size the window needs. Beside it is the file's history: every version, newest first. Pick one to see it; drag the divider across to compare it with the current version; restore it, or drop a file on the history to save it as the next version. Under the stage, a timeline runs sideways through every file, grouped by day.

**Kiss it in.** The Upload screen takes anything: drop files in, or choose them, and *Kiss it in*. A file whose name is already taken can go in beside it under a new name, or as its next version. Frames in a Figma file can be snapshotted straight in, and snapshotted again later, so what changed in Figma shows up in the file's history.

**Layered files.** Photoshop, Illustrator, Sketch, XD and Figma files get a preview from the picture they carry of themselves, and their layers are listed under the stage. With an earlier version on the stage, the list says what happened to each layer since: changed, removed, or added. That's the diff for a design file: not pixels, but what the designer did.

**Kisses.** A screen for how often things were kissed in. The last twelve months as a line a month, with a sun on every day something was saved, bigger and brighter the more. The files kissed most, as prints. And every kiss, by day.

**Other apps.** In the desktop app, every file is also in `~/Sunkiss` in Finder, through a drive that lives inside the app and takes no space on disk. *Open in Photoshop* (or whichever app is chosen in Settings) opens the file from there, prints can be dragged out of the window into other apps, and *Download* keeps a file in memory for the session so it opens at once, even with the server away.

**Small things.** The window is frosted glass. `/` focuses the search, `←` and `→` step through files while one is open, `Esc` goes back to the grid. Right-clicking a print opens its actions as a cluster of chips at the pointer. Light and dark follow the system.

## How it works

```
 the Sunkiss app (Tauri + React)                      the server (Hono)
   list, prints, previews  ── GET /files ───────────►  server/src/routes/files.ts
   open a file             ── GET /files/:name ─────►    the current version, streamed,
   an earlier version      ── GET /files/:name?V=… ─►    Range requests for video
   kiss it in              ── POST …/versions ──────►    If-Match: no version is ever
   restore                 ── POST …/restore ───────►    overwritten by accident
   the Kisses screen       ── GET /activity ────────►  every version of every file
   Figma frames            ── POST /figma/… ────────►  rendered by Figma, saved here
```

- **The server** (`server/`) is Node with Hono. Files sit in `server/files`; every earlier version of a file is kept beside it in `.versions/<name>/`. Previews are resized with `sharp`; layered design files are read for their flattened picture and their layer tree. A save says which version it started from (`If-Match`) and is refused if another save got in first, so nothing is lost by accident.
- **The app** (`src/`) is React and TypeScript. In the desktop app the page doesn't fetch files from the server itself: it asks for `sunkiss://localhost/files/…`, and Rust answers from memory, fetching only the blocks it doesn't have.
- **The Rust side** (`src-tauri/src/`) draws the frosted glass, holds file bytes in memory in 1 MB blocks for the window and the drive alike, serves the drive over NFS on localhost and mounts it at `~/Sunkiss`, and talks to Finder.

The plan, the decisions behind it and what's next are in [PROJECT.md](PROJECT.md).

## Running it

You'll need Node, Rust and the Tauri prerequisites for macOS (Xcode's command-line tools). The drive, the glass and the Finder integration are Mac-only; the rest runs in any browser.

```bash
npm install
```

```bash
./dev.sh
```

That starts the server and the desktop app together, with each one's output labelled; Ctrl+C stops both. To run them apart:

```bash
npm run server
```

```bash
npm run tauri dev
```

The server listens on port 8787 and the app's page on 1420; opening http://localhost:1420 in a browser gives you the app without the Rust side. `curl http://localhost:8787/files` lists what's stored.

## The code

| Where | What |
|---|---|
| `src/Components/` | The screens and their parts: `Home`, `Upload`, `Kisses`, `Settings`; `Print`, `Stage`, `VersionTree`, `Compare`, `Timeline`, `Layers`, `MagnetMenu`… |
| `src/App.css` | The whole look, in one sheet, with the reasons in its comments |
| `src/api.ts` | Every call to the server, and the types it answers with |
| `src/hooks/` | Loading the file list, a file's history, the kisses, a streamed preview |
| `src/drive.ts`, `src/figma.ts`, `src/stars.ts`, `src/sessionCache.ts` | The drive, Figma, stars, and files kept for the session |
| `server/src/routes/` | `files.ts` (list, stream, versions, restore), `activity.ts` (every kiss), `figma.ts` (snapshots) |
| `server/src/design.ts` | Reading layered design files: previews and layer trees |
| `src-tauri/src/` | `lib.rs` (the window, `sunkiss://`), `store.rs` (bytes in memory), `drive.rs` (NFS), `finder.rs` |
| `file-provider/` | A Finder File Provider extension, built and waiting on code signing |

## Why

Figma has version history; Abstract did version control for Sketch. Sunkiss is for the files in between: the images, videos, PSDs and exports that live in folders and get overwritten. It's also a design-engineering project, which is why the interface gets as much care as the server: the prints, the stage, the history beside it, and the kisses are the point.
