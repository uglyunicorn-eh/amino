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
- `.compile(context?)` - Compile pipeline
- `.run(value?)` - Execute pipeline

## License

MIT
