import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { fileUrl, type FileEntry } from "../api";
import "./CombinedCarousel.css";

/* ── Physics utilities ───────────────────────────────────────────────────── */

/* Utility to clamp a number between lo and hi */
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/* Linear interpolation */
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/* ── Spring hook ──────────────────────────────────────────────────────── */
function useSpring(target: number, tune = 50, instant = false) {
  const [at, setAt] = useState(target);
  const cur = useRef(target);
  const vel = useRef(0);
  const raf = useRef(0);

  useEffect(() => {
    if (instant) {
      cur.current = target;
      vel.current = 0;
      setAt(target);
      return;
    }
    const k = 0.08 + (tune / 100) * 0.16;
    const d = 0.62 + (tune / 100) * 0.2;
    let prev = 0;
    const tick = (t: number) => {
      const dt = prev ? clamp((t - prev) / 16.67, 0, 2.5) : 1;
      prev = t;
      vel.current += (target - cur.current) * k * dt;
      vel.current *= Math.pow(d, dt);
      cur.current += vel.current * dt;
      if (Math.abs(target - cur.current) < 0.02 && Math.abs(vel.current) < 0.02) {
        cur.current = target;
        vel.current = 0;
        setAt(target);
        raf.current = 0;
        return;
      }
      setAt(cur.current);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf.current);
      raf.current = 0;
    };
  }, [target, tune, instant]);

  return at;
}

/* ── Reduced‑motion preference ─────────────────────────────────── */
const stillness = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/* ── Carousel constants (from the Bencho block) ────────────────────── */
const SPREAD = 150; // px from the front card to each side card (the block's 138, for wider cards)
const CORNER = 18;
const FLOAT = 15;
const SINK = 50;
const SETTLE = 50;
const PULL = SPREAD; // px of drag per step: the same as the spread, so a card stays under the finger
const TOSS = 150; // ms travel look‑ahead for flick
const MOST = 2; // safeguard max skip on flick
const BASE = 620;
const PERIOD = [4.7, 5.9, 6.7, 5.3]; // s per bob; they don't divide into each other, so the cards never bob in unison
const ANGLE = [-4.2, 2.6, -1.4, 3.8, 1.7]; // each card's own resting lean

/* Card layout: landscape, and lower than the block's 206 × 292 */
const CARD_W = 210;
const CARD_H = 150;

// Where a card sits by its distance from the front one. Three show at a time: the front card
// and one each side; the rest wait out of sight, tucked behind the side cards.
const PLACES = [
  { x: 0, y: 0, s: 1, z: 100 },
  { x: SPREAD, y: -13, s: 0.83, z: 65 },
  { x: SPREAD * 0.6, y: -30, s: 0.6, z: 10 },
];

// A card partway between two places (being dragged, or gliding) is partway between them too.
// Past the side cards it fades out, gone by `gone` places away: two, or with only three cards,
// a little before one and a half, where the card going round the back changes sides (a little
// before, so the frames either side of the change both have it out of sight).
function placeAt(away: number, gone: number) {
  const a = Math.min(Math.abs(away), PLACES.length - 1);
  const lower = Math.floor(a);
  const from = PLACES[lower];
  const to = PLACES[Math.min(lower + 1, PLACES.length - 1)];
  const t = a - lower;
  return {
    x: Math.sign(away) * mix(from.x, to.x, t),
    y: mix(from.y, to.y, t),
    s: mix(from.s, to.s, t),
    z: Math.round(mix(from.z, to.z, t)),
    o: clamp((gone - Math.abs(away)) / (gone - 1), 0, 1),
  };
}

/* The images sent this session, newest first, as the carousel: one card in front and one
   each side, the rest out of sight behind them, every card bobbing gently and leaning in under
   a finger. Drag the cards along (they follow the pointer, and a flick carries on a step or
   two), click a side card, or use the arrow keys. Three or more go round in a loop; two just
   slide between them. A new image glides in to the front. */
export default function CombinedCarousel({ images }: { images: FileEntry[] }) {
  const count = images.length;
  const still = stillness();
  // With two, the other card would have to be on both sides at once to loop.
  const loops = count >= 3;

  // Refs for each slot element
  const slots = useRef<(HTMLDivElement | null)[]>([]);
  // Which image is in front: a whole number at rest, in between while moving
  const turn = useRef(0);
  const heading = useRef<number | null>(null); // where a glide is going, while it goes
  const raf = useRef(0);
  const drag = useRef<{ x0: number; t0: number; last: number; t: number; vx: number; moved: boolean; index: number } | null>(null);
  const [held, setHeld] = useState(false);
  const [front, setFront] = useState(0); // the image nearest the front, for the caption
  const shown = useRef(0);

  const wrap = (i: number) => ((i % count) + count) % count;
  // How far image i is from the front: the short way round the loop, when it loops.
  const away = (i: number) => {
    const d = i - turn.current;
    if (!loops) return d;
    const round = wrap(d);
    return round > count / 2 ? round - count : round;
  };
  const gone = loops ? Math.min(2, count / 2 - 0.1) : 2;
  // A turn the carousel can stop at: any whole one when it loops, otherwise one of its images.
  const stop = (to: number) => (loops ? to : clamp(to, 0, count - 1));

  // Write every card's place straight onto it: while dragging this runs every frame, and going
  // through React for that would be a render per frame for no reason. The caption only changes
  // when another card becomes the nearest the front, so that one does go through React.
  const paint = () => {
    if (!count) return;
    slots.current.forEach((el, i) => {
      if (!el || i >= count) return;
      const p = placeAt(away(i), gone);
      el.style.transform = `translate(-50%, -50%) translate(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px) rotate(${ANGLE[i % ANGLE.length]}deg) scale(${p.s.toFixed(4)})`;
      el.style.zIndex = String(p.z);
      el.style.opacity = p.o.toFixed(3);
      el.style.pointerEvents = p.o < 0.05 ? "none" : ""; // out of sight, out of reach
    });
    const nearest = loops ? wrap(Math.round(turn.current)) : clamp(Math.round(turn.current), 0, count - 1);
    if (nearest !== shown.current) setFront((shown.current = nearest));
  };

  /* ── Glide to a whole turn after interaction ─────── */
  const rate = (speed: number) => 1.6 - (speed / 100) * 1.2;
  const out = (v: number) => 1 - Math.pow(1 - v, 4); // fast, then easing into place
  const glide = (to: number) => {
    cancelAnimationFrame(raf.current);
    const from = turn.current;
    if (still || from === to) {
      turn.current = to;
      heading.current = null;
      paint();
      return;
    }
    heading.current = to;
    const ms = BASE * rate(clamp(SETTLE, 0, 100));
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      turn.current = mix(from, to, out(p));
      paint();
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else heading.current = null;
    };
    raf.current = requestAnimationFrame(tick);
  };

  // A new image arrives at the front of the list, which moves the others along, so first the
  // carousel turns with them and nothing moves on screen; then the new one glides in to the
  // front. Followed by image rather than counted, because a Replace brings an image to the
  // front from wherever it was. While a card is held, it stays under the finger.
  const keys = images.map((file) => `${file.name}@${file.etag}`);
  const before = useRef(keys);
  useLayoutEffect(() => {
    const earlier = before.current;
    before.current = keys;
    if (!earlier.length || keys[0] === earlier[0]) return;
    const was = ((Math.round(turn.current) % earlier.length) + earlier.length) % earlier.length;
    const now = keys.indexOf(earlier[was]);
    if (now >= 0) {
      // To the turn that puts that image in front now (keeping any part-way), since with
      // one more image round the loop, the old turn can stand for a different image.
      const moved = now - Math.round(turn.current);
      turn.current += moved;
      if (drag.current) drag.current.t0 += moved;
    }
    paint();
    if (!drag.current) glide(loops ? Math.round(turn.current / count) * count : 0);
  }, [keys[0]]);

  // Place the cards after every render (a new card has to be put somewhere before it shows).
  useLayoutEffect(() => paint());
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  /* ── Drag handling ──────────────────────────────────────── */
  const down = (e: PointerEvent<HTMLDivElement>) => {
    cancelAnimationFrame(raf.current);
    heading.current = null;
    const slot = (e.target as HTMLElement).closest<HTMLElement>("[data-index]");
    drag.current = {
      x0: e.clientX,
      t0: turn.current,
      last: e.clientX,
      t: e.timeStamp,
      vx: 0,
      moved: false,
      index: Number(slot?.dataset.index ?? -1),
    };
    setHeld(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const g = drag.current;
    if (!g || count < 2) return;
    const dx = e.clientX - g.x0;
    if (!g.moved && Math.abs(dx) > 3) g.moved = true;
    const dt = Math.max(1, e.timeStamp - g.t);
    g.vx = (g.vx + (e.clientX - g.last) / dt) / 2;
    g.last = e.clientX;
    g.t = e.timeStamp;
    let to = g.t0 - dx / PULL; // dragged left: along to older images
    // With nothing further that way, the cards give a little, reluctantly.
    if (!loops) to = to < 0 ? to / 3 : to > count - 1 ? count - 1 + (to - count + 1) / 3 : to;
    turn.current = to;
    paint();
  };

  const up = () => {
    const g = drag.current;
    if (!g) return;
    drag.current = null;
    setHeld(false);
    if (g.moved) {
      // A flick carries on a step or two, depending on how hard it was thrown.
      const carry = clamp((-g.vx * TOSS) / PULL, -MOST, MOST);
      glide(stop(Math.round(turn.current + carry)));
    } else if (g.index >= 0) {
      glide(stop(Math.round(turn.current + away(g.index)))); // a side card, clicked: to the front
    } else {
      glide(stop(Math.round(turn.current))); // caught mid-glide and let go: settle there
    }
  };

  const key = (e: KeyboardEvent) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d || count < 2) return;
    e.preventDefault();
    // From where it's already going, so pressing twice quickly goes two along.
    glide(stop((heading.current ?? Math.round(turn.current)) + d));
  };

  if (count === 0) return null;

  return (
    <div className="combined-carousel">
      <div className="car-stage">
        <div
          className="car-track"
          data-held={held ? "true" : undefined}
          role="group"
          aria-roledescription="carousel"
          aria-label={`Images sent this session: ${images[front]?.name}, ${front + 1} of ${count}`}
          tabIndex={0}
          onKeyDown={key}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerLeave={up}
        >
          {images.map((file, i) => (
            <div
              key={`${file.name}@${file.etag}`}
              data-index={i}
              ref={(el) => {
                slots.current[i] = el;
              }}
              className="car-slot"
              title={file.name}
              style={{ width: CARD_W, height: CARD_H }}
            >
              <div
                className="car-float"
                style={
                  {
                    animationName: FLOAT <= 0 ? "none" : undefined,
                    animationDuration: `${PERIOD[i % PERIOD.length]}s`,
                    "--lift": `${((clamp(FLOAT, 0, 100) / 100) * 16).toFixed(2)}px`,
                    "--sway": `${((clamp(FLOAT, 0, 100) / 100) * 1.4).toFixed(2)}deg`,
                  } as CSSProperties
                }
              >
                <Card shot={fileUrl(file, 400, 400)} corner={clamp(CORNER, 0, 40)} sink={SINK} off={held || still} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="car-caption">
        <span className="car-name">{images[front]?.name}</span>
        {count > 1 && (
          <span className="car-count">
            {front + 1} of {count}
          </span>
        )}
      </p>
    </div>
  );
}

/* ── Card component – a press‑sensitive image tile ───────────── */
function Card({ shot, corner, sink, off }: { shot: string; corner: number; sink: number; off: boolean }) {
  const skin = useRef<HTMLDivElement | null>(null);
  const [pt, setPt] = useState({ x: 0, y: 0 });
  const [on, setOn] = useState(false);
  const still = stillness();

  const live = on && !off;
  const sx = useSpring(live ? pt.x : 0, 50, still);
  const sy = useSpring(live ? pt.y : 0, 50, still);
  const lit = useSpring(live ? 1 : 0, 50, still);

  const deep = clamp(sink, 0, 100) / 100;
  const max = deep * 13;
  const rx = -sy * max;
  const ry = sx * max;

  const px = ((sx + 1) / 2) * 100;
  const py = ((sy + 1) / 2) * 100;
  const dark = deep * 0.5 * lit;
  const rim = deep * 0.16 * lit;

  const track = (e: PointerEvent) => {
    const el = skin.current;
    if (!el) return;
    const b = el.getBoundingClientRect();
    setPt({
      x: clamp(((e.clientX - b.left) / b.width) * 2 - 1, -1, 1),
      y: clamp(((e.clientY - b.top) / b.height) * 2 - 1, -1, 1),
    });
    setOn(true);
  };

  return (
    <div
      ref={skin}
      className="car-card"
      onPointerMove={track}
      onPointerOut={(e) => {
        const el = skin.current;
        const to = e.relatedTarget as Node | null;
        if (!el || !to || !el.contains(to)) setOn(false);
      }}
      onPointerCancel={() => setOn(false)}
      style={{
        borderRadius: corner,
        backgroundImage: `url(${shot})`,
        transform: `translateZ(${(-10 * deep * lit).toFixed(2)}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`,
        boxShadow: "0 12px 28px -10px rgba(var(--shadow-rgb), 0.28)",
      }}
    >
      <span
        className="car-sheen"
        aria-hidden="true"
        style={{
          borderRadius: corner,
          backgroundImage: `radial-gradient(44% 36% at ${px.toFixed(1)}% ${py.toFixed(1)}%, rgba(9, 14, 28, ${dark.toFixed(3)}) 0%, rgba(9, 14, 28, 0) 100%), radial-gradient(54% 44% at ${(100 - px).toFixed(1)}% ${(100 - py).toFixed(1)}%, rgba(255, 255, 255, ${rim.toFixed(3)}) 0%, rgba(255, 255, 255, 0) 100%)`,
        }}
      />
    </div>
  );
}
