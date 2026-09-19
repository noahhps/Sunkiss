// Sidebar navigation, in QuickView's style: straight on the glass, the current screen in a pill.
export default function VersionTree({ version, onNavigate }: { current: Version; onNavigate: (version: Version) => void }) {
  return (
    <nav className="sidebar">
      <div className="currentTree">
        Current Version {version}
      </div>
      {LINKS.map(({ version, description, image }) => (
        <button
          key={version}
          className="nav-link"
          onClick={() => onNavigate(version)}
          aria-current={version === version ? "page" : undefined}
        >
          {image}
          {description}
        </button>
      ))}
    </nav>
  );
}
