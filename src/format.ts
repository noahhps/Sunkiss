/** A size the way Finder shows it (1 MB is 1,000,000 bytes). It's rounded before the unit is
 * picked, so 999,600 bytes is "1.0 MB", not "1000 KB". Under 1 KB it's counted in bytes,
 * so a tiny file isn't "0 KB". */
export function formatSize(bytes: number) {
  if (bytes < 1000) return `${bytes.toLocaleString()} ${bytes === 1 ? "byte" : "bytes"}`;
  const units = [
    { unit: "KB", size: 1e3, digits: 0 },
    { unit: "MB", size: 1e6, digits: 1 },
    { unit: "GB", size: 1e9, digits: 2 },
    { unit: "TB", size: 1e12, digits: 2 },
  ];
  for (const [i, { unit, size, digits }] of units.entries()) {
    const value = Number((bytes / size).toFixed(digits));
    if (value < 1000 || i === units.length - 1) {
      return `${value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${unit}`;
    }
  }
  return ""; // not reached
}

/** A count with the thousands separated the viewer's way: 1,284 (or 1.284). */
export const formatCount = (count: number) => count.toLocaleString();

/** A length the way Photos labels a video: 0:44, or 1:02:05 past an hour. */
export function formatDuration(seconds: number) {
  const whole = Math.round(seconds);
  const [h, m, s] = [Math.floor(whole / 3600), Math.floor((whole % 3600) / 60), whole % 60];
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** When a file was saved, as a time to sort and group by. A time in the future (a computer
 * with its clock wrong) counts as now, so it doesn't jump ahead of everything else. No time,
 * an unreadable one, or the zero time (1970, which is what a lost date turns into) is null:
 * unknown, rather than a made-up date. */
export function whenOf(iso: string): number | null {
  const time = Date.parse(iso);
  if (!Number.isFinite(time) || time <= 0) return null;
  return Math.min(time, Date.now());
}

/** When something was saved: "Today, 5:56 PM", "Yesterday, 3:43 PM" or "Sep 12, 4:56 PM", with
 * the year only when it isn't this one. */
export function formatWhen(iso: string) {
  const time = whenOf(iso);
  if (time === null) return "Unknown date";
  const date = new Date(time);
  const clock = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const day = new Date();
  if (date.toDateString() === day.toDateString()) return `Today, ${clock}`;
  day.setDate(day.getDate() - 1);
  if (date.toDateString() === day.toDateString()) return `Yesterday, ${clock}`;
  const year = date.getFullYear() === day.getFullYear() ? undefined : "numeric";
  return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric", year })}, ${clock}`;
}

/** A name shortened in the middle rather than at the end, as Finder does: file names in one
 * folder tend to differ at the end (v12, v13, final), which is the part end-truncation cuts.
 * Splits off the last few characters (up to `most`, whole characters, so an emoji isn't cut in half) to
 * be shown in full; the head gives way with an ellipsis. */
export function splitForMiddle(name: string, most = 28): [head: string, tail: string] {
  const parts =
    typeof Intl.Segmenter === "function"
      ? Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(name), (s) => s.segment)
      : Array.from(name);
  // Up to `most` characters, and never more than half the name, so some of the start shows too.
  const keep = Math.min(most, Math.ceil(parts.length * 0.5));
  if (parts.length <= keep) return ["", name];
  return [parts.slice(0, -keep).join(""), parts.slice(-keep).join("")];
}
