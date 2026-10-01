import { useEffect, useState } from "react";
import { fileUrl, isVideo, type FileEntry } from "../api";
import { useObjectUrl } from "../hooks/useObjectUrl";
import { useSessionFile } from "../hooks/useSessionFile";
import { useStream } from "../hooks/useStream";
import { touch } from "../sessionCache";
import Tilt from "./Tilt";

const kb = (bytes: number) => `${Math.round(bytes / 1024).toLocaleString()} KB`;

// The selected file, large. A file kept for this session opens straight from memory, at
// full size, with no trip to the server (the page's memory in a browser; Rust's in the
// desktop app). Otherwise a video plays straight off the server, a slice at a time as it's
// watched, and an image streams in as an 800px copy. Images tilt toward the pointer.
export default function Stage({ file }: { file: FileEntry }) {
  const entry = useSessionFile(file);
  const kept = entry?.status === "kept" ? entry : undefined;

  // Opening a kept file counts as using it, so it's the last to be let go.
  useEffect(() => {
    if (kept) touch(file);
  }, [file, kept]);

  return (
    <section className="preview stage">
      {isVideo(file) ? (
        <Player key={`${file.name}@${file.modified}`} file={file} kept={kept?.blob} />
      ) : kept ? (
        <KeptImage file={file} blob={kept.blob} />
      ) : (
        <StreamedImage file={file} />
      )}
    </section>
  );
}

// Memory or the server is decided once, when the video opens: switching partway through
// (say, when a download finishes) would restart it.
function Player({ file, kept }: { file: FileEntry; kept?: Blob }) {
  const [fromMemory] = useState(kept);
  const memoryUrl = useObjectUrl(fromMemory);
  const src = fromMemory ? memoryUrl : fileUrl(file);
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

function StreamedImage({ file }: { file: FileEntry }) {
  // Within 800×800, so a tall photo isn't streamed at 800 wide and over 1000 tall.
  const preview = useStream(fileUrl(file, 800, 800));

  if (preview.status === "loading") {
    return (
      <p className="waiting">
        Streaming {file.name}… {kb(preview.received)}
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
