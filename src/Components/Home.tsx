import { useRef, useState } from "react";
import { type FileEntry, type Version } from "../api";
import { formatCount, whenOf } from "../format";
import { useFiles } from "../hooks/useFiles";
import FileActions from "./FileActions";
import Icon from "./Icon";
import Print from "./Print";
import RefreshButton from "./RefreshButton";
import SearchBox from "./SearchBox";
import Stage from "./Stage";
import Timeline from "./Timeline";
import VersionTree from "./VersionTree";

// How many prints the grid shows at first, and how many more each "Show more" adds: a folder of
// thousands would otherwise build thousands of prints before showing any.
const PAGE = 200;

// Home: a grid of every file in the server's folder, newest first: images and videos as
// pictures, anything else (a PSD, a PDF) as a tile with its kind on it. Clicking one
// (or pressing Enter in the search box) opens it: it streams onto the stage, with its history
// beside it and the rest on a timeline beneath, and a back button returns to the grid. Typing
// narrows either view to names containing what's typed. Refresh, top left, asks the server
// for the list again. With nothing in the folder it says so, and `onUpload` takes you to Upload.
export default function Home({ onUpload }: { onUpload?: () => void }) {
  const { files, error, loading, refreshing, refresh, asked, update } = useFiles();
  const [query, setQuery] = useState(""); // what's typed so far
  const [openName, setOpenName] = useState<string | null>(null); // null shows the grid
  const [viewing, setViewing] = useState<Version | null>(null); // an earlier version, on the stage
  const [limit, setLimit] = useState(PAGE); // how many prints the grid shows

  // Newest first, so both views start with what changed most recently. A file whose date
  // isn't known goes last; one dated in the future counts as now (see whenOf).
  const media = [...files].sort((a, b) => (whenOf(b.modified) ?? -1) - (whenOf(a.modified) ?? -1));
  const typed = query.trim().toLowerCase();
  const visible = typed ? media.filter((file) => file.name.toLowerCase().includes(typed)) : media;
  // The open file as the latest list has it, so after a refresh or a save it's the newest version.
  const selected = media.find((file) => file.name === openName) ?? null;

  // When the grid first had prints in it. For a moment after, prints are staggered in as a
  // group; after that (say, coming back as you type) each just appears, without waiting its
  // turn: typing should never feel like it's queued behind an animation.
  const gridShown = useRef<number | null>(null);
  if (selected || visible.length === 0) gridShown.current = null;
  else gridShown.current ??= performance.now();
  const staggering = gridShown.current !== null && performance.now() - gridShown.current < 300;

  // Where the grid was scrolled to, while a file is open, to go back to.
  const gridScroll = useRef(0);

  const open = (file: FileEntry | null) => {
    // A file opens at the top of the page, whatever the grid was scrolled to (otherwise the
    // stage would start under the buttons pinned along the top). Back returns to the same
    // place in the grid. Choosing another file along the timeline leaves the page where it is.
    if (file && !openName) {
      gridScroll.current = window.scrollY;
      window.scrollTo({ top: 0, behavior: "instant" });
    } else if (!file && openName) {
      requestAnimationFrame(() => window.scrollTo({ top: gridScroll.current, behavior: "instant" }));
    }
    setOpenName(file?.name ?? null);
    setViewing(null);
  };

  return (
    <main className="container">
      <SearchBox
        onChange={(text) => {
          setQuery(text);
          setLimit(PAGE);
        }}
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
      {!loading && !error && media.length === 0 && (
        <section className="empty">
          <h2>Nothing kissed in yet</h2>
          <p>Files you upload show up here, newest first.</p>
          {onUpload && (
            <button type="button" className="primary" onClick={onUpload}>
              Upload files
            </button>
          )}
        </section>
      )}

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
        <>
          <div className="prints">
            {visible.slice(0, limit).map((file, i) => (
              // A new version is a new print: a video's first frame and length load again.
              <Print key={`${file.name}@${file.version}`} file={file} index={staggering ? i : undefined} onSelect={open} />
            ))}
          </div>
          {visible.length > limit && (
            <button type="button" className="show-more" onClick={() => setLimit(limit + PAGE)}>
              Show more · {formatCount(visible.length - limit)} left
            </button>
          )}
        </>
      )}
    </main>
  );
}
