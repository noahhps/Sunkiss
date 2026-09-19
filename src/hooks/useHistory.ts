import { useEffect, useState } from "react";
import { listVersions, type Version } from "../api";

// Loads the saved versions of one file, and loads them again whenever a different file is
// asked for. Pass null while no file is chosen.
export function useVersions(name: string | null) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Start clean, so the last file's versions don't show while this file's load.
    setVersions([]);
    setError(null);
    if (!name) return;

    let cancelled = false; // ignore the answer if the file changed or the screen closed in the meantime
    setLoading(true);
    listVersions(name)
      .then((list) => {
        if (!cancelled) setVersions(list);
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
  }, [name]); // a string, so it only re-runs when the file actually changes

  return { versions, error, loading };
}
