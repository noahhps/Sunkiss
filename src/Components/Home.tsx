import { useState } from "react";
import { fileUrl, type FileEntry } from "../api";
import { useFiles } from "../hooks/useFiles";
import { useStream } from "../hooks/useStream";
import Print from "./Print";
import SearchBox from "./SearchBox";
import Timeline from "./Timeline";

const kb = (bytes: number) => `${Math.round(bytes / 1024).toLocaleString()} KB`;

// Home: a grid of every image in the server's folder, newest first. Clicking one (or
// pressing Enter in the search box) opens it: a preview streams in with the rest on a
// timeline beneath it, and a back button returns to the grid. Typing narrows either view
// to names containing what's typed.
export default function Home() {
  const { files, error, loading } = useFiles();
  const [query, setQuery] = useState(""); // what's typed so far
  const [selected, setSelected] = useState<FileEntry | null>(null); // null shows the grid

  // Newest first, so both views start with what changed most recently.
  const images = files
    .filter((file) => file.type.startsWith("image/"))
    .sort((a, b) => Date.parse(b.modified) - Date.parse(a.modified));
  const typed = query.trim().toLowerCase();
  const visible = typed ? images.filter((file) => file.name.toLowerCase().includes(typed)) : images;
  // Within 800×800, so a tall photo isn't streamed at 800 wide and over 1000 tall.
  const preview = useStream(selected ? fileUrl(selected, 800, 800) : null);

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
      {typed && images.length > 0 && visible.length === 0 && <p className="note">No images match “{query.trim()}”</p>}

      {selected ? (
        <>
          <button
            type="button"
            className="round back"
            aria-label="Back to all images"
            title="Back"
            onClick={() => setSelected(null)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>

          <section className="preview stage">
            {preview.status === "loading" && (
              <p className="waiting">
                Streaming {selected.name}… {kb(preview.received)}
              </p>
            )}
            {preview.status === "done" && <img className="fade-in" src={preview.src} alt={selected.name} />}
            {preview.status === "error" && <p className="error">{preview.message}</p>}
          </section>

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
