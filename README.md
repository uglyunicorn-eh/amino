# Amino

A lightweight, type-safe Result pattern implementation for TypeScript with powerful operation pipelines.

## Installation

```bash
bun add @uglyunicorn/amino
# or
npm install @uglyunicorn/amino
```

## Usage

### Basic Result Pattern

```typescript
import { ok, err, type Result } from '@uglyunicorn/amino';

function divide(a: number, b: number): Result<number> {
  if (b === 0) {
    return err('Division by zero');
  }
  return ok(a / b);
}

const { res, err: error } = divide(10, 2);
if (error === undefined) {
  console.log(`Result: ${res}`); // Result: 5
} else {
  console.error(`Error: ${error.message}`);
}
```

### Try-Catch Wrapper

The `trycatch` function wraps any function in a try-catch and returns a Result. It works with both synchronous and asynchronous functions:

```typescript
import { trycatch } from '@uglyunicorn/amino';

// Synchronous
const { res, err } = trycatch(() => JSON.parse('{"name":"John"}'));
if (err === undefined) {
  console.log(res.name); // John
}

// Asynchronous
const { res: data, err: error } = await trycatch(async () => {
  const response = await fetch('https://api.example.com/data');
  return response.json();
});

if (error === undefined) {
  console.log(data); // API data
} else {
  console.error('Failed to fetch:', error.message);
}
```

### Operation Pipeline

The operation pipeline provides a powerful, chainable way to process data with built-in error handling and context management.

#### Basic Pipeline

```typescript
import { operation } from '@uglyunicorn/amino';

// Simple value transformation
const result = await operation(10, 'initial-context')
  .step((value: number) => ok(value * 2))
  .step((value: number) => ok(value + 1))
  .complete();

if (result.err === undefined) {
  console.log(result.res); // 21
}
```

#### Context Management

```typescript
// Context updates while preserving value - clean and simple!
const result = await operation(5, 'initial')
  .step((value: number) => ok(value * 2))
  .context((ctx: string, value: number) => `${ctx}-processed`)
  .step((value: number) => ok(value + 1))
  .complete();

if (result.err === undefined) {
  console.log(result.res); // 11
}
```

#### Error Handling

```typescript
// Fail-fast error handling
const result = await operation(10, 'test')
  .step((value: number) => ok(value * 2))
  .step((value: number) => err('Something went wrong'))
  .step((value: number) => ok(value + 1)) // This won't execute
  .complete();

if (result.err !== undefined) {
  console.log(result.err.message); // "Something went wrong"
}
```

#### Custom Error Types

```typescript
class ValidationError extends Error {
  constructor(message: string, cause?: Error) {
    super(message, { cause });
  }
}

const result = await operation(10, 'test')
  .failsWith(ValidationError, 'Validation failed')
  .step((value: number) => err('Invalid input'))
  .complete();

if (result.err !== undefined) {
  console.log(result.err instanceof ValidationError); // true
  console.log(result.err.message); // "Validation failed"
  console.log(result.err.cause?.message); // "Invalid input"
}
```

#### Async Operations

```typescript
// Mix sync and async operations
const result = await operation(3, 'test')
  .step((value: number) => ok(value * 2)) // sync
  .step(async (value: number) => ok(value + 1)) // async
  .step((value: number) => ok(value * 2)) // sync
  .complete();

if (result.err === undefined) {
  console.log(result.res); // 14
}
```

#### Complex Data Processing

```typescript
interface User {
  id: number;
  name: string;
  email: string;
}

interface UserProfile {
  id: number;
  displayName: string;
  email: string;
}

const result = await operation('john@example.com', { apiUrl: 'https://api.example.com' })
  .step(async (email: string) => {
    // Simulate API call
    const user: User = { id: 1, name: 'John Doe', email };
    return ok(user);
  })
  .context((ctx: { apiUrl: string }, user: User) => {
    return { ...ctx, userId: user.id };
  })
  .step((user: User) => {
    const profile: UserProfile = {
      id: user.id,
      displayName: user.name,
      email: user.email
    };
    return ok(profile);
  })
  .complete();

if (result.err === undefined) {
  console.log(result.res); // UserProfile object
}
```

#### Type Safety

The operation pipeline is fully type-safe, with TypeScript inferring types throughout the chain:

```typescript
const op = operation(42, 'test')
  .step((value: number) => ok(value.toString())) // number -> string
  .step((value: string) => ok(value.length)) // string -> number
  .step((value: number) => ok(value > 0)); // number -> boolean

// TypeScript knows the final value type is boolean
const result = await op.complete();
// result.res is typed as boolean
```

## License

MIT
