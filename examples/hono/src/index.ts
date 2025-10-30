import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { func } from '@uglyunicorn/amino/acids/hono';
import { ok } from '@uglyunicorn/amino';

// Create Hono app
const app = new Hono();

// Simple example endpoint
app.get('/', async (c) => {
  return (await func(c)
    .step(() => ok({ hello: 'world' }))
    .response()) as Response;
});

// Start server
const port = 3000;
console.log(`🚀 Server running at http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});
