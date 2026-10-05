import { Hono, type Context } from 'hono';
import { saveBytes, writeLink, type Link } from './files.js';

// Figma files live in Figma, not on disk, so Sunkiss keeps snapshots of them: each frame the
// user picks is rendered by Figma and saved as a PNG in Sunkiss, a new version every time it's
// snapshotted again. A sidecar link (see files.ts) remembers where it came from, so the app can
// open it in Figma and snapshot it again from the file itself. The user's Figma token comes
// with each request (X-Figma-Token, from Settings) and is never kept here.

const figma = new Hono();

// Figma's API, or a stand-in for it when testing (FIGMA_API=http://localhost:…).
const FIGMA_API = process.env.FIGMA_API ?? 'https://api.figma.com';

// What's worth snapshotting at the top level of a page.
const FRAMES = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'SECTION', 'GROUP', 'INSTANCE']);

/** The file key and node id in a Figma link: figma.com/design/<key>/<name>?node-id=1-2 (also
 * /file/, /board/, /proto/ and /slides/). Null for anything else. */
export function parseFigmaUrl(url: string): { key: string; nodeId?: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!/(^|\.)figma\.com$/.test(parsed.hostname) && !process.env.FIGMA_API) return null;
  const match = parsed.pathname.match(/^\/(?:file|design|board|proto|slides)\/([A-Za-z0-9]+)/);
  if (!match) return null;
  const node = parsed.searchParams.get('node-id');
  return { key: match[1], nodeId: node ? node.replaceAll('-', ':') : undefined };
}

type Asked = { ok: true; data: any } | { ok: false; status: 401 | 502; message: string };

// Asks Figma something, with the user's token.
async function ask(c: Context, route: string): Promise<Asked> {
  const token = c.req.header('X-Figma-Token');
  if (!token) return { ok: false, status: 401, message: 'No Figma token: add a personal access token in Settings' };
  const res = await fetch(`${FIGMA_API}${route}`, { headers: { 'X-Figma-Token': token }, signal: AbortSignal.timeout(90_000) }).catch(() => null);
  if (!res) return { ok: false, status: 502, message: "Couldn't reach Figma" };
  if (!res.ok) {
    const message =
      res.status === 403
        ? 'Figma refused the token: check it in Settings'
        : res.status === 404
          ? "Figma has no file at that link, or the token can't see it"
          : res.status === 429
            ? 'Figma asked for a pause (too many requests): try again in a minute'
            : `Figma answered ${res.status}`;
    return { ok: false, status: 502, message };
  }
  return { ok: true, data: await res.json() };
}

// GET /figma/file?url=<link> → the file's name, when it last changed, its version, and its
// pages with the frames on each: what there is to snapshot.
figma.get('/file', async (c) => {
  const url = c.req.query('url') ?? '';
  const link = parseFigmaUrl(url);
  if (!link) return c.json({ error: "That isn't a link to a Figma file" }, 400);
  const asked = await ask(c, `/v1/files/${link.key}?depth=2`);
  if (!asked.ok) return c.json({ error: asked.message }, asked.status);
  const file = asked.data;
  const pages = ((file.document?.children ?? []) as any[])
    .filter((node) => node.type === 'CANVAS')
    .map((page) => ({
      id: page.id,
      name: page.name,
      frames: ((page.children ?? []) as any[]).filter((node) => FRAMES.has(node.type)).map((node) => ({ id: node.id, name: node.name, type: node.type })),
    }));
  return c.json({
    key: link.key,
    nodeId: link.nodeId ?? null,
    name: file.name,
    lastModified: file.lastModified,
    version: file.version,
    thumbnailUrl: file.thumbnailUrl ?? null,
    pages,
  });
});

// "<file> — <frame>.png", safe as a file name (no slashes, nothing hidden, not too long).
function snapshotName(file: string, node: string) {
  const clean = (text: string) =>
    text
      .replace(/[\\/\u0000-\u001f]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'Untitled';
  return `${clean(file)} — ${clean(node)}.png`.replace(/^\.+/, '');
}

// POST /figma/snapshot {url, nodes: [{id, name}]} → renders each node as a PNG (at 2×) and saves
// it in Sunkiss: a new file, or the next version of one snapshotted before. Answers with what
// was saved and what couldn't be.
figma.post('/snapshot', async (c) => {
  const body = await c.req.json().catch(() => null);
  const url = typeof body?.url === 'string' ? body.url : '';
  const link = parseFigmaUrl(url);
  const nodes: { id: string; name: string }[] = Array.isArray(body?.nodes)
    ? body.nodes.filter((node: any) => typeof node?.id === 'string' && typeof node?.name === 'string').slice(0, 30)
    : [];
  if (!link || nodes.length === 0) return c.json({ error: 'Send a Figma link and the frames to snapshot' }, 400);

  const meta = await ask(c, `/v1/files/${link.key}?depth=1`);
  if (!meta.ok) return c.json({ error: meta.message }, meta.status);
  const ids = nodes.map((node) => node.id).join(',');
  const rendered = await ask(c, `/v1/images/${link.key}?ids=${encodeURIComponent(ids)}&format=png&scale=2`);
  if (!rendered.ok) return c.json({ error: rendered.message }, rendered.status);

  const saved = [];
  const failed: { node: string; reason: string }[] = [];
  for (const node of nodes) {
    const imageUrl = rendered.data.images?.[node.id];
    if (!imageUrl) {
      failed.push({ node: node.name, reason: "Figma couldn't render it" });
      continue;
    }
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(90_000) }).catch(() => null);
    if (!res?.ok) {
      failed.push({ node: node.name, reason: "Couldn't fetch the picture Figma rendered" });
      continue;
    }
    const name = snapshotName(meta.data.name, node.name);
    const record: Link = {
      source: 'figma',
      url,
      key: link.key,
      nodeId: node.id,
      nodeName: node.name,
      fileName: meta.data.name,
      version: String(meta.data.version ?? ''),
      lastModified: meta.data.lastModified ?? null,
      snapshotAt: new Date().toISOString(),
    };
    await writeLink(name, record);
    saved.push(await saveBytes(name, Buffer.from(await res.arrayBuffer())));
  }
  return c.json({ saved, failed }, saved.length > 0 ? 201 : 502);
});

export default figma;
