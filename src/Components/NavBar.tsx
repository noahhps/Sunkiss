import type { CSSProperties } from "react";

export type Screen = "home" | "stream" | "settings";

const LINKS: { screen: Screen; label: string }[] = [
  { screen: "home", label: "Home" },
  { screen: "stream", label: "Stream" },
  { screen: "settings", label: "Settings" },
];

// Top navigation: one button per screen, the current one highlighted.
export default function NavBar({ current, onNavigate }: { current: Screen; onNavigate: (screen: Screen) => void }) {
  return (
    <nav style={styles.nav}>
      {LINKS.map(({ screen, label }) => (
        <button
          key={screen}
          onClick={() => onNavigate(screen)}
          aria-current={current === screen ? "page" : undefined}
          style={current === screen ? styles.active : undefined}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}

const styles = {
  nav: { display: "flex", justifyContent: "center", gap: 8, padding: 12 },
  active: { borderColor: "#396cd8" },
} satisfies Record<string, CSSProperties>;
