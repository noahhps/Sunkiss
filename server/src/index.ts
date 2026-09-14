import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

// routes
import files from './routes/files.js';


const app = new Hono();

// Let the app fetch from this server. It runs on a different origin
// (localhost:1420 in dev, tauri:// when packaged), which browsers block by default.
app.use('*', cors());

// Health check: lets the app (and you, with curl) confirm the server is up.
app.get('/health', (c) => c.json({ ok: true }));

// File Retrieval: Gets all files 
app.route('/files', files);

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Sunkiss server on http://localhost:${info.port}`);
});

