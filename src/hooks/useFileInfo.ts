import { useEffect, useState } from "react";
import { fileInfo, isVideo, type FileEntry, type FileInfo } from "../api";

// What the server has read of each version, asked once and kept: a version never changes.
const asked = new Map<string, Promise<FileInfo>>();

// What's inside one version of a file (the current one unless `version` says otherwise): its
// size in pixels, and for a design file its layers. Null until the answer is in, or when the
// server can't read the file (a video, say).
export function useFileInfo(file: FileEntry, version = file.version): FileInfo {
  const [info, setInfo] = useState<FileInfo>(null);

  useEffect(() => {
    let current = true;
    setInfo(null);
    if (isVideo(file)) return; // the server only reads images and design files
    const key = `${file.name}@${version}`;
    const answer = asked.get(key) ?? fileInfo(file, version).catch((): FileInfo => null);
    asked.set(key, answer);
    void answer.then((found) => current && setInfo(found));
    return () => {
      current = false;
    };
  }, [file.name, version]);

  return info;
}
