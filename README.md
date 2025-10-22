# Amino

A lightweight, type-safe Result pattern implementation for TypeScript with operation pipelines.

## Installation

```bash
bun add @uglyunicorn/amino
# or
npm install @uglyunicorn/amino
```

## Core Concepts

### Result Pattern

Handle success and errors without exceptions:

```typescript
import { ok, err, type Result } from '@uglyunicorn/amino';

function divide(a: number, b: number): Result<number> {
  if (b === 0) return err('Division by zero');
  return ok(a / b);
}

const { res, err: error } = divide(10, 2);
if (error === undefined) {
  console.log(res); // 5
}
```

### Try-Catch Wrapper

Wrap any function in a Result:

```typescript
import { trycatch } from '@uglyunicorn/amino';

// Sync
const { res, err } = trycatch(() => JSON.parse('{"name":"John"}'));

// Async
const { res, err } = await trycatch(async () => {
  const response = await fetch('https://api.example.com/data');
  return response.json();
});
```

## Operation Pipeline

Chain operations with fail-fast error handling and context management.

### Basic Usage

```typescript
import { operation, ok, err } from '@uglyunicorn/amino';

const result = await operation({ userId: 'user123', requestId: 'req456' }, 10)
  .step((value: number) => ok(value * 2))
  .step((value: number) => ok(value + 1))
  .complete();

if (result.err === undefined) {
  console.log(result.res); // 21
}
```

### Key Features

#### 1. Fail-Fast Error Handling

```typescript
const result = await operation({ operationId: 'op123' })
  .step((value: number) => ok(value * 2))
  .step((value: number) => err('Failed!'))
  .step((value: number) => ok(value + 1)) // Skipped
  .complete();

// result.err.message === 'Failed!'
```

#### 2. Context Management

```typescript
const result = await operation({ userId: 'user123' }, 5)
  .step((value: number) => ok(value * 2))
  .context((ctx: { userId: string }, value: number) => ({ ...ctx, processed: true }))
  .step((value: number) => ok(value + 1))
  .complete();
```

#### 3. Custom Error Types

```typescript
class ValidationError extends Error {
  constructor(message: string, cause?: Error) {
    super(message, { cause });
  }
}

const result = await operation({ requestId: 'req123' })
  .failsWith(ValidationError, 'Validation failed')
  .step((value: number) => err('Invalid input'))
  .complete();

// result.err is ValidationError with cause chain
```

#### 4. Async Operations

```typescript
const result = await operation({ sessionId: 'sess456' })
  .step((value: number) => ok(value * 2))        // sync
  .step(async (value: number) => ok(value + 1))  // async
  .step((value: number) => ok(value * 2))        // sync
  .complete();
```

#### 5. Type Safety

TypeScript infers types throughout the chain:

```typescript
const result = await operation({ traceId: 'trace789' })
  .step((value: number) => ok(value.toString()))  // number -> string
  .step((value: string) => ok(value.length))      // string -> number
  .step((value: number) => ok(value > 0))         // number -> boolean
  .complete();

// result.res is typed as boolean
```

## Advanced Usage

### Custom Completion with `makeOperation`

Create operation factories with custom completion handlers for framework integrations:

```typescript
import { makeOperation, ok, err, type Result } from '@uglyunicorn/amino';

// Example: Hono framework integration
interface HonoContext {
  json: (data: any, status?: number) => Response;
}

const honoOperation = makeOperation(
  (result: Result<any>, context: { honoCtx: HonoContext }) => {
    if (result.err !== undefined) {
      return context.honoCtx.json({ error: result.err.message }, 500);
    }
    return context.honoCtx.json(result.res);
  }
);

// Use in a Hono route handler
app.get('/users/:id', async (c) => {
  return await honoOperation({ honoCtx: c }, undefined)
    .step(() => validateUserId(c.req.param('id')))
    .step((userId: string) => fetchUser(userId))
    .step((user: User) => enrichUserData(user))
    .complete(); // Returns Hono Response directly
});
```

The completion handler receives:
- `result`: The final `Result<V, E>` from the pipeline
- `context`: The final operation context (after all `.context()` transformations)

This enables seamless integration with any framework or custom return type requirements.

## API

### Result Functions

- `ok<T>(value: T): Success<T>` - Create success result
- `err(error: Error | string): Fail<Error>` - Create error result
- `trycatch<T>(fn: () => T): Result<T>` - Wrap function in Result

### Operation

- `operation<C, V>(context?: C, value?: V)` - Create operation pipeline
- `.step<NV>(fn: (value: V, context: C) => Result<NV>)` - Add processing step
- `.context<NC>(fn: (context: C, value: V) => NC)` - Transform context
- `.failsWith<E>(ErrorClass, message)` - Set custom error type
- `.complete()` - Execute pipeline and return Result (or custom type)

### makeOperation Factory

- `makeOperation<C, E, R>(handler)` - Create operation factory with custom completion
- Returns factory function: `(context?: C, value?: V) => Operation<V, C, E, Promise<R>>`
- `handler`: `(result: Result<V, E>, context: C) => R` - Custom completion handler

## License

MIT
