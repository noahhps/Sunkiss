import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { fileUrl, IN_DESKTOP_APP, isResizable, type FileEntry } from "./api";

// The Sunkiss drive (src-tauri/src/drive.rs): the server's files as a folder in Finder,
// ~/Sunkiss, which other apps can open. It only exists in the desktop app, once mounted.

let folder: string | null = null;
const listeners = new Set<() => void>();

function setFolder(next: string | null) {
  folder = next;
  for (const listener of listeners) listener();
}

if (IN_DESKTOP_APP) {
  // The drive mounts a moment after the app starts; Rust says so when it has.
  void invoke<string | null>("drive_folder").then(setFolder);
  const stopListening = listen<string>("drive-folder", (event) => setFolder(event.payload));
  import.meta.hot?.dispose(() => void stopListening.then((stop) => stop()));
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** Where the drive is (~/Sunkiss), or null while it isn't mounted (and always, in a browser). */
export const useDriveFolder = () => useSyncExternalStore(subscribe, () => folder);

/** Opens a Finder window with the file selected. */
export const showInFinder = (file: FileEntry) => invoke("reveal_file", { name: file.name });

/** An app that can open a file. `default` is the one macOS uses when the file is double-clicked. */
export type App = { name: string; path: string; default: boolean };

/** The apps on this Mac that can open the file, its default app first. */
export const appsFor = (file: FileEntry) => invoke<App[]>("apps_for_file", { name: file.name });

/** The apps on this Mac that can open a kind of file ("image" or "video"), the default first. */
export const appsForKind = (kind: "image" | "video") => invoke<App[]>("apps_for_kind", { kind });

/** Opens the file in an app, or in its default app. */
export const openIn = (file: FileEntry, app?: App) => invoke("open_file", { name: file.name, with: app?.path ?? null });

// Pictures to show under the pointer while a file is dragged, by file version.
const previews = new Map<string, string>();
const keyOf = (file: FileEntry) => `${file.name}@${file.etag}`;

/** Makes the picture for dragging a file, ahead of time (while the pointer is over it). */
export function preparePreview(file: FileEntry) {
  const key = keyOf(file);
  if (!isResizable(file) || previews.has(key)) return;
  previews.set(key, ""); // on its way
  // A small copy from the server, drawn onto a canvas: the page can read that back as a PNG.
  void fetch(fileUrl(file, 128, 128))
    .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(String(res.status)))))
    .then((blob) => createImageBitmap(blob))
    .then((bitmap) => {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
      previews.set(key, canvas.toDataURL("image/png"));
    })
    .catch(() => previews.delete(key));
}

/** Starts dragging the file out of the window as the file in the drive, so it can be dropped
 * into another app. */
export function dragOut(file: FileEntry, folder: string) {
  const picture = previews.get(keyOf(file)) || card(file);
  return startDrag({ item: [`${folder}/${file.name}`], icon: picture });
}

// For files without a small copy to show (videos, SVGs), or before it's ready: a card with
// the file's name, the way Finder labels a dragged file.
function card(file: FileEntry): string {
  const canvas = document.createElement("canvas");
  canvas.width = 180;
  canvas.height = 52;
  const g = canvas.getContext("2d");
  if (g) {
    g.fillStyle = "rgba(38, 41, 48, 0.92)";
    g.beginPath();
    g.roundRect(0, 0, canvas.width, canvas.height, 10);
    g.fill();
    // The page's own font (App.css), so the card reads like the rest of Sunkiss.
    const font = getComputedStyle(document.documentElement).fontFamily;
    g.font = `600 12px ${font}`;
    g.fillStyle = "#f4f6fa";
    g.fillText(fit(g, file.name, canvas.width - 24), 12, 23);
    g.font = `11px ${font}`;
    g.fillStyle = "rgba(244, 246, 250, 0.62)";
    g.fillText(file.type.split("/")[1]?.toUpperCase() ?? "FILE", 12, 39);
  }
  return canvas.toDataURL("image/png");
}

// Shortens text with an ellipsis until it fits `width`.
function fit(g: CanvasRenderingContext2D, text: string, width: number) {
  if (g.measureText(text).width <= width) return text;
  let shorter = text;
  while (shorter.length > 1 && g.measureText(`${shorter}…`).width > width) shorter = shorter.slice(0, -1);
  return `${shorter}…`;
}
