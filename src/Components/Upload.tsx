import { useEffect, useRef, useState, type DragEvent } from "react";
import { Conflict, listFiles, uploadFile, type FileEntry } from "../api";
import { formatSize } from "../format";
import CombinedCarousel from "./CombinedCarousel";
import Icon from "./Icon";

type Status = "ready" | "sending" | "done" | "exists" | "failed";

// A file waiting to go, going, or gone. `name` is what it'll be called in Sunkiss, which
// "Keep both" changes; `etag` is the version already there, when there's one by that name.
type Item = { id: string; file: File; name: string; status: Status; sent: number; etag?: string; message?: string };

// The tag with a file's type on it, coloured by kind, the way the tags on bencho.dev's upload
// dropzone are.
const BADGES: Record<string, string> = {
  png: "#2f9e5b",
  jpg: "#e0861e",
  jpeg: "#e0861e",
  gif: "#d6409f",
  webp: "#12a594",
  svg: "#8e4ec6",
  psd: "#1473e6",
  pdf: "#e5484d",
  mov: "#008cff",
  mp4: "#008cff",
  m4v: "#008cff",
  webm: "#008cff",
};

// Upload: drop files in (or click to choose them), and "Kiss it in" sends them to Sunkiss.
// Images sent this session gather at the bottom, in the carousel, three at a time. A session
// lasts from opening this screen until leaving it. A file whose name is already in Sunkiss can
// go in as a copy beside it ("Keep both"), or as its new version ("Replace": the one it
// replaces is kept on the server). This is the start of the version-control page.
export default function Upload() {
  const [items, setItems] = useState<Item[]>([]);
  const [over, setOver] = useState(false); // a file is being dragged over the drop zone
  const [sending, setSending] = useState(false);
  const [library, setLibrary] = useState<FileEntry[]>([]); // what's in Sunkiss already
  const [session, setSession] = useState<FileEntry[]>([]); // images sent this session, newest first
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listFiles().then(setLibrary, () => {});
  }, []);

  const update = (id: string, change: Partial<Item>) =>
    setItems((list) => list.map((item) => (item.id === id ? { ...item, ...change } : item)));

  function add(files: FileList | null) {
    if (!files?.length) return;
    // Random ids rather than a counter, which would start again whenever the dev server
    // reloads this file with rows still on screen.
    const added = [...files].map((file) => ({ id: crypto.randomUUID(), file, name: file.name, status: "ready" as Status, sent: 0 }));
    setItems((list) => [...list, ...added]);
  }

  // Sends one file: new, or (with `replacing`, the ETag it replaces) as a new version.
  async function send(item: Item, replacing: string | null = null) {
    update(item.id, { status: "sending", sent: 0, message: undefined });
    try {
      const saved = await uploadFile(item.file, item.name, replacing, (sent) => update(item.id, { sent }));
      update(item.id, { status: "done", sent: item.file.size });
      // Newest first; a new version takes the old one's place.
      const without = (list: FileEntry[]) => list.filter((file) => file.name !== saved.name);
      setLibrary((list) => [saved, ...without(list)]);
      if (saved.type.startsWith("image/")) setSession((list) => [saved, ...without(list)]);
    } catch (err) {
      if (err instanceof Conflict && err.reason === "exists") update(item.id, { status: "exists", etag: err.etag });
      else update(item.id, { status: "failed", message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function kissItIn() {
    setSending(true);
    for (const item of items.filter((item) => item.status === "ready")) await send(item); // one at a time
    setSending(false);
  }

  // "Keep both": the same file under the next free name, the way Finder does it ("photo 2.png").
  function keepBoth(item: Item) {
    const taken = new Set([...library.map((file) => file.name), ...items.map((other) => other.name)]);
    const renamed = { ...item, name: nextFreeName(item.name, taken) };
    update(item.id, { name: renamed.name });
    void send(renamed);
  }

  // Dragging files over: the drop zone only reacts to files, not to text or links.
  const carriesFiles = (event: DragEvent) => event.dataTransfer.types.includes("Files");

  const ready = items.filter((item) => item.status === "ready");
  const readyBytes = ready.reduce((total, item) => total + item.file.size, 0);

  return (
    <main className="container upload-screen">
      <h1>Upload</h1>

      <div
        className="dropzone"
        data-over={over ? "" : undefined}
        role="button"
        tabIndex={0}
        aria-label="Add files: drop them here, or press to choose"
        onClick={() => picker.current?.click()}
        onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && picker.current?.click()}
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
          add(event.dataTransfer.files);
        }}
      >
        <span className="drop-icon">
          <Icon name="upload" />
        </span>
        <strong>{over ? "Drop to add" : "Drag files here"}</strong>
        <span className="hint">or click to choose · images, videos, PSDs, anything</span>
      </div>
      <input
        ref={picker}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          add(event.currentTarget.files);
          event.currentTarget.value = ""; // so choosing the same file again still counts
        }}
      />

      {items.length > 0 && (
        <ul className="uploads">
          {items.map((item) => (
            <Row
              key={item.id}
              item={item}
              onRemove={() => setItems((list) => list.filter((other) => other.id !== item.id))}
              onRetry={() => void send(item)}
              onKeepBoth={() => keepBoth(item)}
              onReplace={() => void send(item, item.etag ?? null)}
            />
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <div className="upload-footer">
          <span className="note">
            {ready.length > 0
              ? `${ready.length} ${ready.length === 1 ? "file" : "files"} · ${formatSize(readyBytes)}`
              : sending
                ? "Sending…"
                : "Nothing waiting to go"}
          </span>
          <button type="button" className="primary kiss" disabled={ready.length === 0 || sending} onClick={kissItIn}>
            Kiss it in
          </button>
        </div>
      )}

      <CombinedCarousel images={session} />
    </main>
  );
}

function Row({
  item,
  onRemove,
  onRetry,
  onKeepBoth,
  onReplace,
}: {
  item: Item;
  onRemove: () => void;
  onRetry: () => void;
  onKeepBoth: () => void;
  onReplace: () => void;
}) {
  const size = formatSize(item.file.size);
  const percent = item.file.size ? Math.round((item.sent / item.file.size) * 100) : 100;
  const status = {
    ready: `${size} · Ready`,
    sending: `${size} · ${percent}%`,
    done: `${size} · In Sunkiss`,
    exists: "Already in Sunkiss",
    failed: item.message ?? "Couldn't send it",
  }[item.status];

  return (
    <li className="upload" data-status={item.status}>
      <TypeTag name={item.name} />
      <div className="upload-text">
        <span className="upload-name" title={item.name}>
          {item.name}
        </span>
        <span className="upload-meta" title={status}>
          {item.status === "done" && <Icon name="check-circle" />}
          {status}
        </span>
        {item.status === "sending" && (
          <span className="upload-progress">
            <span style={{ width: `${percent}%` }} />
          </span>
        )}
      </div>
      <div className="upload-actions">
        {item.status === "exists" && (
          <>
            <button type="button" onClick={onKeepBoth} title="Add it beside the one there, under a new name">
              Keep both
            </button>
            <button type="button" onClick={onReplace} title="Save it as the new version; the one there is kept">
              Replace
            </button>
          </>
        )}
        {item.status === "failed" && (
          <button type="button" onClick={onRetry}>
            Try again
          </button>
        )}
        {item.status !== "sending" && item.status !== "done" && (
          <button type="button" className="round" aria-label={`Remove ${item.name}`} title="Remove" onClick={onRemove}>
            <Icon name="cross" />
          </button>
        )}
      </div>
    </li>
  );
}

// A file's type on a coloured tag ("FILE" when its name doesn't say).
function TypeTag({ name }: { name: string }) {
  const extension = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  return (
    <span className="type-tag" aria-hidden="true" style={{ background: BADGES[extension] ?? "#6b7280" }}>
      {(extension || "file").slice(0, 4).toUpperCase()}
    </span>
  );
}

// "photo.png" → "photo 2.png", or "photo 3.png" if that's taken too.
function nextFreeName(name: string, taken: Set<string>) {
  const dot = name.lastIndexOf(".");
  const [base, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}${extension}`;
    if (!taken.has(candidate)) return candidate;
  }
}
