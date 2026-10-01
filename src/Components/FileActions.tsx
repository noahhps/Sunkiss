import { useEffect, useRef, useState } from "react";
import type { FileEntry } from "../api";
import { appsFor, openIn, showInFinder, useDriveFolder, type App } from "../drive";
import { kindOf, useChosenApp } from "../preferences";
import DownloadButton from "./DownloadButton";
import Icon from "./Icon";

// The file's actions, top right on the stage, opposite the back button. Show in Finder and
// Open in… use the file in the Sunkiss drive (~/Sunkiss), so they only appear in the desktop
// app, once the drive is mounted. Download is always there.
export default function FileActions({ file }: { file: FileEntry }) {
  const folder = useDriveFolder();

  return (
    <div className="file-actions">
      {folder && (
        <>
          <button type="button" className="pill" title="Show in Finder" onClick={() => void showInFinder(file)}>
            <Icon name="folder" />
            <span className="label">Show in Finder</span>
          </button>
          <OpenIn file={file} />
        </>
      )}
      <DownloadButton file={file} />
    </div>
  );
}

// "Open in Photoshop": opens the file in the app chosen for its kind in Settings, or else in
// its default app. The arrow beside it lists every app on this Mac that can open the file.
function OpenIn({ file }: { file: FileEntry }) {
  const chosen = useChosenApp(kindOf(file));
  const [apps, setApps] = useState<App[] | null>(null); // the file's apps, once macOS has said
  const [menuOpen, setMenuOpen] = useState(false);
  const area = useRef<HTMLDivElement>(null);

  // Ask which apps can open this file (for the default's name, and the menu). Opening another
  // file closes the menu.
  useEffect(() => {
    let current = true;
    setMenuOpen(false);
    setApps(null);
    appsFor(file)
      .then((list) => current && setApps(list))
      .catch(() => current && setApps([]));
    return () => {
      current = false;
    };
  }, [file.name]);

  // Clicking anywhere else, or pressing Escape, closes it too.
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      const clickedElsewhere = event instanceof MouseEvent && !area.current?.contains(event.target as Node);
      if (clickedElsewhere || (event instanceof KeyboardEvent && event.key === "Escape")) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menuOpen]);

  const target = chosen ?? apps?.find((app) => app.default);
  const label = target ? `Open in ${target.name}` : "Open";

  return (
    <div className="open-in split" ref={area}>
      <button type="button" className="pill" title={label} onClick={() => void openIn(file, chosen)}>
        <Icon name="open" />
        <span className="label">{label}</span>
      </button>
      <button
        type="button"
        className="pill more"
        title="Open in another app"
        aria-label="Open in another app"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen(!menuOpen)}
      >
        <Icon name="chevron" />
      </button>
      {menuOpen && apps && (
        <div className="menu fade-in" role="menu">
          {apps.length === 0 && <p className="menu-note">Nothing on this Mac opens this kind of file</p>}
          {apps.map((app) => (
            <button
              key={app.path}
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                void openIn(file, app);
              }}
            >
              {app.name}
              {app.default && <span className="tag">Default</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
