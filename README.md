# Amino

[![codecov](https://codecov.io/gh/uglyunicorn-eh/amino/graph/badge.svg?token=fhY0SahI3q)](https://codecov.io/gh/uglyunicorn-eh/amino)

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

## Instruction Pipeline

A type-safe instruction pipeline builder with immutable chaining and efficient memory usage.

### Basic Usage

```typescript
import { instruction, ok } from '@uglyunicorn/amino';

const initialContext = { base: 0 };

// Create instruction with context
const instr = instruction(initialContext)
  .step(async (v: undefined, ctx: { base: number }) => ok(ctx.base + 5))
  .step(async (v: number) => ok(v * 2));

// Run without arguments (IV is undefined by default)
const result = await instr.run();
// result.res === 10

// Compile with context override
const compiled = instr.compile({ base: 3 });
const result2 = await compiled();
// result2.res === 16

// Or specify initial value type
const instrWithNumber = instruction<{ base: number }, number>(initialContext)
  .step(async (v: number, ctx: { base: number }) => ok(ctx.base + v))
  .step(async (v: number) => ok(v * 2));

// Now run requires a value
const result3 = await instrWithNumber.run(5);
// result3.res === 10
```

### Features

#### Context Transformation

```typescript
const instr = instruction<{ base: number }, number>({ base: 0 })
  .step(async (v: number, ctx: { base: number }) => ok(ctx.base + v))
  .context((ctx: { base: number }, v: number) => ({ ...ctx, base: ctx.base + v }))
  .step(async (v: number, ctx: { base: number }) => ok(ctx.base / v));

const result = await instr.run(5);
// result.res === 1
```

#### Assertions

```typescript
const instr = instruction<{ base: number }, number>({ base: 0 })
  .step(async (v: number) => ok(v * 2))
  .assert((v: number) => v !== 0, 'Result cannot be zero')
  .step(async (v: number) => ok(v + 1));

const result = await instr.run(5);
// result.res === 11
```

#### Error Transformation

```typescript
import { instruction, ok, err } from '@uglyunicorn/amino';

class ValidationError extends Error {
  constructor(message: string, options?: { cause?: Error }) {
    super(message, options);
  }
}

const instr = instruction<{ base: number }, number>({ base: 0 })
  .failsWith(ValidationError, 'Validation failed')
  .step(async (v: number) => err(new Error('Step failed')));

const result = await instr.run(5);
// result.err is ValidationError
```

#### Immutable Branching

```typescript
const baseInstr = instruction<{ base: number }, number>({ base: 0 })
  .step(async (v: number) => ok(v * 2));

const increment = baseInstr.step(async (v: number) => ok(v + 1));
const decrement = baseInstr.step(async (v: number) => ok(v - 1));

await increment.run(5);  // 11
await decrement.run(5);   // 9
await baseInstr.run(5);   // 10
```

#### Fail-Fast Error Handling

```typescript
const instr = instruction<{ operationId: string }, number>({ operationId: 'op123' })
  .step(async (v: number) => ok(v * 2))
  .step(async (v: number) => err('Failed!'))
  .step(async (v: number) => ok(v + 1)); // Skipped

const result = await instr.run(5);
// result.err.message === 'Failed!'
```

#### Type Safety

TypeScript infers types throughout the chain:

```typescript
const instr = instruction<{ traceId: string }, number>({ traceId: 'trace789' })
  .step(async (v: number) => ok(v.toString()))  // number -> string
  .step(async (v: string) => ok(v.length))      // string -> number
  .step(async (v: number) => ok(v > 0));         // number -> boolean

const result = await instr.run(42);
// result.res is typed as boolean
```

## Performance Optimization with Compilation

For maximum performance, especially in high-throughput scenarios, use the `compile()` method:

```typescript
// Regular instruction (good for development)
const result = await instruction(context)
  .step(validateUser)
  .step(processUser)
  .run(value);

// Compiled instruction (faster for production)
const compiledFn = instruction(context)
  .step(validateUser)
  .step(processUser)
  .compile();

const result = await compiledFn(value);

// Pre-compiled pipeline (best for batch processing)
const compiledPipeline = instruction(context)
  .step(validateUser)
  .step(processUser)
  .compile();

// Reuse for multiple executions
for (const value of values) {
  const result = await compiledPipeline(value);
}
```

## API

### Result Functions

- `ok<T>(value: T): Success<T>` - Create success result
- `err(error: Error | string): Failure<Error>` - Create error result
- `trycatch<T>(fn: () => T | Promise<T>): Result<T> | AsyncResult<T>` - Wrap function in Result

### Instruction

- `instruction<IC, IV = undefined>(initialContext: IC)` - Create instruction pipeline with required context and optional initial value type
- `.step<NV>(fn: (value: V, context: C) => Result<NV> | Promise<Result<NV>>)` - Add processing step
- `.context<NC>(fn: (context: C, value: V) => NC | Promise<NC>)` - Transform context
- `.assert(predicate, message?)` - Validate value without transformation (predicate: `(value: V, context: C) => boolean | Promise<boolean>`, optional error message)
- `.failsWith<NE>(ErrorClass, message)` - Set custom error type
- `.failsWith(message)` - Set generic error type
- `.compile()` - Compile instruction with initial context, returns `(value?: IV) => AsyncResult<V, E>` (parameter optional when IV is undefined)
- `.compile(overwriteContext: IC)` - Compile instruction with context override, returns `(value?: IV) => AsyncResult<V, E>`
- `.run(...args: IV extends undefined ? [] : [IV])` - Execute instruction (parameter optional when IV is undefined), returns `AsyncResult<V, E>`

## License

MIT
