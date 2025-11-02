# Hono Extension Example

This example demonstrates using Amino's Hono extension to build a simple REST API with Hono on Bun.

## Features

- Hono integration with Amino extensions
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
  "hello": "world"
}
```

## How It Works

The Hono extension provides a `.response()` action that:
- Executes the operation pipeline
- Sends JSON response with proper status codes (200 for success, 400 for errors)
- Handles both success and error cases
- Maintains type safety throughout

## Code Example

```typescript
import { Hono } from 'hono';
import { func } from '@uglyunicorn/amino/acids/hono';
import { ok } from '@uglyunicorn/amino';

const app = new Hono();

app.get('/', async (c) => 
  await func(c)
    .step(() => ok({ hello: 'world' }))
    .response()
);

// Export for Bun - Bun will automatically serve on port 3000
export default app;
```

This pattern allows you to:
1. Define your business logic in steps
2. Let the extension handle response formatting
3. Maintain type safety and error handling throughout

## Bun Integration

This example uses Bun's native server support. Simply export the Hono app as default, and Bun will automatically serve it. You can also specify a custom port:

```typescript
export default {
  port: 3000,
  fetch: app.fetch,
};
```

For more information, see the [Hono Bun documentation](https://hono.dev/docs/getting-started/bun).

