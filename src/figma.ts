import { useSyncExternalStore } from "react";
import { SERVER, type FileEntry } from "./api";

// Figma files live in Figma, so Sunkiss keeps snapshots of them: the server asks Figma to render
// the frames you pick and saves each as a PNG here, a new version each time (server/src/routes/
// figma.ts). Figma only answers with a personal access token, which is kept in this app's
// storage (Settings) and sent to the server with each request, never stored there.

const KEY = "sunkiss.figmaToken";
let token = read();
const listeners = new Set<() => void>();

function read() {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

/** Remembers the Figma token (an empty string forgets it). */
export function setFigmaToken(value: string) {
  token = value.trim();
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {
    // Not remembered next time, but still used for now.
  }
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** The Figma token, kept current. */
export const useFigmaToken = () => useSyncExternalStore(subscribe, () => token);

/** Whether a link points at a Figma file (figma.com/design/…, /file/, /board/, /proto/). */
export const looksLikeFigma = (url: string) => /^https?:\/\/(www\.)?figma\.com\/(file|design|board|proto|slides)\//.test(url.trim());

/** A frame on a page of a Figma file: what can be snapshotted. */
export type FigmaFrame = { id: string; name: string; type: string };
export type FigmaPage = { id: string; name: string; frames: FigmaFrame[] };
/** A Figma file, as far as the server read it: its pages and the frames on each. `nodeId` is
 * the frame the link pointed at, if it pointed at one. */
export type FigmaFile = {
  key: string;
  nodeId: string | null;
  name: string;
  lastModified: string;
  version: string;
  thumbnailUrl: string | null;
  pages: FigmaPage[];
};

// What the server said went wrong, or a plain message.
async function failure(res: Response) {
  const body = await res.json().catch(() => null);
  return new Error(body?.error ?? (res.status === 502 ? "Couldn't reach the server" : `The server answered ${res.status}`));
}

/** Asks the server to look at a Figma file (GET /figma/file): straight to the server, as uploads go. */
export async function inspectFigma(url: string): Promise<FigmaFile> {
  const res = await fetch(`${SERVER}/figma/file?url=${encodeURIComponent(url)}`, { headers: { "X-Figma-Token": token } }).catch(() => {
    throw new Error("Couldn't reach the server");
  });
  if (!res.ok) throw await failure(res);
  return res.json();
}

/** Snapshots frames of a Figma file into Sunkiss (POST /figma/snapshot): the files saved, and
 * the frames that couldn't be. */
export async function snapshotFigma(url: string, nodes: { id: string; name: string }[]): Promise<{ saved: FileEntry[]; failed: { node: string; reason: string }[] }> {
  const res = await fetch(`${SERVER}/figma/snapshot`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Figma-Token": token },
    body: JSON.stringify({ url, nodes }),
  }).catch(() => {
    throw new Error("Couldn't reach the server");
  });
  if (!res.ok && res.status !== 502) throw await failure(res);
  const answer = await res.json().catch(() => null);
  if (!answer?.saved) throw new Error(answer?.error ?? "Couldn't reach the server");
  return answer;
}
