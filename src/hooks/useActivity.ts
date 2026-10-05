import { useCallback, useEffect, useState } from "react";
import { listActivity, type Kiss } from "../api";

// Loads every kiss (each saved version of every file, newest first) when the screen opens,
// and again whenever refresh() is called, the way useFiles loads the list of files.
export function useActivity() {
  const [kisses, setKisses] = useState<Kiss[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true); // the first time
  const [refreshing, setRefreshing] = useState(false); // any time after that
  const [asked, setAsked] = useState(0);

  useEffect(() => {
    let cancelled = false; // ignore the answer if the screen closed, or a newer one was asked for
    listActivity()
      .then((list) => {
        if (cancelled) return;
        setKisses(list);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
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

  return { kisses, error, loading, refreshing, refresh };
}
