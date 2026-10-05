import { useEffect, useState } from "react";
import { fileUrl, isVideo, isViewable, kindLabel, type FileEntry, type Version } from "../api";
import { formatSize, formatWhen } from "../format";
import { useObjectUrl } from "../hooks/useObjectUrl";
import { useSessionFile } from "../hooks/useSessionFile";
import { useStream } from "../hooks/useStream";
import { touch } from "../sessionCache";
import Tilt from "./Tilt";

// The selected file, large: its current version, or with `version`, an earlier one, labelled
// as such. A file kept for this session opens straight from memory, at full size, with no
// trip to the server (the page's memory in a browser; Rust's in the desktop app). Otherwise a
// video plays straight off the server, a slice at a time as it's watched, and an image
// streams in as an 800px copy. Images tilt toward the pointer.
export default function Stage({ file, version }: { file: FileEntry; version?: Version }) {
  const entry = useSessionFile(file);
  // What's kept for the session is the current version: an earlier one always streams.
  const kept = !version && entry?.status === "kept" ? entry : undefined;
  const id = version?.id ?? file.version;

  // Opening a kept file counts as using it, so it's the last to be let go.
  useEffect(() => {
    if (kept) touch(file);
  }, [file, kept]);

  return (
    <section className="preview stage">
      {version && <p className="stage-label">Earlier version · {formatWhen(version.modified)}</p>}
      {!isViewable(file) ? (
        // Nothing the page can draw (a PSD, a PDF): say what it is, and the actions top right
        // (Open in…, Download) are how to see it.
        <div className="stage-kind fade-in">
          <span className="print-tile">{kindLabel(file.name)}</span>
          <p className="note">No preview for this kind of file · {formatSize(version?.size ?? file.size)}</p>
        </div>
      ) : isVideo(file) ? (
        <Player key={`${file.name}@${id}`} file={file} version={id} kept={kept?.blob} />
      ) : kept ? (
        <KeptImage file={file} blob={kept.blob} />
      ) : (
        <StreamedImage file={file} version={id} />
      )}
    </section>
  );
}

// Memory or the server is decided once, when the video opens: switching partway through
// (say, when a download finishes) would restart it.
function Player({ file, version, kept }: { file: FileEntry; version: string; kept?: Blob }) {
  const [fromMemory] = useState(kept);
  const memoryUrl = useObjectUrl(fromMemory);
  const src = fromMemory ? memoryUrl : fileUrl(file, undefined, undefined, version);
  return src ? <video className="fade-in" src={src} controls playsInline preload="metadata" /> : null;
}

// The whole file, at full size. In a browser that's a Blob the page holds; in the desktop
// app the file's own address, which Rust answers from memory.
function KeptImage({ file, blob }: { file: FileEntry; blob?: Blob }) {
  const url = useObjectUrl(blob);
  const src = blob ? url : fileUrl(file);
  return src ? (
    <Tilt>
      <img className="fade-in" src={src} alt={file.name} />
    </Tilt>
  ) : null;
}

function StreamedImage({ file, version }: { file: FileEntry; version: string }) {
  // Within 800×800, so a tall photo isn't streamed at 800 wide and over 1000 tall.
  const preview = useStream(fileUrl(file, 800, 800, version));

  if (preview.status === "loading") {
    return (
      <p className="waiting">
        Streaming {file.name}… {formatSize(preview.received)}
      </p>
    );
  }
  if (preview.status === "done") {
    return (
      <Tilt>
        <img className="fade-in" src={preview.src} alt={file.name} />
      </Tilt>
    );
  }
  if (preview.status === "error") return <p className="error">{preview.message}</p>;
  return null;
}
