import { describe, expect, test } from 'bun:test';
import { operation } from '../src/operation.ts';
import { ok, err } from '../src/result.ts';

describe('Operation Pipeline', () => {
  test('creates operation instance', () => {
    const op = operation();
    expect(op).toBeDefined();
    expect(typeof op.step).toBe('function');
    expect(typeof op.context).toBe('function');
    expect(typeof op.failsWith).toBe('function');
    expect(typeof op.complete).toBe('function');
  });

  test('can chain step methods', () => {
    const op = operation()
      .step((value: number) => ok(value * 2))
      .step((value: number) => ok(value + 1));
    
    expect(op).toBeDefined();
    expect(typeof op.step).toBe('function');
    expect(typeof op.context).toBe('function');
    expect(typeof op.failsWith).toBe('function');
    expect(typeof op.complete).toBe('function');
  });

  test('can chain context methods', () => {
    const op = operation()
      .context((ctx: string, value: number) => ok(`${ctx}-${value}`))
      .context((ctx: string, value: number) => ok(`${ctx}-processed`));
    
    expect(op).toBeDefined();
    expect(typeof op.step).toBe('function');
    expect(typeof op.context).toBe('function');
    expect(typeof op.failsWith).toBe('function');
    expect(typeof op.complete).toBe('function');
  });

  test('can chain failsWith methods', () => {
    class CustomError extends Error {
      constructor(message: string, cause?: Error) {
        super(message, { cause });
      }
    }

    const op = operation()
      .failsWith(CustomError, 'Operation failed')
      .failsWith('Generic error');
    
    expect(op).toBeDefined();
    expect(typeof op.step).toBe('function');
    expect(typeof op.context).toBe('function');
    expect(typeof op.failsWith).toBe('function');
    expect(typeof op.complete).toBe('function');
  });

  test('can mix step, context, and failsWith methods', () => {
    class CustomError extends Error {
      constructor(message: string, cause?: Error) {
        super(message, { cause });
      }
    }

    const op = operation()
      .step((value: number) => ok(value * 2))
      .context((ctx: string, value: number) => ok(`${ctx}-${value}`))
      .failsWith(CustomError, 'Step failed')
      .step((value: number) => ok(value + 1))
      .context((ctx: string, value: number) => ok(`${ctx}-final`));
    
    expect(op).toBeDefined();
    expect(typeof op.step).toBe('function');
    expect(typeof op.context).toBe('function');
    expect(typeof op.failsWith).toBe('function');
    expect(typeof op.complete).toBe('function');
  });

  test('complete method throws not implemented error', async () => {
    const op = operation();
    
    try {
      await op.complete();
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Pipeline execution not yet implemented');
    }
  });

  test('step method preserves types', () => {
    const op = operation()
      .step((value: number) => ok(value.toString())) // number -> string
      .step((value: string) => ok(value.length)); // string -> number
    
    expect(op).toBeDefined();
    // The types should be preserved through the chain
  });

  test('context method preserves value types', () => {
    const op = operation()
      .context((ctx: string, value: number) => ok(`${ctx}-${value}`)) // context: string -> string, value: number
      .context((ctx: string, value: number) => ok(`${ctx}-processed`)); // context: string -> string, value: number
    
    expect(op).toBeDefined();
    // The value type should remain number throughout
  });

  test('failsWith with custom error class', () => {
    class ValidationError extends Error {
      constructor(message: string, cause?: Error) {
        super(message, { cause });
      }
    }

    const op = operation()
      .failsWith(ValidationError, 'Validation failed');
    
    expect(op).toBeDefined();
  });

  test('failsWith with generic error', () => {
    const op = operation()
      .failsWith('Something went wrong');
    
    expect(op).toBeDefined();
  });

  test('step method with async functions', () => {
    const op = operation()
      .step(async (value: number) => ok(value * 2))
      .step(async (value: number) => ok(value + 1));
    
    expect(op).toBeDefined();
    expect(typeof op.step).toBe('function');
    expect(typeof op.context).toBe('function');
    expect(typeof op.failsWith).toBe('function');
    expect(typeof op.complete).toBe('function');
  });

  test('context method with async functions', () => {
    const op = operation()
      .context(async (ctx: string, value: number) => ok(`${ctx}-${value}`))
      .context(async (ctx: string, value: number) => ok(`${ctx}-processed`));
    
    expect(op).toBeDefined();
    expect(typeof op.step).toBe('function');
    expect(typeof op.context).toBe('function');
    expect(typeof op.failsWith).toBe('function');
    expect(typeof op.complete).toBe('function');
  });

  test('step method with error results', () => {
    const op = operation()
      .step((value: number) => err('Step failed'))
      .step((value: number) => ok(value + 1));
    
    expect(op).toBeDefined();
    expect(typeof op.step).toBe('function');
    expect(typeof op.context).toBe('function');
    expect(typeof op.failsWith).toBe('function');
    expect(typeof op.complete).toBe('function');
  });

  test('context method with error results', () => {
    const op = operation()
      .context((ctx: string, value: number) => err('Context failed'))
      .context((ctx: string, value: number) => ok(`${ctx}-processed`));
    
    expect(op).toBeDefined();
    expect(typeof op.step).toBe('function');
    expect(typeof op.context).toBe('function');
    expect(typeof op.failsWith).toBe('function');
    expect(typeof op.complete).toBe('function');
  });
});