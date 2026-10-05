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
// pill, its icon in orange as the seal beside it.
export default function NavBar({ current, onNavigate }: { current: Screen; onNavigate: (screen: Screen) => void }) {
  return (
    <nav className="sidebar">
      <div className="brand">
        <img src="/sunkiss.svg" alt="" />
        Sunkiss
      </div>
      {LINKS.map(({ screen, label, icon, end }) => (
        <button
          key={screen}
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
