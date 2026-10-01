import { useSyncExternalStore } from "react";
import type { FileEntry } from "../api";
import { lookup, subscribe, type SessionFile } from "../sessionCache";

// What this session holds of a file (downloading, kept, or failed), kept current: the
// component re-renders when that changes, including when the file is let go to make room.
export function useSessionFile(file: FileEntry | null): SessionFile | undefined {
  return useSyncExternalStore(subscribe, () => (file ? lookup(file) : undefined));
}
