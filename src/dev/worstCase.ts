// Dev only: the data the UI is tested against. `?data=worst` (or empty, one, many) swaps what
// the server says for one of these fixtures, at the same boundary the real data comes in by
// (api.ts), so the components can't tell the difference. Never active in a build: everything
// here is behind import.meta.env.DEV, and the bundler drops it.
import type { FileEntry, Version } from "../api";

export type DataMode = "demo" | "worst" | "empty" | "one" | "many";
export const MODES: { mode: DataMode; label: string }[] = [
  { mode: "demo", label: "Demo data" },
  { mode: "worst", label: "Worst case" },
  { mode: "empty", label: "Empty" },
  { mode: "one", label: "One" },
  { mode: "many", label: "1,284 files" },
];

export const dataMode = (): DataMode => {
  if (!import.meta.env.DEV) return "demo";
  const asked = new URLSearchParams(location.search).get("data");
  return MODES.some((m) => m.mode === asked) ? (asked as DataMode) : "demo";
};

// A fixture file borrows its picture from a real file on the server (so thumbnails still
// load), or is given a drawn one, or none at all (a picture that won't load is a case too).
type Picture = FileEntry | string | null;
const pictures: Map<string, Picture> = /* @__PURE__ */ new Map();
export const pictureFor = (name: string) => pictures.get(name);

const DAY = 86_400_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

// Drawn pictures in shapes the real folder doesn't have.
const svg = (w: number, h: number, fill: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${fill}"/><path d="M0 ${h} L${w * 0.4} ${h * 0.3} L${w} ${h}" fill="#ff6744"/></svg>`,
  )}`;

type Spec = {
  name: string;
  size: number;
  modified: string;
  versions?: number;
  picture: "real" | "real-video" | Picture;
  type?: string;
};

// What a real design team's folder ends up holding. The first rows matter most (they're what's
// on screen), so each one fails differently. (Built when asked for, so none of it is left in
// a production bundle.)
const worst = (): Spec[] => {
  const PANORAMA = svg(4000, 200, "#008cff"); // a stitched panorama
  const TALL = svg(200, 4000, "#2b6"); // a long scrolling-page capture
  const TRANSPARENT_DARK = `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><text x="40" y="240" font-size="160" font-family="Georgia" fill="#111">Ink</text></svg>`,
  )}`; // a black logo on a transparent ground
  return [
  // Camera names: long, no spaces, uppercase extension.
  { name: "IMG_20250914_183022_HDR_portrait_edited_edited.JPG", size: 8_420_118, modified: ago(60_000), versions: 214, picture: "real" },
  // Differs from its neighbours only at the end, where truncation cuts.
  { name: "Q3 Board Deck — FINAL (revised) v12 [approved by legal].png", size: 999_600, modified: ago(3 * 60_000), versions: 12, picture: "real" },
  { name: "Q3 Board Deck — FINAL (revised) v13 [approved by legal].png", size: 999_999, modified: ago(4 * 60_000), versions: 13, picture: "real" },
  // One letter.
  { name: "a.png", size: 412, modified: ago(5 * 60_000), picture: "real" },
  // No extension at all (a Figma export someone renamed).
  { name: "logo", size: 0, modified: ago(6 * 60_000), picture: null, type: "image/png" },
  // A panorama and a full-page capture.
  { name: "Shibuya crossing panorama.jpg", size: 41_200_000, modified: ago(DAY), picture: PANORAMA, type: "image/jpeg" },
  { name: "Full page capture — sunkiss.example.com.png", size: 3_100_000, modified: ago(DAY + 1000), picture: TALL, type: "image/png" },
  // A dark logo on transparency, on a dark UI.
  { name: "Wordmark (black, transparent).svg", size: 2_048, modified: ago(DAY + 2000), picture: TRANSPARENT_DARK, type: "image/svg+xml" },
  // Non-Latin, and right-to-left.
  { name: "王秀英的设计稿最终版本第二稿修改.png", size: 1_250_000, modified: ago(2 * DAY), versions: 3, picture: "real" },
  { name: "شعار الشركة الجديد - النسخة النهائية.png", size: 640_000, modified: ago(2 * DAY + 1000), picture: "real" },
  { name: "Đặng Thị Ngọc Hân — chân dung.jpg", size: 2_900_000, modified: ago(2 * DAY + 2000), picture: "real" },
  // Emoji, and characters that look like markup.
  { name: "👩🏽‍💻 Priya's moodboard <draft> & notes.png", size: 5_500_000, modified: ago(9 * DAY), picture: "real" },
  // A 2.4 GB screen recording, and a big Photoshop file (which the folder holds but Home filters out).
  { name: "Screen Recording 2026-10-01 at 10.14.52 PM — design review with Northwind Industries.mov", size: 2_412_000_000, modified: ago(40 * DAY), versions: 1_284, picture: "real-video", type: "video/quicktime" },
  { name: "Homepage hero — layered.psd", size: 1_840_000_000, modified: ago(41 * DAY), versions: 31, picture: null, type: "application/octet-stream" },
  // A picture that fails to load.
  { name: "Deleted on the server but still listed.png", size: 3_000_000, modified: ago(400 * DAY), picture: null, type: "image/png" },
  // Clock skew: saved "in the future", and a zero timestamp.
  { name: "From a laptop with its clock wrong.png", size: 700_000, modified: new Date(Date.now() + 3 * DAY).toISOString(), picture: "real" },
  { name: "Restored from an old backup.png", size: 1_000_000, modified: new Date(0).toISOString(), picture: "real" },
  // The longest name the disk allows: 255 bytes (APFS), and the server sets no other limit.
  { name: `${"Konstantin Oberhauser-Wettstein — Brand guidelines, final, ".repeat(4).slice(0, 237)}.png`, size: 4_000_000, modified: ago(500 * DAY), picture: "real" },
  ];
};

let listed: FileEntry[] = [];
export const isFixture = (name: string) => pictures.has(name);

function build(specs: Spec[], real: FileEntry[]): FileEntry[] {
  const stills = real.filter((f) => f.type.startsWith("image/"));
  const videos = real.filter((f) => f.type.startsWith("video/"));
  pictures.clear();
  return (listed = specs.map((spec, i) => {
    const borrowed = spec.picture === "real" ? stills[i % stills.length] : spec.picture === "real-video" ? videos[0] : undefined;
    pictures.set(spec.name, borrowed ?? (spec.picture as Picture));
    return {
      name: spec.name,
      type: spec.type ?? borrowed?.type ?? "image/png",
      size: spec.size,
      modified: spec.modified,
      etag: `"fixture-${i}"`,
      version: `fixture-${i}`,
      versions: spec.versions ?? 1,
    };
  }));
}

// The list the server would have sent, for the mode in the URL.
export function fixtureFiles(real: FileEntry[]): FileEntry[] {
  switch (dataMode()) {
    case "worst":
      return build(worst(), real);
    case "empty":
      return build([], real);
    case "one":
      return build([{ name: "Logo.svg", size: 1_000, modified: ago(60_000), picture: "real" }], real);
    case "many":
      return build(
        Array.from({ length: 1_284 }, (_, i) => ({
          name: `Export ${String(i + 1).padStart(4, "0")}.png`,
          size: 200_000 + i * 997,
          modified: ago(i * 3_600_000),
          picture: "real" as const,
        })),
        real,
      );
    default:
      return real;
  }
}

// A file's history: 1,284 saves for the recording, otherwise as many as it says.
export function fixtureVersions(name: string): Version[] {
  const file = listed.find((f) => f.name === name);
  const count = Math.min(file?.versions ?? 1, 1_284);
  return Array.from({ length: count }, (_, i) => ({
    id: i === 0 ? file!.version : `${file!.version}-${i}`,
    size: i % 7 === 3 ? 0 : (file?.size ?? 0) - i * 1_000, // an empty save, now and then
    modified: i === 0 ? file!.modified : ago(i * 4 * 3_600_000),
    etag: `"v${i}"`,
    current: i === 0,
  }));
}
