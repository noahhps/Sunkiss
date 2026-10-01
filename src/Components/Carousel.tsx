import { useState, type PointerEvent } from "react";
import { fileUrl, type FileEntry } from "../api";

// How it opens (after the image accordion on bencho.dev: Open 100, Reach 50, Bounce 40, Gap 0).
const OPEN = 3; // the strip under the pointer grows to 1 + OPEN times the others' width
const REACH = 0.8; // how far, in strips, the opening spreads to its neighbours
const MOST = 16; // the newest this many; more would leave each strip too thin to see

// Uploaded images as a band of strips, newest first. The strip under the pointer opens up and
// its neighbours open a little, springing as they go; with the pointer away, the newest one is
// open, so an image that's just come in slides in at the front, already open.
export default function Carousel({ images }: { images: FileEntry[] }) {
  const [focus, setFocus] = useState<number | null>(null); // where the pointer is, in strips
  const shown = images.slice(0, MOST);
  if (shown.length === 0) return null;

  function follow(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    setFocus(((event.clientX - box.left) / box.width) * shown.length - 0.5);
  }

  const center = focus ?? 0; // the newest, when the pointer's away
  return (
    <section className="carousel-wrap" aria-label="Uploaded images">
      <div className="carousel" onPointerMove={follow} onPointerLeave={() => setFocus(null)}>
        {shown.map((file, i) => {
          // Opens most at the pointer, less with each strip away from it.
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
      {images.length > MOST && <p className="note">The newest {MOST} of {images.length} images</p>}
    </section>
  );
}
