import { Hono } from 'hono';
import { func } from '@uglyunicorn/amino/acids/hono';
import { ok } from '@uglyunicorn/amino';

// Create Hono app
const app = new Hono();

// Simple example endpoint
app.get('/', async (c) => 
  await func(c)
    .step(() => ok({ hello: 'world' }))
    .response()
);

// Export app for Bun - Bun will automatically serve on port 3000
// You can also specify a custom port: export default { port: 3000, fetch: app.fetch }
export default { port: 3002, fetch: app.fetch };
