import { useEffect, useRef, useState } from "react";
import { listVersions, type Version } from "../api";

// Loads the saved versions of one file, and loads them again whenever a different file is
// asked for, or `stamp` changes: pass something that changes when the file gets a new version
// (or the list of files is refreshed). Pass null while no file is chosen.
export function useVersions(name: string | null, stamp: string | number = "") {
  const [versions, setVersions] = useState<Version[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const showing = useRef<string | null>(null); // whose versions `versions` holds

  useEffect(() => {
    // Start clean for a different file, so the last file's versions don't show while this
    // file's load. Loading the same file again keeps its list up until the new one arrives.
    if (name !== showing.current) {
      setVersions([]);
      showing.current = name;
    }
    setError(null);
    if (!name) return;

    let cancelled = false; // ignore the answer if the file changed or the screen closed in the meantime
    setLoading(true);
    listVersions(name)
      .then((list) => {
        if (!cancelled) setVersions(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof TypeError ? "Couldn't reach the server" : err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [name, stamp]); // strings, so it only re-runs when the file or its versions actually change

  return { versions, error, loading };
}
