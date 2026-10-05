import { kindOf, type FileEntry, type Version } from "../api";
import { formatSize, formatWhen, whenOf } from "../format";
import { useFileInfo } from "../hooks/useFileInfo";

// The file's facts, in a line under the stage: its kind (or where it was snapshotted from), its
// size in pixels (which the server reads from the file; in points for Illustrator), how many
// layers it has, its size in bytes, when it was saved, and how many versions it has. With an
// earlier version on the stage, the facts are that version's.
export default function Details({ file, version }: { file: FileEntry; version?: Version }) {
  const info = useFileInfo(file, version?.id);
  const link = file.link;
  const facts = [
    link?.source === "figma" ? `Figma · ${link.fileName} › ${link.nodeName}` : kindOf(file),
    info?.width && info.height ? `${info.width.toLocaleString()} × ${info.height.toLocaleString()}${info.units === "pt" ? " pt" : ""}` : null,
    info?.layerCount ? `${info.layerCount} ${info.layerCount === 1 ? "layer" : "layers"}` : null,
    formatSize(version?.size ?? file.size),
    whenOf(version?.modified ?? file.modified) === null ? "Date unknown" : `Saved ${formatWhen(version?.modified ?? file.modified)}`,
    `${file.versions} ${file.versions === 1 ? "version" : "versions"}`,
  ].filter((fact) => fact !== null);

  return <p className="details">{facts.join(" · ")}</p>;
}
