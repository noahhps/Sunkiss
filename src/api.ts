import { convertFileSrc } from "@tauri-apps/api/core";
import { dataMode, fixtureFiles, fixtureVersions, isFixture, pictureFor } from "./dev/worstCase";

// Where the server is, and how to build URLs for its files.
export const SERVER = "http://localhost:8787";

/** Whether the page is running in the desktop app (as opposed to a plain browser). */
export const IN_DESKTOP_APP = "__TAURI_INTERNALS__" in window;

// In the desktop app, files come through the app's own sunkiss:// address instead:
// src-tauri/src/lib.rs fetches them from the server in Rust and hands them to the page.
// (convertFileSrc spells that address the way each OS needs.) A plain browser has no
// Rust side, so there the page asks the server directly.
const BASE = IN_DESKTOP_APP ? convertFileSrc("", "sunkiss").replace(/\/$/, "") : SERVER;

/** Where the files are: the list, and each file by name under it. */
export const FILES = `${BASE}/files`;

/** What to tell the user when the server answers with an error. In the desktop app, 502
 * means the server didn't answer at all (see serve_file in src-tauri/src/lib.rs). */
export const failureMessage = (res: Response) =>
  res.status === 502 ? "Couldn't reach the server" : `The server answered ${res.status}`;

/** A file in the server's folder. `size` is in bytes; `modified` is when it was last saved, as an
 * ISO date; `etag` changes with every save. `version` is the id of the current version, and
 * `versions` counts it and the earlier ones (listVersions lists them). */
export type FileEntry = {
  name: string;
  type: string;
  size: number;
  modified: string;
  etag: string;
  version: string;
  versions: number;
};

/** One saved version of a file: its id (what ?V= takes), size, when it was saved, its ETag, and
 * whether it's the current one. */
export type Version = { id: string; size: number; modified: string; etag: string; current: boolean };

// Types the server can resize (keep in sync with RESIZABLE in server/src/routes/files.ts).
const RESIZABLE = ["image/png", "image/jpeg", "image/webp"];

/** Whether the server can send a resized copy of this file. */
export const isResizable = (file: FileEntry) => RESIZABLE.includes(file.type);

/** Whether a file is a video, which plays as it streams instead of downloading first. */
export const isVideo = (file: FileEntry) => file.type.startsWith("video/");

/** Whether the page can show the file itself: an image or a video. Anything else (a PSD, a
 * PDF, a Figma export) is still a file in Sunkiss, shown by its kind instead of a picture. */
export const isViewable = (file: FileEntry) => file.type.startsWith("image/") || isVideo(file);

/** A file's kind, from its name, for labels: "PSD", "PNG", or "FILE" when the name doesn't say. */
export const kindLabel = (name: string) => {
  const dot = name.lastIndexOf(".");
  return (dot > 0 ? name.slice(dot + 1) : "file").slice(0, 4).toUpperCase();
};

/** URL for a file. With a width and/or height, asks the server for a copy that fits within them.
 * With a version (an id from listVersions), it's that version of the file. */
export function fileUrl(file: FileEntry, width?: number, height?: number, version = file.version): string {
  // Dev only: a fixture file shows the picture it borrows (see src/dev/worstCase.ts).
  if (import.meta.env.DEV && isFixture(file.name)) {
    const picture = pictureFor(file.name);
    if (typeof picture === "string") return picture;
    if (!picture) return `${FILES}/${encodeURIComponent(file.name)}`; // not on the server: won't load
    return serverUrl(picture, width, height, picture.version);
  }
  return serverUrl(file, width, height, version);
}

function serverUrl(file: FileEntry, width: number | undefined, height: number | undefined, version: string): string {
  const resized = isResizable(file) && Boolean(width || height);
  const earlier = version !== file.version;
  // An earlier version's whole file comes straight from the server, the way uploads go. In the
  // desktop app Rust answers for current files from its memory and passes anything else on
  // whole, so a video player asking for "bytes=0-" would have the whole file held in memory.
  const base = earlier && !resized ? `${SERVER}/files` : FILES;
  const params = new URLSearchParams();
  if (resized && width) params.set("w", String(width));
  if (resized && height) params.set("h", String(height));
  // V is intentionally capitalized for Versions. A preview always says which version it's of,
  // so a new version gets a new address and the browser can't show the old one from its cache.
  // The current file itself goes without: that's the address Rust answers from memory.
  if (version && (resized || earlier)) params.set("V", version);
  const query = params.toString();
  return `${base}/${encodeURIComponent(file.name)}${query ? `?${query}` : ""}`;
}


/** Every file in the server's folder, with its type and when it was last saved. */
export async function listFiles(): Promise<FileEntry[]> {
  const res = await fetch(FILES);
  if (!res.ok) throw new Error(failureMessage(res));
  const list: FileEntry[] = await res.json();
  return import.meta.env.DEV && dataMode() !== "demo" ? fixtureFiles(list) : list;
}


/** Why a save didn't go through: a file by that name is already there ("exists"), the file
 * changed since the version being replaced ("changed"), or it's gone ("missing"). `etag` is
 * the file's current version, when there is one. */
export class Conflict extends Error {
  constructor(
    readonly reason: "exists" | "changed" | "missing",
    readonly etag?: string,
  ) {
    super(reason === "exists" ? "Already in Sunkiss" : reason === "changed" ? "Changed since" : "No longer in Sunkiss");
  }
}

/**
 * Sends a file to the server (POST /files/:name/versions): as a new file, or, given
 * `replacing` (the ETag of the version it replaces), as that file's new version. Reports how
 * many bytes have gone as it goes.
 *
 * Straight to the server even in the desktop app: Tauri hands a sunkiss:// request to Rust
 * whole, so a big video would have to fit in memory first. And XMLHttpRequest rather than
 * fetch, because only it reports upload progress.
 */
export function uploadFile(
  file: Blob,
  name: string,
  replacing: string | null,
  onProgress: (sent: number) => void,
): Promise<FileEntry> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${SERVER}/files/${encodeURIComponent(name)}/versions`);
    // Saying which: a new file (only if the name is free), or a new version of this one.
    if (replacing) request.setRequestHeader("If-Match", replacing);
    else request.setRequestHeader("If-None-Match", "*");
    request.upload.onprogress = (event) => onProgress(event.loaded);
    request.onload = () => {
      if (request.status === 201) return resolve(JSON.parse(request.responseText));
      if (request.status === 412) {
        const { error, etag } = JSON.parse(request.responseText);
        return reject(new Conflict(error, etag));
      }
      // A name the server won't take (too long, or not a plain name) comes back as 400.
      if (request.status === 400) return reject(new Error("The server won't take this name. Try a shorter one"));
      reject(new Error(`The server answered ${request.status}`));
    };
    request.onerror = () => reject(new Error("Couldn't reach the server"));
    request.send(file);
  });
}

/** Every saved version of one file, newest first (GET /files/:name/versions). */
export async function listVersions(name: string): Promise<Version[]> {
  if (import.meta.env.DEV && isFixture(name)) return fixtureVersions(name);
  const res = await fetch(`${FILES}/${encodeURIComponent(name)}/versions`);
  if (!res.ok) throw new Error(failureMessage(res));
  return res.json();
}

/** Makes an earlier version the current one again (POST /files/:name/restore?V=…). It's saved
 * as a new version, so the one it replaces is kept too. Fails with a Conflict when the file
 * changed since `file` was listed. Straight to the server, as uploads go. */
export async function restoreVersion(file: FileEntry, version: Version): Promise<FileEntry> {
  const url = `${SERVER}/files/${encodeURIComponent(file.name)}/restore?V=${encodeURIComponent(version.id)}`;
  const res = await fetch(url, { method: "POST", headers: { "If-Match": file.etag } }).catch(() => {
    throw new Error("Couldn't reach the server");
  });
  if (res.status === 412) {
    const { error, etag } = await res.json();
    throw new Conflict(error, etag);
  }
  if (res.status !== 201) throw new Error(`The server answered ${res.status}`);
  return res.json();
}