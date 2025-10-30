# Hono Extension Example

This example demonstrates using Amino's Hono extension to build a simple REST API with Hono.

## Features

- Hono integration with Amino extensions
- Type-safe error handling with Result pattern
- Clean API responses (200 for success, 400 for errors)
- Multiple step transformations
- JSON response formatting

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

The server will start on http://localhost:3000

## Example Endpoints

### Create User (Success)
```bash
curl -X POST http://localhost:3000/api/users
```

**Response (200):**
```json
{
  "status": "ok",
  "response": {
    "id": 123,
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

### Error Response
```bash
curl -X POST http://localhost:3000/api/users/error
```

**Response (400):**
```json
{
  "status": "error",
  "error": "Invalid input: missing required fields"
}
```

### Health Check
```bash
curl http://localhost:3000/api/health
```

**Response (200):**
```json
{
  "status": "ok",
  "response": {
    "status": "healthy",
    "uptime": "99.99%"
  }
}
```

## How It Works

The Hono extension provides a `.response()` action that:
- Executes the operation pipeline
- Sends JSON response with proper status codes
- Handles both success (200) and error (400) cases
- Maintains type safety throughout

## Code Example

```typescript
import { func } from '@uglyunicorn/amino/acids/hono';
import { ok } from '@uglyunicorn/amino';

app.post('/api/example', async (c: Context) => {
  return await func(c)
    .step(() => ok({ data: 'example' }))
    .response();
});
```

This pattern allows you to:
1. Define your business logic in steps
2. Let the extension handle response formatting
3. Maintain type safety and error handling throughout

