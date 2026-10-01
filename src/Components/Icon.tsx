// Line icons, drawn in the text colour. App.css sizes them where they're used.
const PATHS = {
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  check: "M5 12.5l4.5 4.5L19 7",
  cross: "M7 7l10 10M17 7L7 17",
  folder: "M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z",
  open: "M14 5h5v5M19 5l-8 8M17 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4",
  chevron: "M7 10l5 5 5-5",
  upload: "M12 16V4M7 9l5-5 5 5M5 20h14",
};

export default function Icon({ name, className }: { name: keyof typeof PATHS; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d={PATHS[name]} />
    </svg>
  );
}
