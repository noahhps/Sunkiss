import { useState } from "react";
import { fileUrl, isVideo, type FileEntry } from "../api";
import { dragOut, preparePreview, useDriveFolder } from "../drive";
import { useSessionFile } from "../hooks/useSessionFile";
import Icon from "./Icon";

// A length in m:ss, the way Photos labels a video.
const clock = (seconds: number) => {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

// One thumbnail in QuickView's "print" style: the image shrunk to fit its box, with its
// name under it. `selected` marks the one being previewed, where there is one. A badge in
// the corner shows the file is on this device for the session, or on its way. In the
// desktop app it can be dragged out into another app (Photoshop, Premiere, Finder), which
// gets the file in the Sunkiss drive.
export default function Print({
  file,
  selected,
  onSelect,
}: {
  file: FileEntry;
  selected?: boolean;
  onSelect: (file: FileEntry) => void;
}) {
  const [duration, setDuration] = useState<number>();
  const session = useSessionFile(file);
  const folder = useDriveFolder(); // null in a browser, or until the drive is mounted

  return (
    <button
      type="button"
      className="print fade-in" // a thumbnail coming back as you delete text fades in
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
      <span className="frame">
        {isVideo(file) ? (
          // Only enough of the video for its first frame and its length. The browser fetches
          // just those bytes with Range requests (these files keep their index at the very
          // end), not the whole file. #t=0.1 asks for that frame instead of a blank box.
          <video
            src={`${fileUrl(file)}#t=0.1`}
            preload="metadata"
            muted
            playsInline
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          />
        ) : (
          // Copies bigger than the box they're shown in, so they stay sharp on Retina screens.
          <img src={fileUrl(file, 400, 400)} alt={file.name} loading="lazy" />
        )}
        {duration !== undefined && Number.isFinite(duration) && <span className="duration">{clock(duration)}</span>}
        {session?.status === "kept" && (
          <span className="badge" title="Available this session">
            <Icon name="check" />
          </span>
        )}
        {session?.status === "downloading" && (
          <span className="badge" data-status="downloading" title="Downloading">
            <Icon name="download" />
          </span>
        )}
      </span>
      <span className="caption">{file.name}</span>
    </button>
  );
}
