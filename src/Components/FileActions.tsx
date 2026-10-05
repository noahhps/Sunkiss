import { useEffect, useRef, useState } from "react";
import type { FileEntry } from "../api";
import { openFigma, snapshotFigma } from "../figma";
import { appsFor, openIn, showInFinder, useDriveFolder, type App } from "../drive";
import { kindOf, useChosenApp } from "../preferences";
import DownloadButton from "./DownloadButton";
import Icon from "./Icon";

// The file's actions, top right on the stage, opposite the back button. Open in… holds every
// way out: the apps on this Mac that can open the file (through the Sunkiss drive, ~/Sunkiss,
// so only in the desktop app once it's mounted), Finder, and Figma for a snapshot. A snapshot
// can also be asked of Figma again (`onUpdated` gets the file as it is then). Download is
// always there. The star is on the picture itself (Stage.tsx).
export default function FileActions({ file, onUpdated }: { file: FileEntry; onUpdated?: (file: FileEntry) => void }) {
  const folder = useDriveFolder();
  const linked = file.link?.source === "figma";

  return (
    <div className="file-actions">
      {(folder || linked) && <OpenIn file={file} />}
      {linked && <SnapshotAgain file={file} onUpdated={onUpdated} />}
      <DownloadButton file={file} />
    </div>
  );
}

// Ask Figma to render the frame again: the new render is the file's next version, so what
// changed in Figma since shows in the history and the compare view.
function SnapshotAgain({ file, onUpdated }: { file: FileEntry; onUpdated?: (file: FileEntry) => void }) {
  const link = file.link!;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function again() {
    setBusy(true);
    setMessage(null);
    try {
      const { saved, failed } = await snapshotFigma(link.url, [{ id: link.nodeId, name: link.nodeName }]);
      if (saved[0]) onUpdated?.(saved[0]);
      else setMessage(failed[0]?.reason ?? "Figma couldn't render it");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="pill"
      data-status={message ? "failed" : busy ? "busy" : undefined}
      disabled={busy}
      title={message ?? "Ask Figma to render this frame again, as the next version"}
      onClick={() => void again()}
    >
      <Icon name="refresh" />
      <span className="label">{busy ? "Rendering in Figma…" : message ? `${message} · Try again` : "Snapshot again"}</span>
    </button>
  );
}

// "Open in Photoshop": opens the file in the app chosen for its kind in Settings, or else in
// its default app. The arrow beside it lists every app on this Mac that can open the file,
// then Finder, and Figma for a snapshot. Without the drive (a plain browser) there are no apps,
// so for a snapshot the button itself opens Figma.
function OpenIn({ file }: { file: FileEntry }) {
  const folder = useDriveFolder();
  const chosen = useChosenApp(kindOf(file));
  const [apps, setApps] = useState<App[] | null>(null); // the file's apps, once macOS has said
  const [menuOpen, setMenuOpen] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  const link = file.link?.source === "figma" ? file.link : null;

  // Ask which apps can open this file (for the default's name, and the menu). Opening another
  // file closes the menu.
  useEffect(() => {
    let current = true;
    setMenuOpen(false);
    setApps(null);
    if (!folder) {
      setApps([]);
      return;
    }
    appsFor(file)
      .then((list) => current && setApps(list))
      .catch(() => current && setApps([]));
    return () => {
      current = false;
    };
  }, [file.name, folder]);

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
  const label = folder ? (target ? `Open in ${target.name}` : "Open") : "Open in Figma";
  const go = () => (folder ? void openIn(file, chosen) : link && openFigma(link.url));
  const extras = (folder ? 1 : 0) + (link ? 1 : 0); // Finder, Figma

  return (
    <div className="open-in split" ref={area}>
      <button type="button" className="pill" title={label} onClick={go}>
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
        <div className="menu" role="menu">
          {folder && apps.length === 0 && <p className="menu-note">Nothing on this Mac opens this kind of file</p>}
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
          {extras > 0 && (folder ? apps.length > 0 : false) && <hr />}
          {folder && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                void showInFinder(file);
              }}
            >
              Show in Finder
            </button>
          )}
          {link && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                openFigma(link.url);
              }}
            >
              Open in Figma
              <span className="tag">{link.nodeName}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
