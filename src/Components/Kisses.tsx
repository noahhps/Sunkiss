import { Fragment, useMemo } from "react";
import type { FileEntry, Kiss, Version } from "../api";
import { formatSize, fullDate, relativeDay } from "../format";
import { useActivity } from "../hooks/useActivity";
import Icon from "./Icon";
import type { Screen } from "./NavBar";
import Print from "./Print";
import RefreshButton from "./RefreshButton";
import { Thumb } from "./VersionTree";

const MONTHS = 12; // how far back the year goes: this month, and the eleven before it
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Midnight at the start of a day, in the viewer's time zone.
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const dayKey = (date: Date) => date.toDateString();
const kissCount = (n: number) => `${n.toLocaleString()} ${n === 1 ? "kiss" : "kisses"}`;
const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

// A kiss as a Version, for the thumbnail (VersionTree.tsx's Thumb).
const asVersion = (kiss: Kiss): Version => ({ id: kiss.id, size: kiss.size, modified: kiss.modified, etag: `"${kiss.id}"`, current: kiss.current });

type Day = { date: Date; count: number; level: number; today: boolean };
type Month = { key: string; label: string; days: Day[] };

// The year: the last twelve months, newest first, with a mark for every day up to today. A
// day with kisses is drawn as a sun, in four sizes up to the brightest day's. The year is
// named on the top row and wherever it changes on the way down.
function buildYear(byDay: Map<string, number>, today: Date) {
  const months: Month[] = [];
  let brightest: Day | null = null;
  let total = 0;
  for (let back = 0; back < MONTHS; back++) {
    const first = new Date(today.getFullYear(), today.getMonth() - back, 1);
    const length = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const days: Day[] = [];
    for (let n = 1; n <= length; n++) {
      const date = new Date(first.getFullYear(), first.getMonth(), n);
      if (date > today) break;
      const count = byDay.get(dayKey(date)) ?? 0;
      const day = { date, count, level: 0, today: date.getTime() === today.getTime() };
      days.push(day);
      total += count;
      if (count > (brightest?.count ?? 0)) brightest = day;
    }
    const year = back === 0 || first.getMonth() === 11 ? ` ${first.getFullYear()}` : "";
    months.push({ key: `${first.getFullYear()}-${first.getMonth()}`, label: `${MONTH_NAMES[first.getMonth()]}${year}`, days });
  }
  const most = brightest?.count ?? 1;
  for (const month of months) for (const day of month.days) day.level = day.count ? Math.ceil((day.count / most) * 4) : 0;
  return { months, brightest, total };
}

// Kisses: how often files were kissed in (saved as a new version). The year, a line a month,
// with a sun on every day something was kissed in; the files kissed most, as prints; and
// every kiss, by day, newest first, in the history's style. Each print and row opens its
// file on the Home screen.
export default function Kisses({ onNavigate, onOpen }: { onNavigate: (screen: Screen) => void; onOpen: (name: string) => void }) {
  const { kisses, error, loading, refreshing, refresh } = useActivity();
  const today = startOfDay(new Date());

  // The files as they are now, from their current versions (for the prints, and to open
  // them), and how many times each was kissed in.
  const { files, counts } = useMemo(() => {
    const files = new Map<string, FileEntry>();
    const counts = new Map<string, number>();
    for (const kiss of kisses) {
      counts.set(kiss.name, (counts.get(kiss.name) ?? 0) + 1);
      // Newest first, so the first of a file's kisses is its current version.
      if (!files.has(kiss.name)) {
        files.set(kiss.name, { name: kiss.name, type: kiss.type, size: kiss.size, modified: kiss.modified, etag: `"${kiss.id}"`, version: kiss.id, versions: 0 });
      }
    }
    for (const [name, file] of files) file.versions = counts.get(name) ?? 1;
    return { files, counts };
  }, [kisses]);

  // Which kiss of its file each one was: the first ever saved is kiss 1.
  const ordinals = useMemo(() => {
    const map = new Map<string, number>();
    const seen = new Map<string, number>();
    for (const kiss of [...kisses].reverse()) {
      const nth = (seen.get(kiss.name) ?? 0) + 1;
      seen.set(kiss.name, nth);
      map.set(`${kiss.name}@${kiss.id}`, nth);
    }
    return map;
  }, [kisses]);

  // How many kisses each day had, and the year drawn from that.
  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const kiss of kisses) {
      const key = dayKey(new Date(kiss.modified));
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [kisses]);
  const { months, brightest, total } = useMemo(() => buildYear(byDay, today), [byDay, today.getTime()]);

  // The files kissed more than once, most kissed first; ties go to the most recently kissed.
  const ranked = [...counts]
    .map(([name, count]) => ({ file: files.get(name)!, count }))
    .sort((a, b) => b.count - a.count || Date.parse(b.file.modified) - Date.parse(a.file.modified));
  const most = ranked.filter(({ count }) => count > 1);
  const once = ranked.length - most.length;

  // Every kiss, grouped by the day it was saved, newest first.
  const days = useMemo(() => {
    const groups: { key: string; date: Date; kisses: Kiss[] }[] = [];
    for (const kiss of kisses) {
      const date = new Date(kiss.modified);
      const key = dayKey(date);
      const last = groups[groups.length - 1];
      if (last?.key === key) last.kisses.push(kiss);
      else groups.push({ key, date, kisses: [kiss] });
    }
    return groups;
  }, [kisses]);

  return (
    <main className="container kisses-screen">
      <div className="toolbar">
        <RefreshButton busy={refreshing} onRefresh={refresh} />
      </div>
      <h1>Kisses</h1>

      {loading && <p className="waiting">Counting kisses…</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && kisses.length === 0 && (
        <div className="empty fade-in">
          <p>Nothing kissed in yet.</p>
          <button type="button" className="primary" onClick={() => onNavigate("upload")}>
            Upload files
          </button>
        </div>
      )}

      {kisses.length > 0 && (
        <>
          {/* The year in figures, set in the heading face. */}
          <ul className="figures fade-in">
            <li className="figure">
              <span className="figure-number">{total.toLocaleString()}</span>
              <span className="figure-label">{total === 1 ? "kiss" : "kisses"} this year</span>
            </li>
            <li className="figure">
              <span className="figure-number">{files.size}</span>
              <span className="figure-label">{files.size === 1 ? "file" : "files"} kissed</span>
            </li>
            {brightest && (
              <li className="figure">
                <span className="figure-number">{brightest.count}</span>
                <span className="figure-label">on the brightest day, {fullDate(brightest.date)}</span>
              </li>
            )}
          </ul>

          <section className="fade-in" aria-label="The last twelve months, with a sun on every day something was kissed in">
            <div className="year">
              {months.map((month, row) => (
                <Fragment key={month.key}>
                  <span className="month-name" style={{ gridRow: row + 1 }}>
                    {month.label}
                  </span>
                  {month.days.map((day) => (
                    <span
                      key={day.date.getDate()}
                      className="day-mark"
                      data-level={day.count ? day.level : undefined}
                      data-today={day.today ? "" : undefined}
                      title={`${day.count ? kissCount(day.count) : "Nothing kissed in"} on ${fullDate(day.date)}`}
                      style={{ gridRow: row + 1, gridColumn: day.date.getDate() + 1 }}
                    >
                      {day.count > 0 && <Icon name="sun" />}
                    </span>
                  ))}
                </Fragment>
              ))}
            </div>
            <p className="note year-note">A sun for every day something was kissed in: the more kisses, the brighter it burns.</p>
          </section>

          {most.length > 0 && (
            <section className="fade-in" aria-label="The files kissed most">
              <h2 className="section-title">Most kissed</h2>
              <div className="prints most-kissed">
                {most.map(({ file, count }) => (
                  <div key={file.name} className="most">
                    <Print file={file} onSelect={(chosen) => onOpen(chosen.name)} />
                    <span className="tally">{kissCount(count)}</span>
                  </div>
                ))}
              </div>
              {once > 0 && (
                <p className="note">
                  …and {once} {once === 1 ? "file" : "files"} kissed in once.
                </p>
              )}
            </section>
          )}

          <section className="fade-in" aria-label="Every kiss, by day">
            <h2 className="section-title">Every kiss</h2>
            {days.map((day) => (
              <div key={day.key} className="kiss-day">
                <h3>
                  {relativeDay(day.date) ?? fullDate(day.date)}
                  <span>
                    {relativeDay(day.date) && `${fullDate(day.date)} · `}
                    {kissCount(day.kisses.length)}
                  </span>
                </h3>
                <ol>
                  {day.kisses.map((kiss) => {
                    const file = files.get(kiss.name)!;
                    const nth = ordinals.get(`${kiss.name}@${kiss.id}`) ?? 1;
                    return (
                      <li key={`${kiss.name}@${kiss.id}`}>
                        <button type="button" className="kiss-row" title={`Open ${kiss.name}`} onClick={() => onOpen(kiss.name)}>
                          <Thumb file={file} version={asVersion(kiss)} />
                          <span className="kiss-text">
                            <span className="kiss-name">{kiss.name}</span>
                            <span className="kiss-meta">
                              {kiss.current && (
                                <span className="current">
                                  <Icon name="sun" className="sun-mark" />
                                  Current ·{" "}
                                </span>
                              )}
                              Kiss {nth} of {file.versions} · {time(kiss.modified)} · {formatSize(kiss.size)}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
