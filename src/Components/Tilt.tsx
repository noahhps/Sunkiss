import { useRef, type PointerEvent, type ReactNode } from "react";

// How far it leans, at most, and how strong the light and shade get (after the tilt card on
// bencho.dev: Tilt 10, Shade 60).
const MAX_TILT = 10; // degrees
const SHADE = 0.6;

// Tilts what it holds toward the pointer, like a print held in the hand: it leans in, sinks a
// little, catches the light where the pointer is and falls into shade in the opposite corner.
// When the pointer leaves it springs back flat. `corner` is pinned to the card's top right
// (the star, on the stage) but stays put while the card leans under it.
export default function Tilt({ children, corner }: { children: ReactNode; corner?: ReactNode }) {
  const card = useRef<HTMLDivElement>(null);

  function follow(event: PointerEvent<HTMLDivElement>) {
    const el = card.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const box = el.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width; // 0 at the left edge, 1 at the right
    const y = (event.clientY - box.top) / box.height; // 0 at the top, 1 at the bottom
    // Nearer an edge, stronger light and shade; none in the very middle.
    const edge = Math.min(1, Math.hypot(x - 0.5, y - 0.5) / Math.SQRT1_2);
    el.dataset.tilting = "";
    el.style.setProperty("--rx", `${(y - 0.5) * 2 * MAX_TILT}deg`);
    el.style.setProperty("--ry", `${(0.5 - x) * 2 * MAX_TILT}deg`);
    el.style.setProperty("--x", `${x * 100}%`);
    el.style.setProperty("--y", `${y * 100}%`);
    el.style.setProperty("--light", `${0.34 * SHADE * edge}`);
    el.style.setProperty("--dark", `${0.55 * SHADE * edge}`);
  }

  function rest() {
    const el = card.current;
    if (!el) return;
    delete el.dataset.tilting;
    for (const name of ["--rx", "--ry", "--light", "--dark"]) el.style.removeProperty(name);
  }

  return (
    <div className="tilt" onPointerMove={follow} onPointerLeave={rest}>
      <div className="tilt-card" ref={card}>
        {children}
        <span className="tilt-sheen" aria-hidden="true" />
      </div>
      {corner}
    </div>
  );
}
