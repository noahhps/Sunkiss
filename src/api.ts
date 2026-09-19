// Where the server is, and how to build URLs for its files.
export const SERVER = "http://localhost:8787";

/** A file in the server's folder. `modified` is when it was last saved, as an ISO date. */
export type FileEntry = { name: string; type: string; modified: string, version: string };
export type Version = {name: string, id: string};

// Types the server can resize (keep in sync with RESIZABLE in server/src/routes/files.ts).
const RESIZABLE = ["image/png", "image/jpeg", "image/webp"];

/** Whether the server can send a resized copy of this file. */
export const isResizable = (file: FileEntry) => RESIZABLE.includes(file.type);

/** URL for a file. With a width and/or height, asks the server for a copy that fits within them. */
export function fileUrl(file: FileEntry, width?: number, height?: number, version?: string): string {
  const base = `${SERVER}/files/${encodeURIComponent(file.name)}`;
  if (!isResizable(file) || (!width && !height)) return base;
  const params = new URLSearchParams();
  if (width) params.set("w", String(width));
  if (height) params.set("h", String(height));
  if (version) params.set("V", String(version)); // V is intententionally capitalized for Versions
  return `${base}?${params}`;
}


/** Every file in the server's folder, with its type and when it was last saved. */
export async function listFiles(): Promise<FileEntry[]> {
  const res = await fetch(`${SERVER}/files`);
  if (!res.ok) throw new Error(`The server answered ${res.status}`);
  return res.json();
}


/** Every saved version of one file. (GET /files/:name/versions isn't on the server yet.) */
export async function listVersions(name: string): Promise<Version[]> {
  const res = await fetch(`${SERVER}/files/${encodeURIComponent(name)}/versions`);
  if (!res.ok) throw new Error(`The server answered ${res.status}`);
  return res.json();
}