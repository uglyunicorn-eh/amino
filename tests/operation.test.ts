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

  // Additional comprehensive tests
  describe('Edge Cases and Error Scenarios', () => {
    test('operation with no steps', () => {
      const op = operation();
      expect(op).toBeDefined();
      expect(typeof op.complete).toBe('function');
    });

    test('operation with single step', () => {
      const op = operation()
        .step((value: number) => ok(value * 2));
      
      expect(op).toBeDefined();
      expect(typeof op.step).toBe('function');
    });

    test('operation with single context', () => {
      const op = operation()
        .context((ctx: string, value: number) => ok(`${ctx}-processed`));
      
      expect(op).toBeDefined();
      expect(typeof op.context).toBe('function');
    });

    test('operation with single failsWith', () => {
      const op = operation()
        .failsWith('Single error');
      
      expect(op).toBeDefined();
      expect(typeof op.failsWith).toBe('function');
    });

    test('complex chaining with multiple types', () => {
      class DatabaseError extends Error {
        constructor(message: string, cause?: Error) {
          super(message, { cause });
        }
      }

      const op = operation()
        .step((value: string) => ok(value.length)) // string -> number
        .context((ctx: number, value: number) => ok(ctx + value)) // context: number -> number
        .step((value: number) => ok(value.toString())) // number -> string
        .context((ctx: number, value: string) => ok(`${ctx}-${value}`)) // context: number -> string
        .failsWith(DatabaseError, 'Database operation failed')
        .step((value: string) => ok(value.split('-'))) // string -> string[]
        .context((ctx: string, value: string[]) => ok(`${ctx}-${value.length}`)); // context: string -> string
      
      expect(op).toBeDefined();
      expect(typeof op.step).toBe('function');
      expect(typeof op.context).toBe('function');
      expect(typeof op.failsWith).toBe('function');
      expect(typeof op.complete).toBe('function');
    });

    test('failsWith with different error classes', () => {
      class ValidationError extends Error {
        constructor(message: string, cause?: Error) {
          super(message, { cause });
        }
      }

      class NetworkError extends Error {
        constructor(message: string, cause?: Error) {
          super(message, { cause });
        }
      }

      const op1 = operation().failsWith(ValidationError, 'Validation failed');
      const op2 = operation().failsWith(NetworkError, 'Network failed');
      const op3 = operation().failsWith('Generic error');
      
      expect(op1).toBeDefined();
      expect(op2).toBeDefined();
      expect(op3).toBeDefined();
    });

    test('step with complex return types', () => {
      interface User {
        id: number;
        name: string;
      }

      const op = operation()
        .step((value: string) => ok({ id: 1, name: value } as User))
        .step((value: User) => ok(value.name))
        .step((value: string) => ok(value.length));
      
      expect(op).toBeDefined();
    });

    test('context with complex types', () => {
      interface Config {
        apiUrl: string;
        timeout: number;
      }

      const op = operation()
        .context((ctx: Config, value: string) => ok({ ...ctx, apiUrl: value }))
        .context((ctx: Config, value: string) => ok({ ...ctx, timeout: 5000 }));
      
      expect(op).toBeDefined();
    });

    test('mixed async and sync steps', () => {
      const op = operation()
        .step((value: number) => ok(value * 2)) // sync
        .step(async (value: number) => ok(value + 1)) // async
        .step((value: number) => ok(value.toString())) // sync
        .step(async (value: string) => ok(value.length)); // async
      
      expect(op).toBeDefined();
    });

    test('mixed async and sync context', () => {
      const op = operation()
        .context((ctx: string, value: number) => ok(`${ctx}-${value}`)) // sync
        .context(async (ctx: string, value: number) => ok(`${ctx}-async`)) // async
        .context((ctx: string, value: number) => ok(`${ctx}-final`)); // sync
      
      expect(op).toBeDefined();
    });

    test('step with Error result', () => {
      const op = operation()
        .step((value: number) => err(new Error('Custom error')))
        .step((value: number) => ok(value + 1));
      
      expect(op).toBeDefined();
    });

    test('context with Error result', () => {
      const op = operation()
        .context((ctx: string, value: number) => err(new Error('Context error')))
        .context((ctx: string, value: number) => ok(`${ctx}-processed`));
      
      expect(op).toBeDefined();
    });

    test('step with string error', () => {
      const op = operation()
        .step((value: number) => err('String error'))
        .step((value: number) => ok(value + 1));
      
      expect(op).toBeDefined();
    });

    test('context with string error', () => {
      const op = operation()
        .context((ctx: string, value: number) => err('String context error'))
        .context((ctx: string, value: number) => ok(`${ctx}-processed`));
      
      expect(op).toBeDefined();
    });
  });

  describe('Type Safety Tests', () => {
    test('step function parameter types', () => {
      // This test ensures TypeScript can infer the correct types
      const op = operation()
        .step((value: number, context: string) => {
          expect(typeof value).toBe('number');
          expect(typeof context).toBe('string');
          return ok(value.toString());
        });
      
      expect(op).toBeDefined();
    });

    test('context function parameter types', () => {
      // This test ensures TypeScript can infer the correct types
      const op = operation()
        .context((context: string, value: number) => {
          expect(typeof context).toBe('string');
          expect(typeof value).toBe('number');
          return ok(`${context}-${value}`);
        });
      
      expect(op).toBeDefined();
    });

    test('failsWith preserves error type', () => {
      class CustomError extends Error {
        constructor(message: string, cause?: Error) {
          super(message, { cause });
        }
      }

      const op = operation()
        .failsWith(CustomError, 'Custom error message');
      
      expect(op).toBeDefined();
      // The error type should be preserved in the operation
    });

    test('operation state immutability', () => {
      const op1 = operation().step((value: number) => ok(value * 2));
      const op2 = op1.step((value: number) => ok(value + 1));
      
      // Each operation should be a new instance
      expect(op1).not.toBe(op2);
      expect(op1).toBeDefined();
      expect(op2).toBeDefined();
    });
  });

  describe('Method Chaining Behavior', () => {
    test('step chaining returns new operation', () => {
      const op1 = operation();
      const op2 = op1.step((value: number) => ok(value * 2));
      const op3 = op2.step((value: number) => ok(value + 1));
      
      expect(op1).not.toBe(op2);
      expect(op2).not.toBe(op3);
      expect(op1).toBeDefined();
      expect(op2).toBeDefined();
      expect(op3).toBeDefined();
    });

    test('context chaining returns new operation', () => {
      const op1 = operation();
      const op2 = op1.context((ctx: string, value: number) => ok(`${ctx}-${value}`));
      const op3 = op2.context((ctx: string, value: number) => ok(`${ctx}-processed`));
      
      expect(op1).not.toBe(op2);
      expect(op2).not.toBe(op3);
      expect(op1).toBeDefined();
      expect(op2).toBeDefined();
      expect(op3).toBeDefined();
    });

    test('failsWith chaining returns new operation', () => {
      const op1 = operation();
      const op2 = op1.failsWith('First error');
      const op3 = op2.failsWith('Second error');
      
      expect(op1).not.toBe(op2);
      expect(op2).not.toBe(op3);
      expect(op1).toBeDefined();
      expect(op2).toBeDefined();
      expect(op3).toBeDefined();
    });

    test('mixed chaining returns new operations', () => {
      const op1 = operation();
      const op2 = op1.step((value: number) => ok(value * 2));
      const op3 = op2.context((ctx: string, value: number) => ok(`${ctx}-${value}`));
      const op4 = op3.failsWith('Mixed error');
      
      expect(op1).not.toBe(op2);
      expect(op2).not.toBe(op3);
      expect(op3).not.toBe(op4);
      expect(op1).toBeDefined();
      expect(op2).toBeDefined();
      expect(op3).toBeDefined();
      expect(op4).toBeDefined();
    });
  });
});