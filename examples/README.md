# Amino Examples

This directory contains example projects demonstrating various use cases of Amino.

## Available Examples

### Hono Integration (`hono/`)

Demonstrates how to use Amino with Hono to build REST APIs with:
- Type-safe error handling using the Result pattern
- Clean response formatting
- Multiple step transformations
- Proper HTTP status codes (200 for success, 400 for errors)

See [hono/README.md](./hono/README.md) for details.

## Running Examples

Each example directory contains its own setup instructions. Generally:

1. Navigate to the example directory
2. Run `bun install` to install dependencies
3. Follow the example-specific instructions

## Quick Example

Here's a simple example showing Amino's core concepts:

```typescript
import { instruction, ok, err, type Result } from '@uglyunicorn/amino';

// Define a simple operation that might fail
const divide = (a: number, b: number): Result<number, Error> => {
  if (b === 0) {
    return err(new Error('Division by zero'));
  }
  return ok(a / b);
};

// Use instruction pipeline for complex operations
const result = await instruction()
  .step(() => ok({ a: 10, b: 2 }))
  .step(({ a, b }) => divide(a, b))
  .step((value) => ok(value * 2))
  .run();

if (result.err) {
  console.error('Error:', result.err.message);
} else {
  console.log('Result:', result.res); // 10
}
```

## Contributing Examples

When adding new examples:
1. Create a new directory under `examples/`
2. Include a `README.md` explaining the example
3. Provide setup and usage instructions
4. Keep examples simple and focused

