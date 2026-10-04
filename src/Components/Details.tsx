import { useEffect, useState } from "react";
import { fileInfo, isVideo, type FileEntry, type FileInfo, type Version } from "../api";
import { formatSize, formatWhen } from "../format";

// What's inside each version, asked of the server once and kept: a version's pixels never change.
const asked = new Map<string, Promise<FileInfo>>();

// The file's facts, in a line under the stage: its kind, its size in pixels (which the server
// reads from the image), its size in bytes, when it was saved, and how many versions it has.
// With an earlier version on the stage, the facts are that version's.
export default function Details({ file, version }: { file: FileEntry; version?: Version }) {
  const id = version?.id ?? file.version;
  const [info, setInfo] = useState<FileInfo>(null);

  useEffect(() => {
    let current = true;
    setInfo(null);
    if (isVideo(file)) return; // the server only reads images
    const key = `${file.name}@${id}`;
    const answer = asked.get(key) ?? fileInfo(file, id).catch((): FileInfo => null);
    asked.set(key, answer);
    void answer.then((found) => current && setInfo(found));
    return () => {
      current = false;
    };
  }, [file.name, id]);

  const extension = file.name.includes(".") ? file.name.split(".").pop()! : "";
  const kind = extension ? extension.toUpperCase() : file.type;
  const facts = [
    kind,
    info ? `${info.width.toLocaleString()} × ${info.height.toLocaleString()}` : null,
    formatSize(version?.size ?? file.size),
    `Saved ${formatWhen(version?.modified ?? file.modified)}`,
    `${file.versions} ${file.versions === 1 ? "version" : "versions"}`,
  ].filter((fact) => fact !== null);

  return <p className="details">{facts.join(" · ")}</p>;
}
