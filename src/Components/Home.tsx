import { useState } from "react";
import { isVideo, type FileEntry, type Version } from "../api";
import { useFiles } from "../hooks/useFiles";
import FileActions from "./FileActions";
import Icon from "./Icon";
import Print from "./Print";
import RefreshButton from "./RefreshButton";
import SearchBox from "./SearchBox";
import Stage from "./Stage";
import Timeline from "./Timeline";
import VersionTree from "./VersionTree";

// Home: a grid of every image and video in the server's folder, newest first. Clicking one
// (or pressing Enter in the search box) opens it: it streams onto the stage, with its history
// beside it and the rest on a timeline beneath, and a back button returns to the grid. Typing
// narrows either view to names containing what's typed. Refresh, top left, asks the server
// for the list again.
export default function Home() {
  const { files, error, loading, refreshing, refresh, asked, update } = useFiles();
  const [query, setQuery] = useState(""); // what's typed so far
  const [openName, setOpenName] = useState<string | null>(null); // null shows the grid
  const [viewing, setViewing] = useState<Version | null>(null); // an earlier version, on the stage

  // Newest first, so both views start with what changed most recently.
  const media = files
    .filter((file) => file.type.startsWith("image/") || isVideo(file))
    .sort((a, b) => Date.parse(b.modified) - Date.parse(a.modified));
  const typed = query.trim().toLowerCase();
  const visible = typed ? media.filter((file) => file.name.toLowerCase().includes(typed)) : media;
  // The open file as the latest list has it, so after a refresh or a save it's the newest version.
  const selected = media.find((file) => file.name === openName) ?? null;

  const open = (file: FileEntry | null) => {
    setOpenName(file?.name ?? null);
    setViewing(null);
  };

  return (
    <main className="container">
      <SearchBox
        onChange={setQuery}
        onSearch={(name) => {
          // Enter opens the best guess: the exact name, else a name that starts with
          // what's typed, else the first (newest) result.
          const lower = name.toLowerCase();
          const match =
            visible.find((file) => file.name.toLowerCase() === lower) ??
            visible.find((file) => file.name.toLowerCase().startsWith(lower)) ??
            visible[0];
          if (match) open(match);
        }}
      />

      <div className="toolbar">
        {selected && (
          <button type="button" className="round tool" aria-label="Back to all files" title="Back" onClick={() => open(null)}>
            <Icon name="back" />
          </button>
        )}
        <RefreshButton busy={refreshing} onRefresh={refresh} />
      </div>

      {loading && <p className="waiting">Loading files…</p>}
      {error && <p className="error">{error}</p>}
      {typed && media.length > 0 && visible.length === 0 && <p className="note">Nothing matches “{query.trim()}”</p>}

      {selected ? (
        <>
          <FileActions file={selected} />
          <div className="file-view">
            <Stage file={selected} version={viewing ?? undefined} />
            <VersionTree
              key={selected.name}
              file={selected}
              viewing={viewing?.id ?? selected.version}
              stamp={asked}
              onView={(version) => setViewing(version.current ? null : version)}
              onSaved={(saved) => {
                update(saved);
                setViewing(null);
              }}
              onStale={refresh}
            />
          </div>

          <Timeline files={visible} selected={selected} onSelect={open} />
        </>
      ) : (
        <div className="prints">
          {visible.map((file) => (
            // A new version is a new print: a video's first frame and length load again.
            <Print key={`${file.name}@${file.version}`} file={file} onSelect={open} />
          ))}
        </div>
      )}
    </main>
  );
}
