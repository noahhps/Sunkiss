import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from "react";
import { Conflict, fileUrl, isVideo, restoreVersion, uploadFile, type FileEntry, type Version } from "../api";
import { formatSize, formatWhen } from "../format";
import { useVersions } from "../hooks/useHistory";
import Icon from "./Icon";

// A name's extension, lowercase: "png" for "Photo.PNG".
const extensionOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");

// Whether two names are the same kind of file (.jpg and .jpeg are).
const SPELLINGS: Record<string, string> = { jpeg: "jpg", tiff: "tif" };
const sameKind = (a: string, b: string) => {
  const kind = (name: string) => SPELLINGS[extensionOf(name)] ?? extensionOf(name);
  return kind(a) === kind(b);
};

// The open file's history, beside the stage, in the sidebar's style: straight on the glass,
// with the version on the stage in a pill. Every saved version is here, newest first. Pick
// one to see it on the stage; an earlier one can be restored, which saves it again as the
// newest version, so nothing is lost. A file chosen with "Save a new version", or dropped
// here, goes in as the next version.
export default function VersionTree({
  file,
  viewing,
  stamp,
  onView,
  onSaved,
  onStale,
}: {
  file: FileEntry;
  viewing: string; // the id of the version on the stage
  stamp: number; // changes when the list of files is refreshed, so the history loads again too
  onView: (version: Version) => void;
  onSaved: (file: FileEntry) => void; // a new version was saved: the file as it is now
  onStale: () => void; // the file changed on the server since it was listed
}) {
  const { versions, error, loading } = useVersions(file.name, `${file.version} ${stamp}`);
  const [busy, setBusy] = useState(false); // restoring, or saving a new version
  const [progress, setProgress] = useState<number | null>(null); // how much of a new version has gone, 0 to 1
  const [message, setMessage] = useState<string | null>(null);
  const [over, setOver] = useState(false); // a file is being dragged over
  const picker = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLOListElement>(null);

  // A new version goes in at the top: bring it into view, in case the list was scrolled down.
  useEffect(() => {
    list.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [file.version]);

  // Restoring and saving end the same way: the server says what the file is now, or why not.
  async function save(work: () => Promise<FileEntry>) {
    setBusy(true);
    setMessage(null);
    try {
      onSaved(await work());
    } catch (err) {
      if (err instanceof Conflict) {
        setMessage(
          err.reason === "missing"
            ? `${file.name} isn't in Sunkiss any more.`
            : "Someone saved a newer version in the meantime. It's in the list now: have a look, then try again.",
        );
        onStale();
      } else {
        setMessage(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  function saveNew(chosen: File | undefined) {
    if (!chosen || busy) return;
    if (!sameKind(chosen.name, file.name)) {
      setMessage(`A new version of ${file.name} has to be a .${extensionOf(file.name)} file too.`);
      return;
    }
    setProgress(0);
    void save(() => uploadFile(chosen, file.name, file.etag, (sent) => setProgress(chosen.size ? sent / chosen.size : 1)));
  }

  // Dragging files over: only files count, not text or links.
  const carriesFiles = (event: DragEvent) => event.dataTransfer.types.includes("Files");

  return (
    <aside
      className="versions"
      aria-label={`Versions of ${file.name}`}
      data-over={over ? "" : undefined}
      onDragEnter={(event) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragOver={(event) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        // Leaving for one of its own children doesn't count.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        saveNew(event.dataTransfer.files[0]);
      }}
    >
      <header className="versions-head">
        <h2>History</h2>
        {versions.length > 0 && (
          <span>
            {versions.length} {versions.length === 1 ? "version" : "versions"}
          </span>
        )}
      </header>
      {loading && versions.length === 0 && <p className="waiting">Loading versions…</p>}
      {error && <p className="error">{error}</p>}

      <ol className="version-list" ref={list}>
        {versions.map((version) => {
          const shown = version.id === viewing;
          return (
            <li key={version.id}>
              <button
                type="button"
                className="version"
                data-current={version.current ? "" : undefined}
                aria-current={shown ? "true" : undefined}
                onClick={() => onView(version)}
              >
                <Thumb file={file} version={version} />
                <span className="version-text">
                  <span className="version-when">
                    {version.current ? (
                      <>
                        <Icon name="sun" className="sun-mark" />
                        Current
                      </>
                    ) : (
                      formatWhen(version.modified)
                    )}
                  </span>
                  <span className="version-meta">
                    {version.current && `${formatWhen(version.modified)} · `}
                    {formatSize(version.size)}
                  </span>
                </span>
              </button>
              {shown && !version.current && (
                <button
                  type="button"
                  className="primary restore"
                  disabled={busy}
                  onClick={() => void save(() => restoreVersion(file, version))}
                >
                  Restore this version
                </button>
              )}
            </li>
          );
        })}
      </ol>

      <button
        type="button"
        className="new-version"
        disabled={busy}
        data-status={progress !== null ? "sending" : undefined}
        style={{ "--progress": `${Math.round((progress ?? 0) * 100)}%` } as CSSProperties}
        onClick={() => picker.current?.click()}
      >
        <Icon name="upload" />
        {progress !== null
          ? `Saving… ${Math.round(progress * 100)}%`
          : over
            ? "Drop to save as the next version"
            : "Save a new version"}
      </button>
      <input
        ref={picker}
        type="file"
        hidden
        // The same kind of file, by type: image/jpeg covers .jpg and .jpeg alike.
        accept={file.type !== "application/octet-stream" ? file.type : undefined}
        onChange={(event) => {
          saveNew(event.currentTarget.files?.[0]);
          event.currentTarget.value = ""; // so choosing the same file again still counts
        }}
      />
      {message && <p className="versions-note">{message}</p>}
    </aside>
  );
}

// A small picture of one version: a preview of an image, or a video's first frame.
function Thumb({ file, version }: { file: FileEntry; version: Version }) {
  return isVideo(file) ? (
    <video
      className="version-thumb"
      src={`${fileUrl(file, undefined, undefined, version.id)}#t=0.1`}
      preload="metadata"
      muted
      playsInline
    />
  ) : (
    <img className="version-thumb" src={fileUrl(file, 96, 96, version.id)} alt="" loading="lazy" draggable={false} />
  );
}
