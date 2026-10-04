import { useCallback, useState } from "react";

// State that's remembered in this app's storage under `key`, so a choice (how the grid is
// sorted, how big its thumbnails are) is the same next time. `fallback` is used when nothing's
// stored, or what's stored isn't one of `allowed` (say, a value from an older build).
export function useStoredState<T extends string | boolean>(key: string, fallback: T, allowed?: readonly T[]) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
      const usable = typeof stored === typeof fallback && (!allowed || allowed.includes(stored as T));
      return usable ? (stored as T) : fallback;
    } catch {
      return fallback; // storage turned off, or something unreadable in it
    }
  });

  const set = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Not remembered next time, but still used for now.
      }
    },
    [key],
  );

  return [value, set] as const;
}
