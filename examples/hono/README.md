# Hono Integration Example

This example demonstrates using Amino with Hono to build a simple REST API on Bun.

## Features

- Hono integration with Amino's instruction pipeline
- Type-safe error handling with Result pattern
- Clean API responses (200 for success, 400 for errors)
- JSON response formatting
- Native Bun server support

## Setup

1. Install dependencies:
```bash
bun install
```

## Running

Start the development server:

```bash
bun dev
```

Or run directly:
```bash
bun run src/index.ts
```

The server will start on http://localhost:3000 (Bun's default port).

## Example Endpoint

### Hello World
```bash
curl http://localhost:3000/
```

**Response (200):**
```json
{
  "status": "ok",
  "data": {
    "hello": "world"
  }
}
```

## How It Works

This example shows how to integrate Amino's instruction pipeline with Hono:

1. Use `instruction()` to create a pipeline
2. Chain `.step()` calls to define your business logic
3. Use `.useResult()` to transform the Result into a Hono response
4. Handle both success and error cases with proper HTTP status codes

## Code Example

Here's the complete implementation:

```typescript
import { Context, Hono } from 'hono';
import { ok, instruction, type Result } from '@uglyunicorn/amino';

// Helper function to convert Amino Result to Hono JSON response
const apiResponse = <V, E>(c: Context) => 
  (res: Result<V, E>) => {
    return res.err 
      ? c.json({ status: 'error' as const, error: res.err }, 400) 
      : c.json({ status: 'ok' as const, data: res.res }, 200);
  }

// Create Hono app
const app = new Hono()
  .get('/', (c) => 
      instruction()
        .step(() => ok({ hello: 'world' }))
        .useResult(apiResponse(c))
  )

export default app;
```

### More Complex Example

You can chain multiple steps and handle errors. Here's an example that validates input and performs a lookup:

```typescript
import { ok, err, instruction, type Result } from '@uglyunicorn/amino';

app.get(
  '/users/:id', (c) => 
    instruction({ userId: c.req.param('id') })
      .step((_, ctx) => {
        // Validate input from context
        const id = ctx.userId;
        if (!id || isNaN(Number(id))) {
          return err(new Error('Invalid user ID'));
        }
        return ok(Number(id));
      })
      .step((id) => {
        // Simulate database lookup
        if (id === 1) {
          return ok({ id: 1, name: 'Alice' });
        }
        return err(new Error('User not found'));
      })
      .useResult(apiResponse(c))
);
```

This pattern allows you to:
1. Define your business logic in steps
2. Handle errors at each step
3. Transform the final result into a proper HTTP response
4. Maintain type safety throughout

## Bun Integration

This example uses Bun's native server support. Simply export the Hono app as default, and Bun will automatically serve it. You can also specify a custom port:

```typescript
export default {
  port: 3000,
  fetch: app.fetch,
};
```

For more information, see the [Hono Bun documentation](https://hono.dev/docs/getting-started/bun).

