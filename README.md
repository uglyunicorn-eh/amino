# Amino

A lightweight, type-safe Result pattern implementation for TypeScript. The fundamental blocks that transform chaotic code into reliable systems.

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

Chain operations with fail-fast error handling, context management, and **high-performance compilation**.

### Basic Usage

```typescript
import { operation, ok, err } from '@uglyunicorn/amino';

// Simple operation with no initial context or value
const result = await operation()
  .step(() => ok(42))
  .step((value: number) => ok(value * 2))
  .complete();

if (result.err === undefined) {
  console.log(result.res); // 84
}

// With context and value
const resultWithContext = await operation({ userId: 'user123', requestId: 'req456' }, 10)
  .step((value: number) => ok(value * 2))
  .step((value: number) => ok(value + 1))
  .complete();

if (resultWithContext.err === undefined) {
  console.log(resultWithContext.res); // 21
}

// Without context (uses undefined as default)
const simpleResult = await operation(undefined, 10)
  .step((value: number) => ok(value * 2))
  .complete();

if (simpleResult.err === undefined) {
  console.log(simpleResult.res); // 20
}
```

### Performance Optimization with Compilation

For maximum performance, especially in high-throughput scenarios, use the `compile()` method:

```typescript
// Regular operation (good for development)
const result = await operation(context, value)
  .step(validateUser)
  .step(processUser)
  .complete();

// Compiled operation (54-91% faster for production)
const compiledFn = operation(context, value)
  .step(validateUser)
  .step(processUser)
  .compile();

const result = await compiledFn(value);

// Pre-compiled pipeline (91% faster - best for batch processing)
const compiledPipeline = operation(context, value)
  .step(validateUser)
  .step(processUser)
  .compile();

// Reuse for multiple executions
for (const user of users) {
  const result = await compiledPipeline(user);
}

// Compiling operations without initial arguments
// For best type safety, provide an initial value to infer types:
const processNumber = operation(undefined, 0)
  .step((value: number) => ok(value * 2))
  .step((value: number) => ok(value + 1))
  .compile();

// Use with different values
const result1 = await processNumber(5);  // 11
const result2 = await processNumber(10); // 21
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
  constructor(message: string, options?: { cause?: Error }) {
    super(message, options);
  }
}

const result = await operation({ requestId: 'req123' }, 42)
  .failsWith(ValidationError, 'Validation failed')
  .step((value: number) => err(new Error('Invalid input')))
  .complete();

// result.err is ValidationError with cause chain
```

#### 4. Async Operations

```typescript
const result = await operation({ sessionId: 'sess456' }, 5)
  .step((value: number) => ok(value * 2))        // sync
  .step(async (value: number) => ok(value + 1))  // async
  .step((value: number) => ok(value * 2))        // sync
  .complete();
```

#### 5. Type Safety

TypeScript infers types throughout the chain:

```typescript
const result = await operation({ traceId: 'trace789' }, 42)
  .step((value: number) => ok(value.toString()))  // number -> string
  .step((value: string) => ok(value.length))      // string -> number
  .step((value: number) => ok(value > 0))         // number -> boolean
  .complete();

// result.res is typed as boolean
```

## Extensions

Create framework-specific extensions with custom action methods. Extensions wrap operations with additional functionality.

### Creating Custom Extensions

Use `makeOperation()` to create extensions with custom actions:

```typescript
import { makeOperation } from '@uglyunicorn/amino';

interface MyContext {
  userId: string;
  sessionId: string;
}

const myOperation = makeOperation<ContextArg, MyContext>(
  (arg) => ({ userId: 'user123', sessionId: 'sess456' })
)
  .action('finalize', async (ctx, { res, err }) => {
    if (err) {
      return { error: err.message, ctx };
    }
    return { data: res, ctx };
  });

// Use the extension
const result = await myOperation(contextArg)
  .step(() => ok({ data: 'example' }))
  .finalize();
```

### Hono Extension Example

The Hono extension is built using `makeOperation()`:

```typescript
import { makeOperation } from '@uglyunicorn/amino';

// Creating the Hono extension
export const func = makeOperation((ctx: Context) => ({ ctx }))
  .action('response', async ({ ctx }, { res, err }) => {
    if (err) {
      return ctx.json({ status: 'error', error: err.message }, 400);
    }
    return ctx.json({ status: 'ok', response: res }, 200);
  });
```

**Usage in your Hono application:**

```typescript
import { Hono } from 'hono';
import { func } from '@uglyunicorn/amino/acid/hono';
import { ok, err } from '@uglyunicorn/amino';

const app = new Hono();

app.post('/api/users', async (c) => {
  return await func(c)
    .step(() => ok({ id: 1, name: 'John' }))
    .response();
});
```

The `.response()` action automatically sends JSON with proper status codes (200 for success, 400 for errors).

## API

### Result Functions

- `ok<T>(value: T): Success<T>` - Create success result
- `err(error: Error | string): Failure<Error>` - Create error result
- `trycatch<T>(fn: () => T | Promise<T>): Result<T> | AsyncResult<T>` - Wrap function in Result

### Operation

- `operation<C, V>(context?: C, value?: V)` - Create operation pipeline
- `.step<NV>(fn: (value: V, context: C) => Result<NV> | Promise<Result<NV>>)` - Add processing step
- `.context<NC>(fn: (context: C, value: V) => NC | Promise<NC>)` - Transform context
- `.failsWith<NE>(ErrorClass, message)` - Set custom error type
- `.failsWith(message)` - Set generic error type
- `.compile()` - Compile pipeline for optimal performance (54-91% faster)
- `.compile(context)` - Compile pipeline with explicit context binding
- `.complete()` - Execute pipeline and return AsyncResult<V, E>

### Extensions

- `makeOperation<CtxArg, Ctx>(contextFactory)` - Create custom extension factory
- `.action(name, handler)` - Register custom action method
- Extensions can have custom action methods (e.g., `.response()`)

## License

MIT
