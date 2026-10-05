import { useEffect, useRef } from "react";
import type { FileEntry } from "../api";
import { fullDate, relativeDay } from "../format";
import Print from "./Print";

type Day = { key: string; day: string; date: Date; files: FileEntry[] };

// Splits files into runs that share a calendar day, in the viewer's own time zone. Sorted by
// name or size, the same day can come round more than once, so each run is keyed by its first
// file too.
function groupByDay(files: FileEntry[]): Day[] {
  const days: Day[] = [];
  for (const file of files) {
    const date = new Date(file.modified);
    const day = date.toDateString();
    const current = days[days.length - 1];
    if (current?.day === day) current.files.push(file);
    else days.push({ key: `${day} ${file.name}`, day, date, files: [file] });
  }
  return days;
}

// The files as a timeline that scrolls sideways: a line across the top with a dot where
// each day starts, and that day's files in a row beneath it. `files` must already be
// sorted newest first; the newest sit at the left.
export default function Timeline({
  files,
  selected,
  onSelect,
}: {
  files: FileEntry[];
  selected: FileEntry | null;
  onSelect: (file: FileEntry) => void;
}) {
  const list = useRef<HTMLOListElement>(null);
  const opening = useRef(true);

  // Bring the chosen file to the middle of the strip: straight there when the timeline
  // opens, gliding when you pick another from it.
  useEffect(() => {
    list.current?.querySelector('.print-open[aria-pressed="true"]')?.scrollIntoView({
      block: "nearest",
      inline: "center",
      behavior: opening.current ? "instant" : "smooth",
    });
    opening.current = false;
  }, [selected?.name]);

  if (files.length === 0) return null; // no line with nothing on it

  return (
    <ol className="timeline" ref={list}>
      {groupByDay(files).map((day) => {
        const relative = relativeDay(day.date);
        return (
          <li key={day.key} className="day">
            <header className="day-head">
              <h2>{relative ?? fullDate(day.date)}</h2>
              <span className="day-meta">
                {relative && `${fullDate(day.date)} · `}
                {day.files.length} {day.files.length === 1 ? "item" : "items"}
              </span>
            </header>
            <div className="prints">
              {day.files.map((file) => (
                <Print
                  key={`${file.name}@${file.version}`} // a new version is a new print: a video's frame loads again
                  file={file}
                  selected={file.name === selected?.name}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
