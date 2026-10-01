import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
const ORBIT = 138;
const DEPTH = 100;
const DEPTH_MAX = 150;
const CORNER = 18;
const FLOAT = 15;
const SINK = 50;
const SETTLE = 50;
const LEAN = 38; // vertical offset for back cards
const PULL = 140; // px of drag per step
const TOSS = 150; // ms travel look‑ahead for flick
const MOST = 2; // safeguard max skip on flick
const BASE = 620;

/* Card layout */
const CARD_W = 206;
const CARD_H = 292;
const STAGE_W = 476;
const STAGE_H = 340;

/* Demo photo layout – the original block uses SHOTS; we’ll build it from props */

export default function CombinedCarousel({ images }: { images: FileEntry[] }) {
  // Build shots array from FileEntry list
  const shots = images.map((file) => ({ name: file.name, src: fileUrl(file, 400, 400) }));

  const still = stillness();

  // Refs for each slot element
  const slots = useRef<(HTMLDivElement | null)[]>([]);
  // Turn index – positions the ring
  const turn = useRef(0);
  const raf = useRef(0);
  const drag = useRef<
    | {
        x0: number;
        t0: number;
        last: number;
        t: number;
        vx: number;
        moved: boolean;
      }
    | null
  >(null);
  const [held, setHeld] = useState(false);

  // Helper to write transform for a slot
  const write = (el: HTMLElement, sp: Spot, angle: number) => {
    el.style.transform = `translate(-50%, -50%) translate(${sp.x.toFixed(2)}px, ${sp.y.toFixed(2)}px) rotate(${angle}deg) scale(${sp.s.toFixed(4)})`;
    el.style.zIndex = String(sp.z);
  };

  // Calculate spot of a card on the ring
  const spotOf = (i: number, turnVal: number, orbit: number, depth: number): Spot => {
    const th = (i - turnVal) * ((Math.PI * 2) / shots.length);
    const f = (Math.cos(th) + 1) / 2;
    return {
      x: Math.sin(th) * orbit,
      y: -(1 - f) * LEAN,
      s: mix(1 - clamp(depth, 0, DEPTH_MAX) / 200, 1, f),
      z: Math.round(f * 100),
    };
  };

  // Paint all slots based on current turn
  const paint = useCallback(() => {
    slots.current.forEach((el, i) => {
      if (!el) return;
      const sp = spotOf(i, turn.current, ORBIT, DEPTH);
      const angle = ANGLE[i % ANGLE.length];
      write(el, sp, angle);
    });
  }, []);

  // Start loop for rotating the ring (if spin is desired – we’ll leave spin off)
  useEffect(() => {
    // No auto‑spin in this UI; user drags to rotate.
    return () => cancelAnimationFrame(raf.current);
  }, []);

  /* ── Drag handling ──────────────────────────────────────── */
  const down = (e: React.PointerEvent) => {
    cancelAnimationFrame(raf.current);
    drag.current = {
      x0: e.clientX,
      t0: turn.current,
      last: e.clientX,
      t: e.timeStamp,
      vx: 0,
      moved: false,
    };
    setHeld(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };

  const move = (e: React.PointerEvent) => {
    const g = drag.current;
    if (!g) return;
    const dx = e.clientX - g.x0;
    if (!g.moved && Math.abs(dx) > 3) g.moved = true;
    const dt = Math.max(1, e.timeStamp - g.t);
    g.vx = (g.vx + (e.clientX - g.last) / dt) / 2;
    g.last = e.clientX;
    g.t = e.timeStamp;
    turn.current = g.t0 - dx / PULL;
    paint();
  };

  const up = () => {
    const g = drag.current;
    if (!g) return;
    drag.current = null;
    setHeld(false);
    const carry = clamp((-g.vx * TOSS) / PULL, -MOST, MOST);
    const to = Math.round(turn.current + carry);
    glide(to);
  };

  const key = (e: React.KeyboardEvent) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    go(d);
  };

  /* ── Snap to nearest integer turn after interaction ─────── */
  const glide = (to: number) => {
    cancelAnimationFrame(raf.current);
    const from = turn.current;
    if (still() || from === to) {
      turn.current = to;
      paint();
      return;
    }
    const ms = BASE * rate(clamp(SETTLE, 0, 100));
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      turn.current = mix(from, to, out(p));
      paint();
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };

  const go = (d: number) => glide(Math.round(turn.current) + d);

  // Utility functions used by glide
  const rate = (speed: number) => 1.6 - (speed / 100) * 1.2;
  const out = (v: number) => 1 - Math.pow(v, 4);

  // Angle layout (from the original block)
  const ANGLE = [-4.2, 2.6, -1.4, 3.8, 1.7];

  // Types for spot result
  type Spot = { x: number; y: number; s: number; z: number };

  return (
    <div className="combined-carousel" style={{ width: STAGE_W, height: STAGE_H }}>
      <div
        className="car-track"
        data-held={held ? "" : undefined}
        role="group"
        aria-label="Image carousel"
        tabIndex={0}
        onKeyDown={key}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
      >
        {shots.map((shot, i) => (
          <div
            key={shot.name}
            ref={(el) => {
              slots.current[i] = el;
            }}
            className="car-slot"
            style={{ width: CARD_W, height: CARD_H }}
          >
            <div
              className="car-float"
              style={{
                animationName: FLOAT <= 0 ? "none" : undefined,
                animationDuration: `${PERIOD[i % PERIOD.length]}s`,
                ["--lift" as string]: `${((clamp(FLOAT, 0, 100) / 100) * 16).toFixed(2)}px`,
                ["--sway" as string]: `${((clamp(FLOAT, 0, 100) / 100) * 1.4}deg`,
              }}
            >
              <Card shot={shot.src} corner={clamp(CORNER, 0, 40)} sink={SINK} off={held || still} />
            </div>
          </div>
        ))}
      </div>
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

  const track = (e: React.PointerEvent) => {
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
