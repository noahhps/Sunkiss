import { useSyncExternalStore } from "react";
import { isVideo, type FileEntry } from "./api";
import type { App } from "./drive";

// Which app each kind of file opens in from Sunkiss ("Open in …" on the stage), chosen in
// Settings and remembered in this app's storage. No choice means the file's default app, the
// one Finder would open it with.

export type Kind = "image" | "video";

const KEY = "sunkiss.openIn";
let chosen: Partial<Record<Kind, App>> = read();
const listeners = new Set<() => void>();

function read(): Partial<Record<Kind, App>> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {}; // storage turned off, or something unreadable in it
  }
}

/** Sets the app a kind of file opens in; null goes back to each file's default app. */
export function chooseApp(kind: Kind, app: App | null) {
  chosen = { ...chosen, [kind]: app ?? undefined };
  try {
    localStorage.setItem(KEY, JSON.stringify(chosen));
  } catch {
    // Not remembered next time, but still used for now.
  }
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** The app chosen for a kind of file, if one was. */
export const useChosenApp = (kind: Kind | null) => useSyncExternalStore(subscribe, () => (kind ? chosen[kind] : undefined));

/** What kind of file this is, as far as choosing an app goes. */
export const kindOf = (file: FileEntry): Kind | null =>
  isVideo(file) ? "video" : file.type.startsWith("image/") ? "image" : null;
