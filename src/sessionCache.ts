import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { failureMessage, fileUrl, IN_DESKTOP_APP, type FileEntry } from "./api";

// Files "downloaded" for this session. The bytes are held in memory, never in a file on
// disk, and they're gone when the app quits. Until then the file opens instantly, even
// with the server unreachable. Past LIMIT, the files used least recently are let go.
//
// In the desktop app the bytes live in Rust (src-tauri/src/store.rs), where the Sunkiss
// drive in Finder reads them too, and this file only mirrors what Rust reports. A plain
// browser has no Rust side, so there the page keeps the bytes itself, as Blobs.
const LIMIT = 256 * 1024 * 1024;

// A download comes a slice at a time (Range requests), so its progress can be shown, and
// so the desktop app's Rust side (src-tauri/src/lib.rs) never holds more than one slice.
const SLICE = 4 * 1024 * 1024;

export type SessionFile =
  | { status: "downloading"; received: number; total: number }
  | { status: "kept"; blob?: Blob } // the bytes, in a plain browser; in the desktop app they're in Rust
  | { status: "failed"; message: string };

// One entry per file, least recently used first: a Map keeps the order entries were added.
const entries = new Map<string, SessionFile>();
const downloads = new Map<string, AbortController>();
const listeners = new Set<() => void>();

// A new version of a file is a different file: the old version's bytes are no use for it.
// (In the desktop app, Rust keeps track of versions and lets go of old ones itself.)
const keyOf = (file: FileEntry) => (IN_DESKTOP_APP ? file.name : `${file.name}@${file.modified}`);

function set(key: string, entry: SessionFile | null) {
  entries.delete(key); // so setting it again moves it to the most recently used end
  if (entry) entries.set(key, entry);
  for (const listener of listeners) listener();
}

// What Rust reports about a file (SessionFile in src-tauri/src/store.rs).
type Reported = {
  name: string;
  status: "downloading" | "kept" | "failed" | "gone";
  received: number;
  total: number;
  message: string | null;
};

function mirror(file: Reported) {
  if (file.status === "gone") set(file.name, null);
  else if (file.status === "kept") set(file.name, { status: "kept" });
  else if (file.status === "downloading") set(file.name, { status: "downloading", received: file.received, total: file.total });
  else set(file.name, { status: "failed", message: file.message ?? "Couldn't download" });
}

if (IN_DESKTOP_APP) {
  // Rust reports every change, and it holds on to files when the page reloads, so ask what
  // it already has too.
  const stopListening = listen<Reported>("session-file", (event) => mirror(event.payload));
  void invoke<Reported[]>("session_files").then((files) => files.forEach(mirror));
  import.meta.hot?.dispose(() => void stopListening.then((stop) => stop()));
}

/** For useSyncExternalStore: calls `listener` whenever anything here changes. */
export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** What this session holds of a file, if anything. */
export const lookup = (file: FileEntry) => entries.get(keyOf(file));

/** Marks a kept file as just used, so it's the last to be let go. */
export function touch(file: FileEntry) {
  if (IN_DESKTOP_APP) return; // Rust counts a file as used whenever it serves it
  const key = keyOf(file);
  const entry = entries.get(key);
  if (entry?.status === "kept") {
    entries.delete(key);
    entries.set(key, entry);
  }
}

/** Lets go of a file, or stops it downloading. */
export function forget(file: FileEntry) {
  if (IN_DESKTOP_APP) return void invoke("forget_file", { name: file.name });
  const key = keyOf(file);
  downloads.get(key)?.abort();
  set(key, null);
}

/** Brings a whole file into memory for this session. */
export async function download(file: FileEntry) {
  if (IN_DESKTOP_APP) {
    // How it's going arrives as "session-file" events (see mirror, above).
    await invoke("keep_file", { name: file.name }).catch((err) =>
      set(file.name, { status: "failed", message: String(err) }),
    );
    return;
  }
  const key = keyOf(file);
  if (downloads.has(key) || entries.get(key)?.status === "kept") return;
  if (file.size > LIMIT) {
    set(key, { status: "failed", message: `Too big to keep in memory (the limit is ${LIMIT / 1024 / 1024} MB)` });
    return;
  }

  const controller = new AbortController();
  downloads.set(key, controller);
  set(key, { status: "downloading", received: 0, total: file.size });
  try {
    const blob = await fetchInSlices(file, controller.signal, (received, total) =>
      set(key, { status: "downloading", received, total }),
    );
    if (controller.signal.aborted) return; // forgotten just as the last slice came in
    makeRoom(blob.size);
    set(key, { status: "kept", blob });
  } catch (err) {
    if (controller.signal.aborted) return; // stopped on purpose
    const message = err instanceof TypeError ? "Couldn't reach the server" : err instanceof Error ? err.message : String(err);
    set(key, { status: "failed", message });
  } finally {
    downloads.delete(key);
  }
}

// Lets go of the least recently used kept files until `incoming` more bytes fit under LIMIT.
// (Only in a browser: in the desktop app, Rust does this.)
function makeRoom(incoming: number) {
  let total = incoming;
  for (const entry of entries.values()) if (entry.status === "kept") total += entry.blob?.size ?? 0;
  for (const [key, entry] of entries) {
    if (total <= LIMIT) break;
    if (entry.status === "kept") {
      entries.delete(key);
      total -= entry.blob?.size ?? 0;
    }
  }
}

async function fetchInSlices(
  file: FileEntry,
  signal: AbortSignal,
  onProgress: (received: number, total: number) => void,
): Promise<Blob> {
  const parts: Blob[] = [];
  let received = 0;
  let total = file.size;
  let version: string | null = null;
  do {
    const res = await fetch(fileUrl(file), {
      headers: { Range: `bytes=${received}-${received + SLICE - 1}` },
      cache: "no-store", // keeps it out of the browser's disk cache as well
      signal,
    });
    if (res.status === 200) return res.blob(); // the server sent the whole file at once instead
    if (res.status !== 206) throw new Error(failureMessage(res));

    // Every slice has to come from the same version, or two versions get stitched together.
    const etag = res.headers.get("ETag");
    if (version === null) version = etag;
    else if (etag !== version) throw new Error(`${file.name} changed on the server partway through`);

    // "bytes 0-4194303/36199106": the number after the slash is the whole file's size.
    const whole = Number(res.headers.get("Content-Range")?.split("/")[1]);
    if (Number.isFinite(whole)) total = whole;

    const part = await res.blob();
    if (part.size === 0) throw new Error("The server sent an empty slice");
    parts.push(part);
    received += part.size;
    onProgress(received, total);
  } while (received < total);
  return new Blob(parts, { type: file.type });
}
