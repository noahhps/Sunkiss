// Icons, drawn in the text colour, in two kinds. Anything with an inside (a folder, a stack,
// an action) is a solid shape: filled, with the mark cut out of it. Marks with no inside
// (arrows, a check, a cross) are glyphs: bold strokes. App.css sizes them where they're used,
// and sets a glyph's weight there with --glyph-weight.
const SOLID = {
  download: "M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19zM10.9 7.4h2.2v4.5h2.6L12 16.5l-3.7-4.6h2.6z",
  upload: "M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19zM13.1 16.6h-2.2v-4.5H8.3L12 7.5l3.7 4.6h-2.6z",
  "check-circle": "M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19zM8.8 10.7l2.1 2.1 4.3-4.3 1.8 1.8-6.1 6.1L7 12.5z",
  "cross-circle":
    "M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19zM9.45 7.75 12 10.3l2.55-2.55 1.7 1.7L13.7 12l2.55 2.55-1.7 1.7L12 13.7l-2.55 2.55-1.7-1.7L10.3 12 7.75 9.45z",
  folder: "M2.5 7a2 2 0 0 1 2-2h4.6a2 2 0 0 1 1.42.59L12 7h7.5a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2z",
  open: "M6 3.5h12A2.5 2.5 0 0 1 20.5 6v12a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 18V6A2.5 2.5 0 0 1 6 3.5zM10 8h6v6l-2.29-2.29-4.6 4.6-1.42-1.42 4.6-4.6z",
  versions:
    "M8 6.5V6a2.5 2.5 0 0 1 2.5-2.5H18A2.5 2.5 0 0 1 20.5 6v7.5a2.5 2.5 0 0 1-2.5 2.5h-.5V6.5zM6 8h7.5a2.5 2.5 0 0 1 2.5 2.5V18a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 18v-7.5A2.5 2.5 0 0 1 6 8z",
  // The logo's eight-point sun: marks the current version.
  sun: "M12 1.5L13.68 7.93L19.42 4.58L16.07 10.32L22.5 12L16.07 13.68L19.42 19.42L13.68 16.07L12 22.5L10.32 16.07L4.58 19.42L7.93 13.68L1.5 12L7.93 10.32L4.58 4.58L10.32 7.93Z",
  // A starred file (stars.ts).
  star: "M12 2.3L14.59 9.34L22.08 9.62L16.18 14.26L18.23 21.48L12 17.3L5.77 21.48L7.82 14.26L1.92 9.62L9.41 9.34Z",
  // The sidebar's pages (NavBar.tsx): the grid of prints, a heart for the kisses, and a gear.
  grid: "M5.5 3.5h3.5a2 2 0 0 1 2 2V9a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2zM15 3.5h3.5a2 2 0 0 1 2 2V9a2 2 0 0 1-2 2H15a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2zM5.5 13h3.5a2 2 0 0 1 2 2v3.5a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2V15a2 2 0 0 1 2-2zM15 13h3.5a2 2 0 0 1 2 2v3.5a2 2 0 0 1-2 2H15a2 2 0 0 1-2-2V15a2 2 0 0 1 2-2z",
  heart: "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
  gear: "M19.4 10.28L19.44 10.44L21.86 10.36L21.86 13.64L19.44 13.56L18.45 16.02L18.36 16.16L20.14 17.81L17.81 20.14L16.16 18.36L13.72 19.4L13.56 19.44L13.64 21.86L10.36 21.86L10.44 19.44L7.98 18.45L7.84 18.36L6.19 20.14L3.86 17.81L5.64 16.16L4.6 13.72L4.56 13.56L2.14 13.64L2.14 10.36L4.56 10.44L5.55 7.98L5.64 7.84L3.86 6.19L6.19 3.86L7.84 5.64L10.28 4.6L10.44 4.56L10.36 2.14L13.64 2.14L13.56 4.56L16.02 5.55L16.16 5.64L17.81 3.86L20.14 6.19L18.36 7.84zM12 9.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2z",
};

const GLYPHS = {
  check: "M5 12.5l4.5 4.5L19 7",
  cross: "M7 7l10 10M17 7L7 17",
  chevron: "M7 10l5 5 5-5",
  back: "M15 18l-6-6 6-6",
  refresh: "M20 12a8 8 0 1 1-2.34-5.66L20 8.6M20 3.6v5h-5",
  send: "M12 19V5M6 11l6-6 6 6",
  "arrow-down": "M12 5v13M6.5 12.5 12 18l5.5-5.5",
};

export type IconName = keyof typeof SOLID | keyof typeof GLYPHS;

export default function Icon({ name, className }: { name: IconName; className?: string }) {
  const solid = name in SOLID;
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} data-paint={solid ? "solid" : "glyph"}>
      {/* evenodd, so a mark drawn inside a solid shape cuts out of it */}
      <path d={solid ? SOLID[name as keyof typeof SOLID] : GLYPHS[name as keyof typeof GLYPHS]} fillRule="evenodd" />
    </svg>
  );
}
