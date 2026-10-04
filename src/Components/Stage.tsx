import { useEffect, useState } from "react";
import { fileUrl, isDesign, isVideo, kindOf, type FileEntry, type Version } from "../api";
import { formatWhen } from "../format";
import { useObjectUrl } from "../hooks/useObjectUrl";
import { useSessionFile } from "../hooks/useSessionFile";
import { useStream } from "../hooks/useStream";
import { touch } from "../sessionCache";
import { toggleStar, useIsStarred } from "../stars";
import Compare from "./Compare";
import Icon from "./Icon";
import Tilt from "./Tilt";

const kb = (bytes: number) => `${Math.round(bytes / 1024).toLocaleString()} KB`;

// The selected file, large: its current version, or with `version`, an earlier one, labelled
// as such. A file kept for this session opens straight from memory, at full size, with no
// trip to the server (the page's memory in a browser; Rust's in the desktop app). Otherwise a
// video plays straight off the server, a slice at a time as it's watched, and an image
// streams in as an 800px copy. Images tilt toward the pointer. With `compare`, an earlier
// version is shown against the current one instead (Compare.tsx; images only).
export default function Stage({ file, version, compare }: { file: FileEntry; version?: Version; compare?: boolean }) {
  const entry = useSessionFile(file);
  // What's kept for the session is the current version: an earlier one always streams.
  const kept = !version && entry?.status === "kept" ? entry : undefined;
  const id = version?.id ?? file.version;

  // Opening a kept file counts as using it, so it's the last to be let go.
  useEffect(() => {
    if (kept) touch(file);
  }, [file, kept]);

  // A video plays as itself: only images are compared.
  const comparing = compare && version && !isVideo(file) ? version : undefined;

  return (
    <section className="preview stage">
      {version && !comparing && <p className="stage-label">Earlier version · {formatWhen(version.modified)}</p>}
      {comparing ? (
        <Compare file={file} version={comparing} />
      ) : isVideo(file) ? (
        <Player key={`${file.name}@${id}`} file={file} version={id} kept={kept?.blob} />
      ) : kept && !isDesign(file) ? (
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
    <Tilt corner={<StarCorner file={file} />}>
      <img className="fade-in" src={src} alt={file.name} />
    </Tilt>
  ) : null;
}

// The star, on the top right corner of the card: set, it's orange (stars.ts).
function StarCorner({ file }: { file: FileEntry }) {
  const starred = useIsStarred(file.name);
  return (
    <button
      type="button"
      className="star-corner"
      aria-pressed={starred}
      aria-label={starred ? "Take the star off" : "Star this file"}
      title={starred ? "Starred" : "Star"}
      onClick={() => toggleStar(file.name)}
    >
      <Icon name="star" />
    </button>
  );
}

function StreamedImage({ file, version }: { file: FileEntry; version: string }) {
  // Within 800×800, so a tall photo isn't streamed at 800 wide and over 1000 tall.
  const preview = useStream(fileUrl(file, 800, 800, version));

  if (preview.status === "loading") {
    return (
      <p className="waiting">
        Streaming {file.name}… {kb(preview.received)}
      </p>
    );
  }
  if (preview.status === "done") {
    return (
      <Tilt corner={<StarCorner file={file} />}>
        <img className="fade-in" src={preview.src} alt={file.name} />
      </Tilt>
    );
  }
  if (preview.status === "error") {
    // A design file with no picture inside it (the server says 415): say so, rather than erroring.
    if (isDesign(file) && preview.message.endsWith("415")) {
      return (
        <div className="no-picture">
          <span className="type-tile big">{kindOf(file)}</span>
          <p className="note">This file doesn't carry a picture of itself. Open it in its app to see it; its layers are listed below.</p>
        </div>
      );
    }
    return <p className="error">{preview.message}</p>;
  }
  return null;
}
