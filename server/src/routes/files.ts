import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import fs from 'node:fs/promises'
import path from 'node:path'
import { readdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
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
};



// GET /files → the name, type, and last-changed time of every file in FILES_DIR
files.get('/', async (c) => {
  const entries = await readdir(FILES_DIR, { withFileTypes: true });
  const list = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
      .map(async (entry) => {
        const info = await stat(path.join(FILES_DIR, entry.name));
        // When the file was last saved, as an ISO date the client can put on its timeline.
        return { name: entry.name, type: typeOf(entry.name), modified: info.mtime.toISOString() };
      }),
  );
  return c.json(list);
});

// Image types sharp can resize without changing the format (SVG would become PNG,
// GIF would lose its animation), so only these get a ?w= preview.
const RESIZABLE = new Set(['.png', '.jpg', '.jpeg', '.webp']);

// fetching a file by name: streamed from disk in chunks.
// ?w=800 streams a copy resized to that width instead (images only).
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

  const file = createReadStream(filePath);
  // ?w= and/or ?h= limits, each a whole number from 1 to 4000 (anything else is ignored).
  const limit = (value: string | undefined) => {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? Math.min(n, 4000) : undefined;
  };
  const width = limit(c.req.query('w'));
  const height = limit(c.req.query('h'));
  if ((width || height) && RESIZABLE.has(path.extname(name).toLowerCase())) {
    // Bytes flow disk → sharp → client; the resized size isn't known up front, so no Content-Length.
    // fit: 'inside' keeps the shape and stays within both limits; small images are never enlarged.
    const resized = file.pipe(sharp().resize({ width, height, fit: 'inside', withoutEnlargement: true }));
    return c.body(Readable.toWeb(resized) as ReadableStream, 200, { 'Content-Type': typeOf(name) });
  }
  return c.body(Readable.toWeb(file) as ReadableStream, 200, {
    'Content-Type': typeOf(name),
    'Content-Length': String(info.size),
  });
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