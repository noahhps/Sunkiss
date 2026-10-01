import { useEffect, useState } from "react";

// An object URL for a Blob, so an <img> or <video> can show bytes held in memory. It's
// revoked when the blob changes or the component goes away, so the memory can be freed.
export function useObjectUrl(blob: Blob | undefined) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) return setUrl(undefined);
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);
  return url;
}
