# Amino

A lightweight, type-safe Result pattern implementation for TypeScript.

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

## License

MIT
