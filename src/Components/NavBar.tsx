export type Screen = "home" | "upload" | "stream" | "settings";

const LINKS: { screen: Screen; label: string }[] = [
  { screen: "home", label: "Home" },
  { screen: "upload", label: "Upload" },
  { screen: "stream", label: "Stream" },
  { screen: "settings", label: "Settings" },
];

// Sidebar navigation, in QuickView's style: straight on the glass, the current screen in a pill.
export default function NavBar({ current, onNavigate }: { current: Screen; onNavigate: (screen: Screen) => void }) {
  return (
    <nav className="sidebar">
      <div className="brand">
        <img src="/sunkiss.svg" alt="" />
        Sunkiss
      </div>
      {LINKS.map(({ screen, label }) => (
        <button
          key={screen}
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
