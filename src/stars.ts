import { useSyncExternalStore } from "react";

// Files you've starred, remembered in this app's storage: a way to keep the assets you're
// working on close. It's your list, on this device; the server doesn't know about it.

const KEY = "sunkiss.starred";
let starred: ReadonlySet<string> = new Set(read());
const listeners = new Set<() => void>();

function read(): string[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((name): name is string => typeof name === "string") : [];
  } catch {
    return []; // storage turned off, or something unreadable in it
  }
}

/** Stars a file, or takes the star off it. */
export function toggleStar(name: string) {
  const next = new Set(starred);
  if (!next.delete(name)) next.add(name);
  starred = next; // a new set each time, so React sees the change
  try {
    localStorage.setItem(KEY, JSON.stringify([...next]));
  } catch {
    // Not remembered next time, but still starred for now.
  }
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** The names of every starred file. */
export const useStarred = () => useSyncExternalStore(subscribe, () => starred);

/** Whether one file is starred. */
export const useIsStarred = (name: string) => useSyncExternalStore(subscribe, () => starred.has(name));
