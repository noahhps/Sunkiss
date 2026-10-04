import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { isDesign, isVideo, type FileEntry, type Version } from "../api";
import { useFiles } from "../hooks/useFiles";
import { useStoredState } from "../hooks/useStoredState";
import { useStarred } from "../stars";
import Details from "./Details";
import FileActions from "./FileActions";
import FilterBar, { SHOWS, SHOW_LABELS, SIZES, SORTS, type Show, type Size, type Sort } from "./FilterBar";
import Icon from "./Icon";
import Layers from "./Layers";
import type { Screen } from "./NavBar";
import Print from "./Print";
import RefreshButton from "./RefreshButton";
import SearchBox from "./SearchBox";
import Stage from "./Stage";
import Timeline from "./Timeline";
import VersionTree from "./VersionTree";

// How big a print is, for each size in the filter bar (App.css reads --print-size).
const PRINT_SIZES: Record<Size, string> = { s: "72px", m: "100px", l: "148px" };

// The orders the grid can be in.
const ORDERS: Record<Sort, (a: FileEntry, b: FileEntry) => number> = {
  newest: (a, b) => Date.parse(b.modified) - Date.parse(a.modified),
  oldest: (a, b) => Date.parse(a.modified) - Date.parse(b.modified),
  name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
  largest: (a, b) => b.size - a.size,
};

// What the grid shows: images, videos, and layered design files (Photoshop, Sketch, XD…).
const isMedia = (file: FileEntry) => file.type.startsWith("image/") || isVideo(file) || isDesign(file);
const isImage = (file: FileEntry) => file.type.startsWith("image/") && !isDesign(file);
const SHOWN: Record<Show, (file: FileEntry) => boolean> = { all: () => true, images: isImage, videos: isVideo, design: isDesign };

// Whether a key was pressed while typing, so it isn't a shortcut; and whether it was pressed
// on a slider (the compare divider), whose arrow keys are its own.
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && target.matches("input, textarea, select, [contenteditable]");
const sliding = (target: EventTarget | null) => target instanceof HTMLElement && target.matches("[role=slider]");

// Home: a grid of every image and video in the server's folder. The bar above it picks what
// to show (images, videos, only starred files), in what order, and how big; each choice is
// remembered. Clicking a print (or pressing Enter in the search box) opens it: it streams onto
// the stage, with its facts under it, its history beside it and the rest on a timeline
// beneath, and a back button (or Escape) returns to the grid. With a file open, ← and → go
// to the files either side of it; / focuses the search box from anywhere. Typing narrows
// either view to names containing what's typed. Refresh, top left, asks the server for the
// list again. Files dropped anywhere on the page go to the Upload screen, already chosen.
export default function Home({
  onNavigate,
  onDropFiles,
}: {
  onNavigate: (screen: Screen) => void;
  onDropFiles: (files: File[]) => void;
}) {
  const { files, error, loading, refreshing, refresh, asked, update } = useFiles();
  const [query, setQuery] = useState(""); // what's typed so far
  const [openName, setOpenName] = useState<string | null>(null); // null shows the grid
  const [viewing, setViewing] = useState<Version | null>(null); // an earlier version, on the stage
  const [comparing, setComparing] = useState(false); // that earlier version, against the current one
  const [over, setOver] = useState(false); // files are being dragged over the page
  const search = useRef<HTMLInputElement>(null);
  // What the grid shows, in what order, and how big: remembered between visits.
  const [show, setShow] = useStoredState<Show>("sunkiss.show", "all", SHOWS);
  const [sort, setSort] = useStoredState<Sort>("sunkiss.sort", "newest", SORTS);
  const [size, setSize] = useStoredState<Size>("sunkiss.size", "m", SIZES);
  const [starredOnly, setStarredOnly] = useStoredState<boolean>("sunkiss.starredOnly", false);
  const starred = useStarred();

  const library = files.filter(isMedia);
  const media = library
    .filter(SHOWN[show])
    .filter((file) => !starredOnly || starred.has(file.name))
    .sort(ORDERS[sort]);
  const typed = query.trim().toLowerCase();
  const visible = typed ? media.filter((file) => file.name.toLowerCase().includes(typed)) : media;
  // The open file as the latest list has it, so after a refresh or a save it's the newest
  // version. From the whole library, so changing a filter doesn't close it.
  const selected = library.find((file) => file.name === openName) ?? null;

  const open = (file: FileEntry | null) => {
    setOpenName(file?.name ?? null);
    setViewing(null);
    setComparing(false);
  };

  // Keyboard: / to search; with a file open, ← and → to the files either side of it on the
  // timeline, and Escape back to the grid.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return;
      if (event.key === "/") {
        event.preventDefault();
        search.current?.focus();
        return;
      }
      if (!selected) return;
      if (event.key === "Escape") return open(null);
      const step = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
      if (!step || sliding(event.target)) return;
      const next = visible[visible.findIndex((file) => file.name === selected.name) + step];
      if (next) {
        event.preventDefault();
        open(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Dragging files over the page: only files count, not text or links. Drops on the history
  // are its own (a new version of the open file), so those are left to it.
  const carriesFiles = (event: DragEvent) => event.dataTransfer.types.includes("Files");
  const forHistory = (event: DragEvent) => event.target instanceof Element && event.target.closest(".versions") !== null;

  return (
    <main
      className="container"
      style={{ "--print-size": PRINT_SIZES[size] } as CSSProperties}
      onDragEnter={(event) => {
        if (!carriesFiles(event)) return;
        if (forHistory(event)) return setOver(false);
        event.preventDefault();
        setOver(true);
      }}
      onDragOver={(event) => {
        if (!carriesFiles(event) || forHistory(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        // Leaving for one of its own children doesn't count.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(event) => {
        setOver(false);
        if (forHistory(event)) return;
        event.preventDefault();
        const dropped = Array.from(event.dataTransfer.files);
        if (dropped.length) onDropFiles(dropped);
      }}
    >
      <SearchBox
        inputRef={search}
        onChange={setQuery}
        onSearch={(name) => {
          // Enter opens the best guess: the exact name, else a name that starts with
          // what's typed, else the first result.
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
          <button type="button" className="round tool" aria-label="Back to all files" title="Back (Esc)" onClick={() => open(null)}>
            <Icon name="back" />
          </button>
        )}
        <RefreshButton busy={refreshing} onRefresh={refresh} />
      </div>

      {loading && <p className="waiting">Loading files…</p>}
      {error && <p className="error">{error}</p>}
      {typed && media.length > 0 && visible.length === 0 && <p className="note">Nothing matches “{query.trim()}”</p>}

      {!loading && !error && library.length === 0 && (
        <div className="empty fade-in">
          <p>Nothing in Sunkiss yet.</p>
          <button type="button" className="primary" onClick={() => onNavigate("upload")}>
            Upload files
          </button>
          <p className="note">Or drop them anywhere on this page.</p>
        </div>
      )}

      {selected ? (
        <>
          <FileActions
            file={selected}
            onUpdated={(saved) => {
              update(saved);
              setViewing(null);
              setComparing(false);
            }}
          />
          <div className="file-view">
            <div className="stage-column">
              <Stage file={selected} version={viewing ?? undefined} compare={comparing} />
              <Details file={selected} version={viewing ?? undefined} />
              <Layers file={selected} version={viewing ?? undefined} />
            </div>
            <VersionTree
              key={selected.name}
              file={selected}
              viewing={viewing?.id ?? selected.version}
              stamp={asked}
              comparing={comparing}
              onCompare={setComparing}
              onView={(version) => {
                setViewing(version.current ? null : version);
                if (version.current) setComparing(false); // nothing to compare it with
              }}
              onSaved={(saved) => {
                update(saved);
                setViewing(null);
                setComparing(false);
              }}
              onStale={refresh}
            />
          </div>

          <Timeline files={visible} selected={selected} onSelect={open} />
        </>
      ) : (
        library.length > 0 && (
          <>
            <FilterBar
              show={show}
              onShow={setShow}
              sort={sort}
              onSort={setSort}
              size={size}
              onSize={setSize}
              starredOnly={starredOnly}
              onStarredOnly={setStarredOnly}
              count={visible.length}
            />
            {media.length === 0 ? (
              <p className="note">
                {starredOnly ? "Nothing starred yet. Star a file from the corner of its print." : `No ${SHOW_LABELS[show].toLowerCase()} in Sunkiss.`}
              </p>
            ) : (
              <div className="prints">
                {visible.map((file) => (
                  // A new version is a new print: a video's first frame and length load again.
                  <Print key={`${file.name}@${file.version}`} file={file} onSelect={open} />
                ))}
              </div>
            )}
          </>
        )
      )}

      {over && (
        <div className="drop-veil" aria-hidden="true">
          <span>Drop to upload</span>
        </div>
      )}
    </main>
  );
}
