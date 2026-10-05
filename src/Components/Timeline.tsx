import { useEffect, useRef, useState } from "react";
import type { FileEntry } from "../api";
import { formatCount, fullDate, relativeDay, whenOf } from "../format";
import Print from "./Print";

// How many prints the timeline strings out at first, and how many more each "Show more" adds.
const PAGE = 200;

// A run of files from one day; `date` is null for files whose date isn't known.
type Day = { key: string; day: string; date: Date | null; files: FileEntry[] };

// Splits files into runs that share a calendar day, in the viewer's own time zone. Sorted by
// name or size, the same day can come round more than once, so each run is keyed by its first
// file too. A date in the future counts as today; an unknown one is a day of its own (whenOf).
function groupByDay(files: FileEntry[]): Day[] {
  const days: Day[] = [];
  for (const file of files) {
    const time = whenOf(file.modified);
    const date = time === null ? null : new Date(time);
    const day = date?.toDateString() ?? "unknown";
    const current = days[days.length - 1];
    if (current?.day === day) current.files.push(file);
    else days.push({ key: `${day} ${file.name}`, day, date, files: [file] });
  }
  return days;
}

// The files as a timeline that scrolls sideways: a line across the top with a dot where
// each day starts, and that day's files in a row beneath it. `files` must already be
// sorted newest first; the newest sit at the left. A long history shows its first few
// hundred (always including the open file), with the rest a click away.
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
  const [limit, setLimit] = useState(PAGE);

  const at = selected ? files.findIndex((file) => file.name === selected.name) : -1;
  const shown = files.slice(0, Math.max(limit, at + 1 + 20));

  // Bring the chosen file to the middle of the strip: straight there when the timeline
  // opens, gliding when you pick another from it. Only the strip scrolls, sideways:
  // scrollIntoView would scroll the page too, sliding the stage under the buttons pinned
  // along the top.
  useEffect(() => {
    const strip = list.current;
    const print = strip?.querySelector<HTMLElement>('.print-open[aria-pressed="true"]');
    if (!strip || !print) return;
    const offset = print.getBoundingClientRect().left - strip.getBoundingClientRect().left;
    strip.scrollTo({
      left: strip.scrollLeft + offset - (strip.clientWidth - print.offsetWidth) / 2,
      behavior: opening.current ? "instant" : "smooth",
    });
    opening.current = false;
  }, [selected?.name]);

  if (files.length === 0) return null; // no line with nothing on it

  return (
    <ol className="timeline" ref={list}>
      {groupByDay(shown).map((day) => {
        const relative = day.date && relativeDay(day.date);
        return (
          <li key={day.key} className="day">
            <header className="day-head">
              <h2>{day.date ? (relative ?? fullDate(day.date)) : "Unknown date"}</h2>
              <span className="day-meta">
                {relative && day.date && `${fullDate(day.date)} · `}
                {formatCount(day.files.length)} {day.files.length === 1 ? "item" : "items"}
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
      {files.length > shown.length && (
        <li className="show-more-item">
          <button type="button" className="show-more" onClick={() => setLimit(shown.length + PAGE)}>
            Show more · {formatCount(files.length - shown.length)} left
          </button>
        </li>
      )}
    </ol>
  );
}
