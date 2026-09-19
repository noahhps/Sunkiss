import { fileUrl, type FileEntry } from "../api";

// One thumbnail in QuickView's "print" style: the image shrunk to fit its box, with its
// name under it. `selected` marks the one being previewed, where there is one.
export default function Print({
  file,
  selected,
  onSelect,
}: {
  file: FileEntry;
  selected?: boolean;
  onSelect: (file: FileEntry) => void;
}) {
  return (
    <button
      type="button"
      className="print fade-in" // a thumbnail coming back as you delete text fades in
      title={file.name}
      aria-pressed={selected}
      onClick={() => onSelect(file)}
    >
      {/* Copies bigger than the box they're shown in, so they stay sharp on Retina screens. */}
      <img src={fileUrl(file, 400, 400)} alt={file.name} loading="lazy" />
      <span className="caption">{file.name}</span>
    </button>
  );
}
