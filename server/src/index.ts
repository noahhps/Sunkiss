import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

// routes
import files from './routes/files.js';


const app = new Hono();

// Let the app fetch from this server. It runs on a different origin
// (localhost:1420 in dev, tauri:// when packaged), which browsers block by default.
// The app also needs to read Content-Range (how big the whole file is, when it asks for a
// slice) and ETag (which version a slice came from); browsers hide those unless listed.
app.use('*', cors({ exposeHeaders: ['Content-Range', 'ETag'] }));

// Health check: lets the app (and you, with curl) confirm the server is up.
app.get('/health', (c) => c.json({ ok: true }));

// File Retrieval: Gets all files 
app.route('/files', files);

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Sunkiss server on http://localhost:${info.port}`);
});

