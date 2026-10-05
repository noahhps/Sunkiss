import { useEffect, useState } from "react";
import { isVideo, type FileEntry } from "../api";
import { appsFor, openIn, showInFinder, useDriveFolder, type App } from "../drive";
import { openFigma, snapshotFigma } from "../figma";
import { formatSize } from "../format";
import { useSessionFile } from "../hooks/useSessionFile";
import { download, forget } from "../sessionCache";
import { toggleStar, useIsStarred } from "../stars";
import MagnetMenu, { type Chip } from "./MagnetMenu";

// An app's mark on a chip: its initials ("Ph" for Photoshop, "Pr" for Preview).
const initials = (name: string) => {
  const words = name.split(/[\s.-]+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).replace(/^./, (c) => c.toUpperCase());
};

// The menu on a print, right-clicked (MagnetMenu.tsx): what the open file's actions offer, on
// chips. Open holds its own cluster: on the stage here, in any app on this Mac that can open
// the file (in the desktop app, once the drive is mounted), in Finder, and in Figma for a
// snapshot. Then a star, Download (or letting the file go), and for a snapshot, asking Figma
// for it again.
export default function FileMenu({
  file,
  x,
  y,
  onClose,
  onOpen,
  onUpdated,
}: {
  file: FileEntry;
  x: number;
  y: number;
  onClose: () => void;
  onOpen: (file: FileEntry) => void;
  onUpdated: (file: FileEntry) => void;
}) {
  const folder = useDriveFolder();
  const starred = useIsStarred(file.name);
  const session = useSessionFile(file);
  const [apps, setApps] = useState<App[]>([]);

  // Which apps can open it, asked as the menu opens, so they're there by the time Open is.
  useEffect(() => {
    if (!folder) return;
    let current = true;
    appsFor(file)
      .then((list) => current && setApps(list))
      .catch(() => current && setApps([]));
    return () => {
      current = false;
    };
  }, [file.name, folder]);

  const link = file.link?.source === "figma" ? file.link : null;

  const open: Chip = {
    id: "open",
    label: "Open",
    icon: "open",
    children: [
      { id: "stage", label: `${isVideo(file) ? "Play" : "Open"} in Sunkiss`, icon: "sun", run: () => onOpen(file) },
      ...(folder
        ? apps.map((app) => ({ id: app.path, label: `Open in ${app.name}${app.default ? " (default)" : ""}`, text: initials(app.name), run: () => void openIn(file, app) }))
        : []),
      ...(folder ? [{ id: "finder", label: "Show in Finder", icon: "folder" as const, run: () => void showInFinder(file) }] : []),
      ...(link ? [{ id: "figma", label: "Open in Figma", text: "Fi", run: () => openFigma(link.url) }] : []),
    ],
  };
  const star: Chip = { id: "star", label: starred ? "Take the star off" : "Star", icon: "star", pressed: starred, run: () => toggleStar(file.name) };
  const keep: Chip =
    session?.status === "kept"
      ? { id: "forget", label: "Remove from this session", icon: "cross-circle", run: () => forget(file) }
      : session?.status === "downloading"
        ? { id: "stop", label: "Stop downloading", icon: "cross", run: () => forget(file) }
        : { id: "download", label: `Download · ${formatSize(file.size)}`, icon: "download", run: () => void download(file) };
  const chips: Chip[] = [open, star, keep];
  if (link) {
    chips.push({
      id: "snapshot",
      label: "Snapshot again from Figma",
      icon: "refresh",
      run: () => {
        void snapshotFigma(link.url, [{ id: link.nodeId, name: link.nodeName }]).then(({ saved }) => saved[0] && onUpdated(saved[0]), () => {});
      },
    });
  }

  return <MagnetMenu x={x} y={y} chips={chips} label={`Actions for ${file.name}`} onClose={onClose} />;
}
