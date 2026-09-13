import { serve } from '@hono/node-server';
import { Hono } from 'hono';

const app = new Hono();

// Health check: lets the app (and you, with curl) confirm the server is up.
app.get('/health', (c) => c.json({ ok: true }));

// File Retreival: Gets all files 
app.get('/files', (c) => c.json({file_list: hi.jpg}))

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Sunkiss server on http://localhost:${info.port}`);
});

