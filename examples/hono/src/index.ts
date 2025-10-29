import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { func } from '@uglyunicorn/amino/acid/hono';
import { Context } from 'hono';
import { ok, err } from '@uglyunicorn/amino';

// Create Hono app
const app = new Hono();

// Example endpoint using Hono extension
app.post('/api/users', async (c: Context) => {
  return await func(c)
    .step(() => {
      // Simulate user creation
      const user = {
        id: Math.floor(Math.random() * 1000),
        name: 'John Doe',
        email: 'john@example.com'
      };
      return ok(user);
    })
    .response();
});

// Error handling example
app.post('/api/users/error', async (c: Context) => {
  return await func(c)
    .step(() => {
      // Simulate validation error
      return err('Invalid input: missing required fields');
    })
    .response();
});

// Multiple steps example
app.post('/api/users/with-validation', async (c: Context) => {
  return await func(c)
    .step((value: any) => {
      // Step 1: Parse and validate input
      const input = c.req.valid('json');
      if (!input) {
        return err('Missing request body');
      }
      return ok(input);
    })
    .step((value: any) => {
      // Step 2: Process the data
      return ok({
        ...value,
        processed: true,
        timestamp: new Date().toISOString()
      });
    })
    .response();
});

// Example with different status codes
app.get('/api/health', async (c: Context) => {
  return await func(c)
    .step(() => {
      // Check system health
      const isHealthy = true;
      if (!isHealthy) {
        return err('System is unhealthy');
      }
      return ok({ status: 'healthy', uptime: '99.99%' });
    })
    .response();
});

// Start server
const port = 3000;
console.log(`🚀 Server running at http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port,
});

