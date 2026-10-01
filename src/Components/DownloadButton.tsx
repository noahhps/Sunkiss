import type { CSSProperties } from "react";
import type { FileEntry } from "../api";
import { formatSize as size } from "../format";
import { useSessionFile } from "../hooks/useSessionFile";
import { download, forget } from "../sessionCache";
import Icon from "./Icon";

// Brings the whole file onto this device for the session; it sits with the file's other
// actions, top right (see FileActions). Once it's here it says "Available this session" rather than "Downloaded",
// because it's held in memory, never saved to disk. Clicking again stops or removes it.
export default function DownloadButton({ file }: { file: FileEntry }) {
  const entry = useSessionFile(file);

  if (entry?.status === "downloading") {
    // The pill fills from the left as the bytes arrive (see .download in App.css).
    const progress = { "--progress": `${entry.total ? (entry.received / entry.total) * 100 : 0}%` } as CSSProperties;
    return (
      <button type="button" className="pill download" data-status="downloading" style={progress} title="Stop downloading" onClick={() => forget(file)}>
        <Icon name="download" />
        {size(entry.received)} of {size(entry.total)}
      </button>
    );
  }

  if (entry?.status === "kept") {
    return (
      <button type="button" className="pill download" data-status="kept" title="Remove from this session" onClick={() => forget(file)}>
        <Icon name="check" className="at-rest" />
        <Icon name="cross" className="on-hover" />
        Available this session
      </button>
    );
  }

  return (
    <button type="button" className="pill download" data-status={entry?.status} onClick={() => download(file)}>
      <Icon name="download" />
      {entry?.status === "failed" ? (
        `${entry.message} · Try again`
      ) : (
        <>
          Download <span className="size">{size(file.size)}</span>
        </>
      )}
    </button>
  );
}
