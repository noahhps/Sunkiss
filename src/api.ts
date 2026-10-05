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

/** Where a file came from, when it wasn't uploaded: so far, a frame in a Figma file, which the
 * server rendered and saved (see figma.ts). */
export type Link = {
  source: "figma";
  url: string;
  key: string;
  nodeId: string;
  nodeName: string;
  fileName: string;
  version: string;
  lastModified: string | null;
  snapshotAt: string;
};

/** A file in the server's folder. `size` is in bytes; `modified` is when it was last saved, as an
 * ISO date; `etag` changes with every save. `version` is the id of the current version, and
 * `versions` counts it and the earlier ones (listVersions lists them). `link` says where it
 * came from, when it was snapshotted from elsewhere rather than uploaded. */
export type FileEntry = {
  name: string;
  type: string;
  size: number;
  modified: string;
  etag: string;
  version: string;
  versions: number;
  link?: Link;
};

/** One saved version of a file: its id (what ?V= takes), size, when it was saved, its ETag, and
 * whether it's the current one. */
export type Version = { id: string; size: number; modified: string; etag: string; current: boolean };

// Types the server can resize (keep in sync with RESIZABLE in server/src/routes/files.ts), and
// the layered design files it can take a flattened picture out of (DESIGN_EXTENSIONS in
// server/src/design.ts), which it then resizes the same way.
const RESIZABLE = ["image/png", "image/jpeg", "image/webp", "image/tiff"];
const DESIGN = [
  "image/vnd.adobe.photoshop",
  "application/illustrator",
  "application/x-indesign",
  "application/x-sketch",
  "application/x-figma",
  "application/vnd.adobe.xd",
];

/** Whether the server can send a resized copy of this file (for a design file: of the picture it
 * carries of itself, which not every one does; the server says 415 when it can't). */
export const isResizable = (file: FileEntry) => RESIZABLE.includes(file.type) || DESIGN.includes(file.type);

/** Whether a file is a layered design file (Photoshop, Illustrator, Sketch, XD, a Figma export…):
 * the server can list its layers, and it opens in the app that made it rather than playing or
 * showing as itself. */
export const isDesign = (file: FileEntry) => DESIGN.includes(file.type);

/** A file's kind, in a word, from its name: "PSD", "JPG", "SKETCH". */
export const kindOf = (file: FileEntry) => {
  const extension = file.name.includes(".") ? file.name.split(".").pop()! : "";
  return extension ? extension.toUpperCase() : file.type;
};

/** Whether a file is a video, which plays as it streams instead of downloading first. */
export const isVideo = (file: FileEntry) => file.type.startsWith("video/");

/** URL for a file. With a width and/or height, asks the server for a copy that fits within them.
 * With a version (an id from listVersions), it's that version of the file. */
export function fileUrl(file: FileEntry, width?: number, height?: number, version = file.version): string {
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

/** One kiss: a version of a file, as it was kissed in (saved). The file's name and type, the
 * version's id (what ?V= takes), its size, when it was saved, and whether it's the file's
 * current version. The Kisses screen is made of these. */
export type Kiss = { name: string; type: string; id: string; size: number; modified: string; current: boolean };

/** Every saved version of every file, newest first (GET /activity). Straight to the server
 * even in the desktop app: its sunkiss:// address only carries the file routes. */
export async function listActivity(): Promise<Kiss[]> {
  const res = await fetch(`${SERVER}/activity`).catch(() => {
    throw new Error("Couldn't reach the server");
  });
  if (!res.ok) throw new Error(failureMessage(res));
  return res.json();
}

/** Every saved version of one file, newest first (GET /files/:name/versions). */
export async function listVersions(name: string): Promise<Version[]> {
  const res = await fetch(`${FILES}/${encodeURIComponent(name)}/versions`);
  if (!res.ok) throw new Error(failureMessage(res));
  return res.json();
}

/** One layer of a design file, as the server reads it (Layer in server/src/design.ts). */
export type Layer = {
  name: string;
  kind: "page" | "artboard" | "group" | "layer" | "text" | "image" | "smart" | "shape";
  visible: boolean;
  opacity?: number;
  bounds?: [number, number, number, number]; // x, y, width, height
  children?: Layer[];
};

/** What's inside a file, as the server reads it: its size (in `units`: pixels, or points for
 * Illustrator), its format, whether it has transparency, and for a design file its layers.
 * Null for anything the server can't read. */
export type FileInfo = {
  width?: number;
  height?: number;
  units?: "px" | "pt";
  format: string | null;
  hasAlpha?: boolean;
  layers?: Layer[];
  layerCount?: number;
} | null;

/** Asks the server what's inside a file (GET /files/:name/info): the current version, or with a
 * version id (from listVersions), that one. */
export async function fileInfo(file: FileEntry, version = file.version): Promise<FileInfo> {
  const res = await fetch(`${FILES}/${encodeURIComponent(file.name)}/info?V=${encodeURIComponent(version)}`);
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