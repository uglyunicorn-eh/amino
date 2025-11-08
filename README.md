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
import { ok, err, trycatch } from '@uglyunicorn/amino';

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

**Unwrap Result** - Transform result to any type:
```typescript
// Unwrap Result to get the value directly
const instr = instruction<number>()
  .step(async (v: number) => ok(v * 2))
  .useResult((v: number) => v.toString());

const result = await instr.run(5);
// result === "10" (string, not Result<string>)

// Can be used in the middle of a chain
const instr2 = instruction<number, { base: number }>({ base: 0 })
  .step(async (v: number) => ok(v * 2))
  .useResult((v: number, ctx) => v) // Unwrap to number
  .step(async (v: number, ctx) => ok(ctx.base + v)); // Still works!

const result2 = await instr2.run(5);
// result2 === 10 (number, unwrapped type preserved)
```

**Compile** - For better performance:
```typescript
const compiled = instruction<number, { base: number }>({ base: 10 })
  .step(async (v, ctx) => ok(v + ctx.base))
  .compile();

const result = await compiled(5);
```

## API

**Result**: `ok(value)`, `err(error)`, `trycatch(fn)`

**Instruction**: `instruction<IV, IC>(context?)`
- `.step(fn)` - Transform value
- `.context(fn)` - Transform context
- `.assert(predicate, message?)` - Validate
- `.failsWith(ErrorClass, message)` - Custom error
- `.useResult(fn)` - Unwrap result and transform to any type
- `.compile(context?)` - Compile pipeline (returns `AsyncResult<V, E>`)
- `.run(value?)` - Execute pipeline (returns `Promise<R>` where `R` defaults to `Result<V>`)

## License

MIT
