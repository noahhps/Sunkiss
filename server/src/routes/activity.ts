import { Hono } from 'hono';
import { readdir } from 'node:fs/promises';
import { FILES_DIR, typeOf, versionsOf } from './files.js';

const activity = new Hono();

// GET /activity → every saved version of every file, newest first: the file's name and type,
// the version's id (what ?V= takes), its size, when it was saved, and whether it's the
// file's current version. The Kisses screen draws its graph from this: one request for
// everything, rather than one per file for its versions. Only files that are still in the
// folder count; the versions a deleted file left behind aren't listed.
activity.get('/', async (c) => {
  const entries = await readdir(FILES_DIR, { withFileTypes: true });
  const names = entries.filter((entry) => entry.isFile() && !entry.name.startsWith('.')).map((entry) => entry.name);
  const lists = await Promise.all(
    names.map(async (name) =>
      (await versionsOf(name)).map(({ id, info, current }) => ({
        name,
        type: typeOf(name),
        id,
        size: info.size,
        modified: info.mtime.toISOString(),
        current,
      })),
    ),
  );
  return c.json(lists.flat().sort((a, b) => Date.parse(b.modified) - Date.parse(a.modified)));
});

export default activity;
