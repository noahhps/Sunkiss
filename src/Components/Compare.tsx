import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { fileUrl, type FileEntry, type Version } from "../api";
import { formatWhen } from "../format";
import { useStream } from "../hooks/useStream";

const kb = (bytes: number) => `${Math.round(bytes / 1024).toLocaleString()} KB`;
const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

// An earlier version against the current one, on the stage: the earlier version to the left
// of a divider, the current one to the right, so a change can be found by sliding across it.
// Drag the divider (or anywhere on the picture), or move it with the arrow keys once it has
// focus. Both are the stage's 800px previews, streamed like any other.
export default function Compare({ file, version }: { file: FileEntry; version: Version }) {
  const earlier = useStream(fileUrl(file, 800, 800, version.id));
  const current = useStream(fileUrl(file, 800, 800));
  const [split, setSplit] = useState(50); // how much of the width shows the earlier version, in %
  const box = useRef<HTMLDivElement>(null);
  const held = useRef(false);

  const moveTo = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (rect) setSplit(Math.round(clampPercent(((clientX - rect.left) / rect.width) * 100)));
  };
  const down = (event: PointerEvent<HTMLDivElement>) => {
    held.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    moveTo(event.clientX);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (held.current) moveTo(event.clientX);
  };
  const up = () => {
    held.current = false;
  };
  const key = (event: KeyboardEvent) => {
    const step = { ArrowLeft: -2, ArrowRight: 2, Home: -100, End: 100 }[event.key];
    if (!step) return;
    event.preventDefault();
    setSplit((at) => clampPercent(at + step));
  };

  if (earlier.status === "error") return <p className="error">{earlier.message}</p>;
  if (current.status === "error") return <p className="error">{current.message}</p>;
  if (earlier.status !== "done" || current.status !== "done") {
    const received =
      (earlier.status === "loading" ? earlier.received : 0) + (current.status === "loading" ? current.received : 0);
    return <p className="waiting">Streaming both versions… {kb(received)}</p>;
  }

  return (
    <div
      className="compare fade-in"
      ref={box}
      style={{ "--split": `${split}%` } as CSSProperties}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <img src={current.src} alt={`${file.name}, current version`} draggable={false} />
      <img className="compare-earlier" src={earlier.src} alt={`${file.name}, earlier version`} draggable={false} />
      <span className="compare-tag" data-side="left">
        Earlier · {formatWhen(version.modified)}
      </span>
      <span className="compare-tag" data-side="right">
        Current
      </span>
      <div
        className="compare-handle"
        role="slider"
        tabIndex={0}
        aria-label="How much of the earlier version to show"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={split}
        onKeyDown={key}
      />
    </div>
  );
}
