import { useState, type CSSProperties } from "react";
import { fileUrl, isVideo, isViewable, kindLabel, type FileEntry } from "../api";
import { dragOut, preparePreview, useDriveFolder } from "../drive";
import { formatCount, formatDuration, splitForMiddle } from "../format";
import { useInView } from "../hooks/useInView";
import { useSessionFile } from "../hooks/useSessionFile";
import Icon from "./Icon";

// One thumbnail in QuickView's "print" style: the image shrunk to fit its box, with its
// name under it. `selected` marks the one being previewed, where there is one. A badge in
// the corner shows the file is on this device for the session, or on its way; the other top
// corner says how many versions it has, when there's more than one. In the
// desktop app it can be dragged out into another app (Photoshop, Premiere, Finder), which
// gets the file in the Sunkiss drive. `index` is its place in a grid that's just appeared, so
// the prints rise in one after another; it's kept from the first render, so a print's wait
// doesn't change partway through its entrance. A file with no picture to show (a PSD, or
// one whose picture won't load) gets a tile with its kind on it instead.
export default function Print({
  file,
  selected,
  index,
  onSelect,
}: {
  file: FileEntry;
  selected?: boolean;
  index?: number;
  onSelect: (file: FileEntry) => void;
}) {
  const [duration, setDuration] = useState<number>();
  const [stagger] = useState(index);
  const [failed, setFailed] = useState(false); // the picture wouldn't load
  // A video only starts fetching its first frame once it's near the screen: in a folder of
  // hundreds, the rest would all be asking the server at once.
  const [frame, seen] = useInView<HTMLSpanElement>({ once: true });
  const [head, tail] = splitForMiddle(file.name);
  const session = useSessionFile(file);
  const folder = useDriveFolder(); // null in a browser, or until the drive is mounted

  return (
    <button
      type="button"
      className="print"
      style={stagger !== undefined ? ({ "--i": stagger } as CSSProperties) : undefined}
      title={file.name}
      aria-pressed={selected}
      onClick={() => onSelect(file)}
      draggable={folder !== null}
      // The picture shown while dragging is made ahead, so the drag starts right away.
      onPointerEnter={folder ? () => preparePreview(file) : undefined}
      onDragStart={(event) => {
        if (!folder) return;
        event.preventDefault(); // instead of the browser's own drag, which only knows a picture
        void dragOut(file, folder);
      }}
    >
      <span className="frame" ref={frame}>
        {!isViewable(file) || failed ? (
          <span className="print-tile" aria-hidden="true">
            {kindLabel(file.name)}
          </span>
        ) : isVideo(file) && !seen ? (
          <span className="print-tile" aria-hidden="true" />
        ) : isVideo(file) ? (
          // Only enough of the video for its first frame and its length. The browser fetches
          // just those bytes with Range requests (these files keep their index at the very
          // end), not the whole file. #t=0.1 asks for that frame instead of a blank box.
          <video
            src={`${fileUrl(file)}#t=0.1`}
            preload="metadata"
            muted
            playsInline
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            onError={() => setFailed(true)}
          />
        ) : (
          // Copies bigger than the box they're shown in, so they stay sharp on Retina screens.
          // No alt text: the caption under it already names it.
          <img src={fileUrl(file, 400, 400)} alt="" loading="lazy" onError={() => setFailed(true)} />
        )}
        {duration !== undefined && Number.isFinite(duration) && <span className="duration">{formatDuration(duration)}</span>}
        {file.versions > 1 && (
          <span className="versions-badge" title={`${formatCount(file.versions)} versions`}>
            <Icon name="versions" />
            {formatCount(file.versions)}
          </span>
        )}
        {session?.status === "kept" && (
          <span className="badge" title="Available this session">
            <Icon name="check" />
          </span>
        )}
        {session?.status === "downloading" && (
          <span className="badge" data-status="downloading" title="Downloading">
            <Icon name="arrow-down" />
          </span>
        )}
      </span>
      {/* Shortened in the middle, so names that differ only at the end still look different. */}
      <span className="caption">
        {head && <span className="caption-head">{head}</span>}
        <span className="caption-tail">{tail}</span>
      </span>
    </button>
  );
}
