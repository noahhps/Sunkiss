import { useLayoutEffect, useRef, useState } from "react";
import Icon, { type IconName } from "./Icon";

export type Screen = "home" | "upload" | "kisses" | "settings";

// Each page, with its icon. Settings sits at the bottom of the sidebar, as it does in most
// apps, away from the pages you move between.
const LINKS: { screen: Screen; label: string; icon: IconName; end?: boolean }[] = [
  { screen: "home", label: "Home", icon: "grid" },
  { screen: "upload", label: "Upload", icon: "upload" },
  { screen: "kisses", label: "Kisses", icon: "heart" },
  { screen: "settings", label: "Settings", icon: "gear", end: true },
];

// Sidebar navigation, in QuickView's style: straight on the glass, the current screen in a
// pill, its icon in orange as the seal beside it. The pill is one shape that slides to
// whichever link is current, rather than each link filling in on its own, so moving between
// screens reads as moving, not swapping.
export default function NavBar({ current, onNavigate }: { current: Screen; onNavigate: (screen: Screen) => void }) {
  const links = useRef<(HTMLButtonElement | null)[]>([]);
  const [pill, setPill] = useState<{ y: number; height: number } | null>(null);

  // Measured before paint, so the pill is never seen in the wrong place. The very first time
  // it appears already there (an element's first style has nothing to transition from). Again
  // when the window changes height, since Settings sits at the bottom.
  useLayoutEffect(() => {
    const measure = () => {
      const link = links.current[LINKS.findIndex((link) => link.screen === current)];
      if (link) setPill({ y: link.offsetTop, height: link.offsetHeight });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [current]);

  return (
    <nav className="sidebar">
      <div className="brand">
        <img src="/sunkiss.svg" alt="" />
        Sunkiss
      </div>
      {pill && (
        <span className="nav-pill" aria-hidden="true" style={{ transform: `translateY(${pill.y}px)`, height: pill.height }} />
      )}
      {LINKS.map(({ screen, label, icon, end }, i) => (
        <button
          key={screen}
          ref={(el) => {
            links.current[i] = el;
          }}
          className={end ? "nav-link nav-end" : "nav-link"}
          onClick={() => onNavigate(screen)}
          aria-current={current === screen ? "page" : undefined}
        >
          <Icon name={icon} />
          {label}
        </button>
      ))}
    </nav>
  );
}
