import { convertFileSrc } from "@tauri-apps/api/core";

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
 * ISO date; `etag` changes with every save. */
export type FileEntry = { name: string; type: string; size: number; modified: string; etag: string; version: string };
export type Version = {name: string, id: string};

// Types the server can resize (keep in sync with RESIZABLE in server/src/routes/files.ts).
const RESIZABLE = ["image/png", "image/jpeg", "image/webp"];

/** Whether the server can send a resized copy of this file. */
export const isResizable = (file: FileEntry) => RESIZABLE.includes(file.type);

/** Whether a file is a video, which plays as it streams instead of downloading first. */
export const isVideo = (file: FileEntry) => file.type.startsWith("video/");

/** URL for a file. With a width and/or height, asks the server for a copy that fits within them. */
export function fileUrl(file: FileEntry, width?: number, height?: number, version?: string): string {
  const base = `${FILES}/${encodeURIComponent(file.name)}`;
  if (!isResizable(file) || (!width && !height)) return base;
  const params = new URLSearchParams();
  if (width) params.set("w", String(width));
  if (height) params.set("h", String(height));
  if (version) params.set("V", String(version)); // V is intententionally capitalized for Versions
  return `${base}?${params}`;
}


/** Every file in the server's folder, with its type and when it was last saved. */
export async function listFiles(): Promise<FileEntry[]> {
  const res = await fetch(FILES);
  if (!res.ok) throw new Error(failureMessage(res));
  return res.json();
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
      reject(new Error(`The server answered ${request.status}`));
    };
    request.onerror = () => reject(new Error("Couldn't reach the server"));
    request.send(file);
  });
}

/** Every saved version of one file. (GET /files/:name/versions isn't on the server yet.) */
export async function listVersions(name: string): Promise<Version[]> {
  const res = await fetch(`${FILES}/${encodeURIComponent(name)}/versions`);
  if (!res.ok) throw new Error(failureMessage(res));
  return res.json();
}