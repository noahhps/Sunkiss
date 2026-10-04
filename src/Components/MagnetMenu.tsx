import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import Icon, { type IconName } from "./Icon";
import "./MagnetMenu.css";

/** One choice in the menu: an icon or a couple of letters on a chip, a label for when it's
 * under the pointer, and either something to do or more choices of its own. */
export type Chip = {
  id: string;
  label: string;
  icon?: IconName;
  text?: string; // instead of an icon: two letters, say an app's initials
  pressed?: boolean; // something that's on, like a star that's set
  children?: Chip[];
  run?: () => void;
};

// The chips' size and how closely they sit (after the magnetic select on bencho.dev: Pull 55,
// Bounce 55, Give 50).
const CHIP = 44; // px across
const PITCH = 48; // px between neighbours, centre to centre: packed, with a sliver of space between
const INNER = 30; // px from the origin to the ring, at least: the pointer sits in the gap in the middle
const PULL = 0.55; // how strong the magnet is, 0 to 1
const GIVE = 0.5; // how far a chip leans toward the pointer near it, 0 to 1
const LATE = 22; // ms a chip further from the magnet waits before it moves

type Spot = { x: number; y: number; s: number; r: number; late: number };

// The ring that packs n chips a PITCH apart, but no tighter than INNER around the pointer.
const ringRadius = (n: number) => Math.max(INNER, PITCH / (2 * Math.sin(Math.PI / Math.max(n, 2))));

// n points on an arc: a whole ring, or `span` radians of one centred on `facing`.
function arc(n: number, radius: number, facing: number, span: number): [number, number][] {
  const whole = span >= Math.PI * 2 - 1e-6;
  return Array.from({ length: n }, (_, i) => {
    const angle = whole ? facing + (i * Math.PI * 2) / n : n === 1 ? facing : facing - span / 2 + (i * span) / (n - 1);
    return [Math.cos(angle) * radius, Math.sin(angle) * radius];
  });
}

// Where every chip in a cluster sits once one of them is the magnet: that one swells, and the
// rest are shoved out of its way along the line from it, further than its swell alone needs
// (the push past that is what makes it feel repelled rather than merely making room), fading
// with distance. A shoved chip gives up a little size, tips with the sideways part of the shove,
// and waits a beat per step of distance.
function settle(base: [number, number][], magnet: number | null): Spot[] {
  const grow = 1.18 + 0.24 * PULL;
  const room = (CHIP * (grow - 1)) / 2;
  const aura = 4 + 10 * PULL;
  return base.map(([x, y], i) => {
    if (magnet === null) return { x, y, s: 1, r: 0, late: 0 };
    if (i === magnet) return { x, y, s: grow, r: 0, late: 0 };
    const [mx, my] = base[magnet];
    const dx = x - mx;
    const dy = y - my;
    const dist = Math.hypot(dx, dy) || 1;
    const steps = dist / PITCH;
    const fall = Math.exp(-(steps - 1) * 1.3);
    const push = room + aura * fall;
    const ux = dx / dist;
    const uy = dy / dist;
    const reach = Math.hypot(x, y) || 1;
    const across = (ux * y - uy * x) / reach; // the shove's part that runs around the origin
    return { x: x + ux * push, y: y + uy * push, s: 1 - 0.06 * fall, r: across * 8 * fall, late: Math.max(0, Math.round(steps) - 1) * LATE };
  });
}

// A menu that opens at a point as a cluster of round chips. The one under the pointer swells
// into a magnet and the others are pushed out of its way; each leans toward the pointer as it
// passes. Click a chip to choose it, or if it holds more choices, they bloom out around it as a
// second cluster. Escape, or a click anywhere else, closes it. Arrow keys walk the chips and
// Enter chooses, for anyone not using a mouse.
export default function MagnetMenu({ x, y, chips, label, onClose }: { x: number; y: number; chips: Chip[]; label: string; onClose: () => void }) {
  const veil = useRef<HTMLDivElement>(null);
  const [hub, setHub] = useState<number | null>(null); // the chip whose own choices are open
  const [hover, setHover] = useState<number | null>(null); // under the pointer, in whichever cluster is live
  const [lean, setLean] = useState<[number, number][]>([]); // each live chip's lean toward the pointer
  const pointer = useRef<[number, number] | null>(null);
  const frame = useRef(0);

  // Kept inside the window, with room for a cluster (and a second one) to open.
  const margin = PITCH * 2.6 + CHIP;
  const ox = Math.min(Math.max(x, margin), window.innerWidth - margin);
  const oy = Math.min(Math.max(y, margin), window.innerHeight - margin);

  const main = arc(chips.length, ringRadius(chips.length), -Math.PI / 2, Math.PI * 2);
  const sub = hub === null ? [] : (chips[hub].children ?? []);
  // The second cluster blooms around its hub, packed against it on the side away from the
  // origin: a step apart along the arc, or a whole ring when there are enough to fill one.
  const reach = PITCH + 6; // from the hub's centre to a sub-chip's: the hub is a little bigger
  const step = 2 * Math.asin(PITCH / 2 / reach);
  const subBase: [number, number][] =
    hub === null
      ? []
      : arc(sub.length, reach, Math.atan2(main[hub][1], main[hub][0]), Math.min(Math.PI * 2, (sub.length - 1) * step)).map(([dx, dy]) => [main[hub][0] + dx, main[hub][1] + dy]);
  const live = hub === null ? main : subBase; // the cluster the pointer works on
  const spots = settle(live, hover);
  const mainSpots = hub === null ? spots : settle(main, null);

  useEffect(() => {
    veil.current?.focus();
    const close = () => onClose();
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
      cancelAnimationFrame(frame.current);
    };
  }, [onClose]);

  // A cluster that opens with the pointer already on one of its chips has no pointerenter to
  // wait for: the chip under the pointer is the magnet from the start.
  useEffect(() => {
    const at = pointer.current;
    if (!at) return;
    const under = live.findIndex(([cx, cy]) => Math.hypot(at[0] - cx, at[1] - cy) <= CHIP / 2);
    if (under >= 0) setHover(under);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub]);

  // The lean: as the pointer passes near a chip, the chip tips a little toward it. Read once a
  // frame at most, for the live cluster only.
  const follow = (event: PointerEvent<HTMLDivElement>) => {
    pointer.current = [event.clientX - ox, event.clientY - oy];
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const at = pointer.current;
      if (!at) return;
      setLean(
        spots.map((spot) => {
          const dx = at[0] - spot.x;
          const dy = at[1] - spot.y;
          const dist = Math.hypot(dx, dy) || 1;
          const near = Math.max(0, 1 - dist / (PITCH * 1.7));
          const give = GIVE * 8 * near;
          return [(dx / dist) * give, (dy / dist) * give];
        }),
      );
    });
  };

  const choose = (i: number) => {
    const chip = live[i] && (hub === null ? chips[i] : sub[i]);
    if (!chip) return;
    if (chip.children?.length) {
      setHub(i);
      setHover(null);
      setLean([]);
      return;
    }
    onClose();
    chip.run?.();
  };

  const keys = (event: KeyboardEvent) => {
    const count = live.length;
    if (["Escape", "ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Enter", " "].includes(event.key)) event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      if (hub !== null) {
        setHub(null);
        setHover(null);
      } else onClose();
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      setHover((at) => (at === null ? 0 : (at + 1) % count));
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      setHover((at) => (at === null ? count - 1 : (at - 1 + count) % count));
    } else if ((event.key === "Enter" || event.key === " ") && hover !== null) {
      event.preventDefault();
      choose(hover);
    }
  };

  const chipAt = (chip: Chip, spot: Spot, i: number, inLive: boolean, from: [number, number]) => {
    const tilt = inLive ? lean[i] : undefined;
    return (
      <button
        key={chip.id}
        type="button"
        role="menuitem"
        className="mag-slot"
        aria-haspopup={chip.children?.length ? "menu" : undefined}
        aria-pressed={chip.pressed}
        tabIndex={-1}
        data-magnet={inLive && hover === i ? "" : undefined}
        data-hub={!inLive && hub === i ? "" : undefined}
        data-dim={!inLive && hub !== i ? "" : undefined}
        style={
          {
            translate: `${spot.x.toFixed(1)}px ${spot.y.toFixed(1)}px`,
            transitionDelay: `${spot.late}ms`,
            "--from": `${from[0]}px ${from[1]}px`,
          } as CSSProperties
        }
        onPointerEnter={inLive ? () => setHover(i) : undefined}
        onPointerLeave={inLive ? () => setHover((at) => (at === i ? null : at)) : undefined}
        onClick={(event) => {
          event.stopPropagation();
          if (inLive) choose(i);
          else if (hub === i) {
            setHub(null); // the hub again: back to the first cluster
            setHover(null);
          }
        }}
      >
        <span
          className="mag-chip"
          style={{ scale: String(spot.s), rotate: `${spot.r.toFixed(1)}deg`, translate: tilt ? `${tilt[0].toFixed(1)}px ${tilt[1].toFixed(1)}px` : undefined } as CSSProperties}
        >
          {chip.icon ? <Icon name={chip.icon} /> : <span className="mag-text">{chip.text}</span>}
        </span>
      </button>
    );
  };

  const named = hover !== null ? (hub === null ? chips[hover] : sub[hover]) : hub !== null ? chips[hub] : null;
  const namedSpot = hover !== null ? spots[hover] : hub !== null ? mainSpots[hub] : null;

  let caption: ReactNode = null;
  if (named && namedSpot) {
    caption = (
      <span className="mag-label" style={{ translate: `${namedSpot.x.toFixed(1)}px ${(namedSpot.y + (CHIP * namedSpot.s) / 2 + 12).toFixed(1)}px` }}>
        {named.label}
      </span>
    );
  }

  return (
    <div
      className="magnet-veil"
      ref={veil}
      tabIndex={-1}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onContextMenu={(event) => event.preventDefault()}
      onPointerMove={follow}
      onKeyDown={keys}
    >
      <div className="magnet" role="menu" aria-label={label} style={{ left: ox, top: oy }}>
        {chips.map((chip, i) => chipAt(chip, mainSpots[i], i, hub === null, [0, 0]))}
        {hub !== null && sub.map((chip, i) => chipAt(chip, spots[i], i, true, [main[hub][0], main[hub][1]]))}
        {caption}
      </div>
    </div>
  );
}
