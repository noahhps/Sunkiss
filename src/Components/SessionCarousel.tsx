import { useState, type PointerEvent } from "react";
import { fileUrl, type FileEntry } from "../api";

// Simple session carousel – shows up to MAX images from the current upload session.
// Mirrors the existing Carousel component but limits the number of strips.
const OPEN = 3; // The strip under the pointer expands this factor.
const REACH = 0.8; // How far the opening spreads to neighbours (in strips).
const MAX = 8; // Session limit – after this we switch to the combined view.

export default function SessionCarousel({ images }: { images: FileEntry[] }) {
  const [focus, setFocus] = useState<number | null>(null);
  const shown = images.slice(0, MAX);
  if (shown.length === 0) return null;

  function follow(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    setFocus(((event.clientX - box.left) / box.width) * shown.length - 0.5);
  }

  const center = focus ?? 0;
  return (
    <section className="session-carousel-wrap" aria-label="Current session uploads">
      <div className="carousel" onPointerMove={follow} onPointerLeave={() => setFocus(null)}>
        {shown.map((file, i) => {
          const open = Math.exp(-(((i - center) / REACH) ** 2));
          return (
            <figure
              key={`${file.name}@${file.etag}`}
              className="strip"
              style={{ flexGrow: 1 + OPEN * open }}
              data-open={open > 0.5 ? "" : undefined}
              title={file.name}
            >
              <img src={fileUrl(file, 400, 400)} alt={file.name} draggable={false} />
              <figcaption>{file.name}</figcaption>
            </figure>
          );
        })}
      </div>
      {images.length > MAX && <p className="note">The newest {MAX} of {images.length} images</p>}
    </section>
  );
}
