import { useCallback, useEffect, useState } from "react";
import { listFiles, type FileEntry } from "../api";

// Loads the list of files in the server's folder when the screen opens, and again whenever
// refresh() is called. `asked` counts the refreshes, for anything that should load again with
// the list. update() puts in a file the server has just described (after a save), without
// asking for the whole list again.
export function useFiles() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true); // the first time
  const [refreshing, setRefreshing] = useState(false); // any time after that
  const [asked, setAsked] = useState(0);

  useEffect(() => {
    let cancelled = false; // ignore the answer if the screen closed, or a newer one was asked for
    listFiles()
      .then((list) => {
        if (cancelled) return;
        setFiles(list);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) {
          // err.message, not String(err), which would start "Error: ".
          setError(err instanceof TypeError ? "Couldn't reach the server" : err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [asked]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setAsked((count) => count + 1);
  }, []);

  const update = useCallback((file: FileEntry) => {
    setFiles((list) => [file, ...list.filter((other) => other.name !== file.name)]);
  }, []);

  return { files, error, loading, refreshing, refresh, asked, update };
}
