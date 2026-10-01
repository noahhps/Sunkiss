import { useState } from "react";
import { isVideo, type FileEntry } from "../api";
import { useFiles } from "../hooks/useFiles";
import FileActions from "./FileActions";
import Print from "./Print";
import SearchBox from "./SearchBox";
import Stage from "./Stage";
import Timeline from "./Timeline";

// Home: a grid of every image and video in the server's folder, newest first. Clicking one
// (or pressing Enter in the search box) opens it: it streams onto the stage with the rest on
// a timeline beneath it, and a back button returns to the grid. Typing narrows either view
// to names containing what's typed.
export default function Home() {
  const { files, error, loading } = useFiles();
  const [query, setQuery] = useState(""); // what's typed so far
  const [selected, setSelected] = useState<FileEntry | null>(null); // null shows the grid

  // Newest first, so both views start with what changed most recently.
  const media = files
    .filter((file) => file.type.startsWith("image/") || isVideo(file))
    .sort((a, b) => Date.parse(b.modified) - Date.parse(a.modified));
  const typed = query.trim().toLowerCase();
  const visible = typed ? media.filter((file) => file.name.toLowerCase().includes(typed)) : media;

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
          if (match) setSelected(match);
        }}
      />

      {loading && <p className="waiting">Loading files…</p>}
      {error && <p className="error">{error}</p>}
      {typed && media.length > 0 && visible.length === 0 && <p className="note">Nothing matches “{query.trim()}”</p>}

      {selected ? (
        <>
          <button
            type="button"
            className="round back"
            aria-label="Back to all files"
            title="Back"
            onClick={() => setSelected(null)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>

          <FileActions file={selected} />
          <Stage file={selected} />

          <Timeline files={visible} selected={selected} onSelect={setSelected} />
        </>
      ) : (
        <div className="prints">
          {visible.map((file) => (
            <Print key={file.name} file={file} onSelect={setSelected} />
          ))}
        </div>
      )}
    </main>
  );
}
