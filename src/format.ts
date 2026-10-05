/** A size the way Finder shows it (1 MB is 1,000,000 bytes). */
export const formatSize = (bytes: number) =>
  bytes >= 1e9
    ? `${(bytes / 1e9).toFixed(2)} GB`
    : bytes >= 1e6
      ? `${(bytes / 1e6).toFixed(1)} MB`
      : `${Math.round(bytes / 1e3)} KB`;

/** When something was saved: "Today, 5:56 PM", "Yesterday, 3:43 PM" or "Sep 12, 4:56 PM", with
 * the year only when it isn't this one. */
export function formatWhen(iso: string) {
  const date = new Date(iso);
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const day = new Date();
  if (date.toDateString() === day.toDateString()) return `Today, ${time}`;
  day.setDate(day.getDate() - 1);
  if (date.toDateString() === day.toDateString()) return `Yesterday, ${time}`;
  const year = date.getFullYear() === day.getFullYear() ? undefined : "numeric";
  return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric", year })}, ${time}`;
}

/** "Today" or "Yesterday" for those two days, which read faster than a date; null for any
 * other day, which fullDate spells out. */
export function relativeDay(date: Date): string | null {
  const day = new Date();
  if (date.toDateString() === day.toDateString()) return "Today";
  day.setDate(day.getDate() - 1);
  if (date.toDateString() === day.toDateString()) return "Yesterday";
  return null;
}

/** "Sat, Sep 12", with the year only when it isn't this one. */
export const fullDate = (date: Date) =>
  date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
