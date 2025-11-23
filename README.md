# Amino

[![codecov](https://codecov.io/gh/uglyunicorn-eh/amino/graph/badge.svg?token=fhY0SahI3q)](https://codecov.io/gh/uglyunicorn-eh/amino)

A lightweight, type-safe Result pattern implementation for TypeScript.

## Installation

```bash
bun add @uglyunicorn/amino
```

## Result Pattern

Handle success and errors without exceptions:

```typescript
import { ok, err, trycatch, ensure } from '@uglyunicorn/amino';

const { res, err: error } = ok(42);
if (error === undefined) {
  console.log(res); // 42
}

// Wrap any function in a Result
const result1 = trycatch(() => JSON.parse('{"name":"John"}'));
// Sync: returns Result<T>

const result2 = await trycatch(async () => {
  const response = await fetch('https://api.example.com/data');
  return response.json();
});
// Async: returns AsyncResult<T>
```

### Unwrapping Results

Use `ensure` to unwrap a Result, throwing an error if the result is a failure:

```typescript
import { ok, err, ensure } from '@uglyunicorn/amino';

// Synchronous Result
const result = ok(42);
const value = ensure(result); // 42

// Throws if result is a failure
const failure = err('Something went wrong');
ensure(failure); // throws Error('Ensure violation error') with original error as cause

// Asynchronous AsyncResult
const asyncResult = Promise.resolve(ok('hello'));
const asyncValue = await ensure(asyncResult); // 'hello'

// Works with both sync and async
const anyResult: Result<number> | AsyncResult<number> = ok(42);
const unwrapped = ensure(anyResult); // number or Promise<number>
```

## Instruction Pipeline

Type-safe pipeline builder with immutable chaining.

### Basic Usage

```typescript
import { instruction, ok } from '@uglyunicorn/amino';

// Without context
const instr = instruction<number>()
  .step(async (v: number) => ok(v * 2))
  .step(async (v: number) => ok(v + 1));

const result = await instr.run(5);
// result.res === 11

// With context
const instr2 = instruction<number, { base: number }>({ base: 10 })
  .step(async (v: number, ctx) => ok(v + ctx.base));

const result2 = await instr2.run(5);
// result2.res === 15
```

### Features

**Steps** - Transform values:
```typescript
instruction<number>()
  .step(async (v: number) => ok(v * 2))
  .step(async (v: number) => ok(v.toString()));
```

**Context** - Transform context:
```typescript
instruction<number, { count: number }>({ count: 0 })
  .context((ctx, v) => ({ ...ctx, count: ctx.count + v }));
```

**Assertions** - Validate without transformation:
```typescript
instruction<number>()
  .step(async (v: number) => ok(v * 2))
  .assert((v: number) => v > 0, 'Value must be positive');
```

**Error Transformation**:
```typescript
import { err } from '@uglyunicorn/amino';

class CustomError extends Error {}

instruction<number>()
  .failsWith(CustomError, 'Operation failed')
  .step(async (v: number) => err('Step failed'));
```

**Transform Result** - Run instruction and transform the result:
```typescript
// useResult is async and immediately executes the instruction
// fn is always first, then optional initial value
const instr = instruction<number>()
  .step(async (v: number) => ok(v * 2));

const result = await instr.useResult((res) => {
  if (res.err) throw res.err;
  return res.res!.toString();
}, 5);
// result === "10" (string, transformed from Result<number>)

// With undefined initial value (no value parameter needed)
const instr2 = instruction<undefined, { base: number }>({ base: 0 })
  .step(async () => ok(42));

const result2 = await instr2.useResult((res) => {
  if (res.err) throw res.err;
  return res.res!;
});
// result2 === 42 (number, transformed from Result<number>)
```

**Compile** - For better performance:
```typescript
const compiled = instruction<number, { base: number }>({ base: 10 })
  .step(async (v, ctx) => ok(v + ctx.base))
  .compile();

const result = await compiled(5);
```

## Hono Example

Build type-safe API endpoints with Hono:

```typescript
import { Context, Hono } from 'hono';
import { ok, instruction, type Result } from '@uglyunicorn/amino';

// Helper to convert Result to JSON response
const apiResponse = <V, E>(c: Context) => 
  (res: Result<V, E>) => {
    return res.err 
      ? c.json({ status: 'error' as const, error: res.err }, 400) 
      : c.json({ status: 'ok' as const, data: res.res }, 200);
  }

const app = new Hono()
  .get('/', async (c) => 
    await instruction({ input: null })
      .step((_, ctx) => ok({ hello: 'world' }))
      .useResult(apiResponse(c))
  );

export default app;
```

## API

**Result**: `ok(value)`, `err(error)`, `trycatch(fn)`, `ensure(result)`

**Types**: `Result<T, E>`, `AsyncResult<T, E>`, `AnyResult<T, E>`

**Instruction**: `instruction<IV, IC>(context?)`
- `.step(fn)` - Transform value
- `.context(fn)` - Transform context
- `.assert(predicate, message?)` - Validate
- `.failsWith(ErrorClass, message)` - Custom error
- `.useResult(fn, value?)` - Run instruction and transform result (async, returns `Promise<RR>`)
- `.compile(context?)` - Compile pipeline (returns `AsyncResult<V, E>`)
- `.run(value?)` - Execute pipeline (returns `Promise<R>` where `R` defaults to `Result<V>`)

## License

MIT
