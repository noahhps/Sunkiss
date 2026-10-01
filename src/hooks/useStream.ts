import { useEffect, useState } from "react";
import { failureMessage } from "../api";

export type StreamState =
  | { status: "idle" }
  | { status: "loading"; received: number; total: number | null }
  | { status: "done"; src: string; type: string; received: number }
  | { status: "error"; message: string; notFound: boolean };

// Streams a file from the server chunk by chunk, reporting progress as bytes arrive.
// When it's all in, returns an object URL an <img> can show. Pass null to show nothing.
export function useStream(url: string | null): StreamState {
  const [state, setState] = useState<StreamState>({ status: "idle" });

  useEffect(() => {
    if (!url) {
      setState({ status: "idle" });
      return;
    }
    const controller = new AbortController(); // cancels the download if the URL changes
    let objectUrl: string | null = null;

    (async () => {
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok || !res.body) {
          setState({ status: "error", notFound: res.status === 404, message: failureMessage(res) });
          return;
        }
        const type = res.headers.get("Content-Type") ?? "application/octet-stream";
        const total = Number(res.headers.get("Content-Length")) || null; // unknown for resized previews
        const reader = res.body.getReader();
        const chunks: BlobPart[] = [];
        let received = 0;
        setState({ status: "loading", received, total });

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.length;
          setState({ status: "loading", received, total });
        }

        objectUrl = URL.createObjectURL(new Blob(chunks, { type }));
        setState({ status: "done", src: objectUrl, type, received });
      } catch (err) {
        if (controller.signal.aborted) return; // we cancelled it on purpose
        const message = err instanceof TypeError ? "Couldn't reach the server" : String(err);
        setState({ status: "error", notFound: false, message });
      }
    })();

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl); // free the memory held by the old image
    };
  }, [url]);

  return state;
}
