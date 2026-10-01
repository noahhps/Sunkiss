import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import fs from 'node:fs/promises'
import path from 'node:path'
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import sharp from 'sharp';


const files = new Hono();


// The folder to serve from: server/files, no matter where the server is started.
const FILES_DIR = path.join(import.meta.dirname, '..', '..', 'files');

const typeOf = (name: string) =>
  CONTENT_TYPES[path.extname(name).toLowerCase()] ?? 'application/octet-stream';
    
const CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.m4v': 'video/x-m4v',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
};



// Changes whenever a file is saved again, so a client can tell versions apart by it. The
// list and the file itself (GET /:name) give the same value.
const etagOf = (info: { size: number; mtimeMs: number }) =>
  `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;

// GET /files → the name, type, size in bytes, last-changed time and ETag of every file in FILES_DIR
files.get('/', async (c) => {
  const entries = await readdir(FILES_DIR, { withFileTypes: true });
  const list = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
      .map(async (entry) => {
        const info = await stat(path.join(FILES_DIR, entry.name));
        // When the file was last saved, as an ISO date the client can put on its timeline.
        return {
          name: entry.name,
          type: typeOf(entry.name),
          size: info.size,
          modified: info.mtime.toISOString(),
          etag: etagOf(info),
        };
      }),
  );
  return c.json(list);
});

// Image types sharp can resize without changing the format (SVG would become PNG,
// GIF would lose its animation), so only these get a ?w= preview.
const RESIZABLE = new Set(['.png', '.jpg', '.jpeg', '.webp']);

// Reads a Range header: "bytes=0-1023" (the first 1024 bytes), "bytes=1024-" (from byte 1024
// to the end) or "bytes=-500" (the last 500). Returns the span to send; null to send the whole
// file instead (no header, or a kind we don't handle, like several ranges at once, which HTTP
// allows a server to ignore); or 'unsatisfiable' when it starts past the end of the file.
function parseRange(header: string | undefined, size: number) {
  const match = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!match || size === 0) return null;
  const [, from, to] = match;
  if (from === '') {
    if (to === '') return null;
    const last = Number(to); // "bytes=-500"
    return last === 0 ? 'unsatisfiable' : { start: Math.max(size - last, 0), end: size - 1 };
  }
  const start = Number(from);
  if (to !== '' && Number(to) < start) return null; // backwards: not a real range, so ignore it
  if (start >= size) return 'unsatisfiable';
  return { start, end: to === '' ? size - 1 : Math.min(Number(to), size - 1) };
}

// Whether an If-None-Match header names this ETag: the copy the browser already has is current.
const isCurrent = (header: string | undefined, etag: string) =>
  header?.split(',').some((tag) => tag.trim().replace(/^W\//, '') === etag.replace(/^W\//, '')) ?? false;

// fetching a file by name: streamed from disk in chunks.
// ?w=800 streams a copy resized to that width instead (images only).
// A Range header gets just those bytes back (206 Partial Content), which is how a video
// player starts playing, and jumps around, without downloading the whole file first.
files.get('/:name', async (c) => {
  const name = c.req.param('name');
  // Only plain file names: blocks "../" tricks that would read files outside the folder.
  if (name !== path.basename(name) || name.startsWith('.')) {
    return c.text('Invalid file name', 400);
  }
  const filePath = path.join(FILES_DIR, name);
  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile()) {
    return c.text('File not found', 404);
  }
  // HEAD asks for the headers only. Opening the file for it would leave it open, unread.
  const headersOnly = c.req.method === 'HEAD';
  const etag = etagOf(info);

  // ?w= and/or ?h= limits, each a whole number from 1 to 4000 (anything else is ignored).
  const limit = (value: string | undefined) => {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? Math.min(n, 4000) : undefined;
  };
  const width = limit(c.req.query('w'));
  const height = limit(c.req.query('h'));
  if ((width || height) && RESIZABLE.has(path.extname(name).toLowerCase())) {
    // Previews are small and worth keeping in the browser's cache, but it must check back
    // (no-cache) in case the file changed. When it hasn't, the answer is "304, use what you
    // have", and sharp doesn't run at all. W/ because the bytes are sharp's, not the file's.
    const headers = { 'Content-Type': typeOf(name), 'Cache-Control': 'no-cache', ETag: `W/${etag}` };
    if (isCurrent(c.req.header('If-None-Match'), etag)) return c.body(null, 304, headers);
    if (headersOnly) return c.body(null, 200, headers);
    // Bytes flow disk → sharp → client; the resized size isn't known up front, so no Content-Length.
    // fit: 'inside' keeps the shape and stays within both limits; small images are never enlarged.
    const resized = createReadStream(filePath).pipe(
      sharp().resize({ width, height, fit: 'inside', withoutEnlargement: true }),
    );
    return c.body(Readable.toWeb(resized) as ReadableStream, 200, headers);
  }

  // The file itself. no-store keeps it out of the browser's disk cache: the app holds files
  // in memory or not at all (src/sessionCache.ts), so nothing is left behind on the device.
  const headers: Record<string, string> = {
    'Content-Type': typeOf(name),
    'Accept-Ranges': 'bytes', // tells players they can ask for just part of the file
    'Cache-Control': 'no-store',
    ETag: etag,
  };
  const range = parseRange(c.req.header('Range'), info.size);
  if (range === 'unsatisfiable') {
    return c.body(null, 416, { ...headers, 'Content-Range': `bytes */${info.size}` });
  }
  if (range) {
    headers['Content-Range'] = `bytes ${range.start}-${range.end}/${info.size}`;
    headers['Content-Length'] = String(range.end - range.start + 1);
    if (headersOnly) return c.body(null, 206, headers);
    // Reads only those bytes off the disk (end is inclusive, as in the header).
    const slice = createReadStream(filePath, { start: range.start, end: range.end });
    return c.body(Readable.toWeb(slice) as ReadableStream, 206, headers);
  }
  headers['Content-Length'] = String(info.size);
  if (headersOnly) return c.body(null, 200, headers);
  return c.body(Readable.toWeb(createReadStream(filePath)) as ReadableStream, 200, headers);
});

// POST /files/:name/versions → saves the request's body as the file: the start of version
// control (see PROJECT.md). To say what's meant, and so nothing is overwritten by accident:
//   If-None-Match: *     adds a new file, and fails if one by that name is already there.
//   If-Match: <its ETag> replaces the file, and fails if it changed since that version.
// Either failure is 412 Precondition Failed, with the file's current ETag. The version a
// save replaces isn't lost: it's moved to .versions/<name>/ (hidden from the list).
files.post('/:name/versions', async (c) => {
  const name = c.req.param('name');
  if (name !== path.basename(name) || name.startsWith('.')) {
    return c.text('Invalid file name', 400);
  }
  const filePath = path.join(FILES_DIR, name);
  const current = await stat(filePath).catch(() => null);
  const ifMatch = c.req.header('If-Match');
  if (c.req.header('If-None-Match') === '*') {
    if (current) return c.json({ error: 'exists', etag: etagOf(current) }, 412);
  } else if (ifMatch) {
    if (!current) return c.json({ error: 'missing' }, 412);
    if (!isCurrent(ifMatch, etagOf(current))) return c.json({ error: 'changed', etag: etagOf(current) }, 412);
  } else {
    return c.text('Send If-None-Match: * to add a file, or If-Match: <its ETag> to replace one', 428);
  }
  const body = c.req.raw.body;
  if (!body) return c.text('There was no file in the request', 400);

  // Written to a temporary file first, then renamed into place once it's all here, so a
  // half-sent upload never shows up as the file.
  const incoming = path.join(FILES_DIR, `.upload-${randomUUID()}`);
  try {
    await pipeline(Readable.fromWeb(body as import('node:stream/web').ReadableStream), createWriteStream(incoming));
  } catch {
    await rm(incoming, { force: true });
    return c.text('The upload was cut off', 400);
  }
  if (current) {
    const earlier = path.join(FILES_DIR, '.versions', name);
    await mkdir(earlier, { recursive: true });
    const when = current.mtime.toISOString().replace(/[:.]/g, '-'); // safe in a file name
    await rename(filePath, path.join(earlier, `${when} ${name}`));
  }
  await rename(incoming, filePath);

  const info = await stat(filePath);
  return c.json(
    { name, type: typeOf(name), size: info.size, modified: info.mtime.toISOString(), etag: etagOf(info) },
    201,
  );
});

//deleting a file by name
files.delete('/:name/delete', async (c) => {
    const name = c.req.param('name');
    if (name !== path.basename(name) || name.startsWith('.')) {
        return c.text('Invalid file name', 400);
    } 
    try {
        // implement later
    } catch {

    }
})

//updating a file with a newer version
files.post('/:name/update', async (c) => {
    const name = c.req.param('name');
    if (name !== path.basename(name) || name.startsWith('.')) {
        return c.text('Invalid file name', 400);
    } 
    try {
        // implement later
    } catch {

    }
})






function searchForFile(/*query*/) {
    //while ();
} 

export default files;