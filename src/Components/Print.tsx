import { useState, type CSSProperties } from "react";
import { fileUrl, isVideo, kindOf, type FileEntry } from "../api";
import { dragOut, preparePreview, useDriveFolder } from "../drive";
import { formatCount, formatDuration, splitForMiddle } from "../format";
import { useInView } from "../hooks/useInView";
import { useSessionFile } from "../hooks/useSessionFile";
import { toggleStar, useIsStarred } from "../stars";
import Icon from "./Icon";

// One thumbnail in QuickView's "print" style: the image shrunk to fit its box, with its
// name under it. `selected` marks the one being previewed, where there is one. A badge in
// the top right says the file is on this device for the session, or on its way; the bottom
// left says how many versions it has, when there's more than one; and a star in the top left
// keeps the file close (stars.ts): it shows on hover, and stays once set. In the desktop app
// the picture can be dragged out into another app (Photoshop, Premiere, Finder), which gets
// the file in the Sunkiss drive. `index` is its place in a grid that's just appeared, so the
// prints rise in one after another; it's kept from the first render, so a print's wait
// doesn't change partway through its entrance.
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
  const [noPicture, setNoPicture] = useState(false); // no picture to give (some design files, or one that won't load)
  const [stagger] = useState(index);
  // A video only starts fetching its first frame once it's near the screen: in a folder of
  // hundreds, the rest would all be asking the server at once.
  const [frame, seen] = useInView<HTMLSpanElement>({ once: true });
  const [head, tail] = splitForMiddle(file.name);
  const session = useSessionFile(file);
  const folder = useDriveFolder(); // null in a browser, or until the drive is mounted
  const starred = useIsStarred(file.name);

  return (
    // The print is a div: the star is a button of its own, and a button can't hold another.
    <div
      className="print"
      style={stagger !== undefined ? ({ "--i": stagger } as CSSProperties) : undefined}
      data-name={file.name}
      data-starred={starred ? "" : undefined}
    >
      <span className="frame-wrap">
        <button
          type="button"
          className="print-open"
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
            {noPicture ? (
              // No picture of itself (a design file that carries none), or one that won't load:
              // its kind, on a tile.
              <span className="type-tile">{kindOf(file)}</span>
            ) : isVideo(file) && !seen ? (
              <span className="type-tile" aria-hidden="true" />
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
                onError={() => setNoPicture(true)}
              />
            ) : (
              // Copies bigger than the box they're shown in, so they stay sharp on Retina screens.
              // No alt text: the caption under it already names it.
              <img src={fileUrl(file, 400, 400)} alt="" loading="lazy" onError={() => setNoPicture(true)} />
            )}
            {file.link?.source === "figma" && (
              <span className="source-badge" title={`Snapshot of ${file.link.nodeName} in ${file.link.fileName}, from Figma`}>
                Figma
              </span>
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
        </button>
        <button
          type="button"
          className="star-button"
          aria-pressed={starred}
          aria-label={`${starred ? "Take the star off" : "Star"} ${file.name}`}
          title={starred ? "Starred" : "Star"}
          onClick={() => toggleStar(file.name)}
        >
          <Icon name="star" />
        </button>
      </span>
      {/* Shortened in the middle, so names that differ only at the end still look different. */}
      <span className="caption">
        {head && <span className="caption-head">{head}</span>}
        <span className="caption-tail">{tail}</span>
      </span>
    </div>
  );
}
