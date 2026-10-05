import { useLayoutEffect, useRef, useState } from "react";

export type Screen = "home" | "upload" | "stream" | "settings";

const LINKS: { screen: Screen; label: string }[] = [
  { screen: "home", label: "Home" },
  { screen: "upload", label: "Upload" },
  { screen: "stream", label: "Stream" },
  { screen: "settings", label: "Settings" },
];

// Sidebar navigation, in QuickView's style: straight on the glass, the current screen in a pill.
// The pill is one shape (the "seal") that slides to whichever link is current, rather than each
// link filling in on its own, so moving between screens reads as moving, not swapping.
export default function NavBar({ current, onNavigate }: { current: Screen; onNavigate: (screen: Screen) => void }) {
  const links = useRef<(HTMLButtonElement | null)[]>([]);
  const [seal, setSeal] = useState<{ y: number; height: number } | null>(null);

  // Measured before paint, so the seal is never seen in the wrong place. The very first time
  // it appears already there (an element's first style has nothing to transition from).
  useLayoutEffect(() => {
    const link = links.current[LINKS.findIndex((link) => link.screen === current)];
    if (link) setSeal({ y: link.offsetTop, height: link.offsetHeight });
  }, [current]);

  return (
    <nav className="sidebar">
      <div className="brand">
        <img src="/sunkiss.svg" alt="" />
        Sunkiss
      </div>
      {seal && (
        <span className="nav-seal" aria-hidden="true" style={{ transform: `translateY(${seal.y}px)`, height: seal.height }} />
      )}
      {LINKS.map(({ screen, label }, i) => (
        <button
          key={screen}
          ref={(el) => {
            links.current[i] = el;
          }}
          className="nav-link"
          onClick={() => onNavigate(screen)}
          aria-current={current === screen ? "page" : undefined}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
