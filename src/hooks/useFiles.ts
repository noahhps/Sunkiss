import { useEffect, useState } from "react";
import { listFiles, type FileEntry } from "../api";

// Loads the list of files in the server's folder once, when the screen opens.
export function useFiles() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false; // ignore the answer if the screen closed in the meantime
    listFiles()
      .then((list) => {
        if (!cancelled) setFiles(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof TypeError ? "Couldn't reach the server" : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { files, error, loading };
}
