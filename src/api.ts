// Where the server is, and how to build URLs for its files.
export const SERVER = "http://localhost:8787";

export type FileEntry = { name: string; type: string };

// Types the server can resize (keep in sync with RESIZABLE in server/src/routes/files.ts).
const RESIZABLE = ["image/png", "image/jpeg", "image/webp"];

/** Whether the server can send a resized copy of this file. */
export const isResizable = (file: FileEntry) => RESIZABLE.includes(file.type);

/** URL for a file. With a width and/or height, asks the server for a copy that fits within them. */
export function fileUrl(file: FileEntry, width?: number, height?: number): string {
  const base = `${SERVER}/files/${encodeURIComponent(file.name)}`;
  if (!isResizable(file) || (!width && !height)) return base;
  const params = new URLSearchParams();
  if (width) params.set("w", String(width));
  if (height) params.set("h", String(height));
  return `${base}?${params}`;
}

/** Every file in the server's folder, with its type. */
export async function listFiles(): Promise<FileEntry[]> {
  const res = await fetch(`${SERVER}/files`);
  if (!res.ok) throw new Error(`The server answered ${res.status}`);
  return res.json();
}
