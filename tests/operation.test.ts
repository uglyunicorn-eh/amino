import { describe, expect, test } from 'bun:test';
import { operation } from '../src/operation.ts';
import { ok, err } from '../src/result.ts';

describe('Operation Pipeline', () => {
  test('creates operation instance', () => {
    const op = operation(42, 'initial-context');
    expect(op).toBeDefined();
    expect(typeof op.step).toBe('function');
    expect(typeof op.context).toBe('function');
    expect(typeof op.failsWith).toBe('function');
    expect(typeof op.complete).toBe('function');
  });

  test('can chain step methods', () => {
    const op = operation(10, 'test-context')
      .step((value: number) => ok(value * 2))
      .step((value: number) => ok(value + 1));
    
    expect(op).toBeDefined();
    expect(typeof op.step).toBe('function');
    expect(typeof op.context).toBe('function');
    expect(typeof op.failsWith).toBe('function');
    expect(typeof op.complete).toBe('function');
  });

  test('can chain context methods', () => {
    const op = operation(42, 'initial')
      .context((ctx: string, value: number) => `${ctx}-${value}`)
      .context((ctx: string, value: number) => `${ctx}-processed`);
    
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

    const op = operation(42, 'test')
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

    const op = operation(10, 'initial')
      .step((value: number) => ok(value * 2))
      .context((ctx: string, value: number) => `${ctx}-${value}`)
      .failsWith(CustomError, 'Step failed')
      .step((value: number) => ok(value + 1))
      .context((ctx: string, value: number) => `${ctx}-final`);
    
    expect(op).toBeDefined();
    expect(typeof op.step).toBe('function');
    expect(typeof op.context).toBe('function');
    expect(typeof op.failsWith).toBe('function');
    expect(typeof op.complete).toBe('function');
  });

  test('complete method executes pipeline successfully', async () => {
    const op = operation(10, 'test')
      .step((value: number) => ok(value * 2))
      .step((value: number) => ok(value + 1));
    
    const result = await op.complete();
    
    expect(result.err).toBeUndefined();
    expect(result.res).toBe(21); // (10 * 2) + 1
  });

  test('pipeline execution with context updates', async () => {
    const op = operation(5, 'initial')
      .step((value: number) => ok(value * 2))
      .context((ctx: string, value: number) => `${ctx}-${value}`)
      .step((value: number) => ok(value + 1));
    
    const result = await op.complete();
    
    expect(result.err).toBeUndefined();
    expect(result.res).toBe(11); // (5 * 2) + 1
  });

  test('pipeline execution with async steps', async () => {
    const op = operation(3, 'test')
      .step(async (value: number) => ok(value * 2))
      .step(async (value: number) => ok(value + 1));
    
    const result = await op.complete();
    
    expect(result.err).toBeUndefined();
    expect(result.res).toBe(7); // (3 * 2) + 1
  });

  test('pipeline execution with mixed async/sync steps', async () => {
    const op = operation(4, 'test')
      .step((value: number) => ok(value * 2)) // sync
      .step(async (value: number) => ok(value + 1)) // async
      .step((value: number) => ok(value * 2)); // sync
    
    const result = await op.complete();
    
    expect(result.err).toBeUndefined();
    expect(result.res).toBe(18); // ((4 * 2) + 1) * 2
  });

  test('pipeline execution with error handling', async () => {
    const op = operation(10, 'test')
      .step((value: number) => err('Step failed'))
      .step((value: number) => ok(value + 1));
    
    const result = await op.complete();
    
    expect(result.res).toBeUndefined();
    expect(result.err).toBeInstanceOf(Error);
    expect(result.err.message).toBe('Step failed');
  });

  test('pipeline execution with error transformation', async () => {
    class CustomError extends Error {
      constructor(message: string, cause?: Error) {
        super(message, { cause });
      }
    }

    const op = operation(10, 'test')
      .failsWith(CustomError, 'Operation failed')
      .step((value: number) => err('Step failed'));
    
    const result = await op.complete();
    
    expect(result.res).toBeUndefined();
    expect(result.err).toBeInstanceOf(CustomError);
    expect(result.err.message).toBe('Operation failed');
    expect(result.err.cause).toBeInstanceOf(Error);
    expect(result.err.cause.message).toBe('Step failed');
  });

  test('step method preserves types', () => {
    const op = operation(42, 'test')
      .step((value: number) => ok(value.toString())) // number -> string
      .step((value: string) => ok(value.length)); // string -> number
    
    expect(op).toBeDefined();
    // The types should be preserved through the chain
  });

  test('context method preserves value types', () => {
    const op = operation(42, 'initial')
      .context((ctx: string, value: number) => `${ctx}-${value}`) // context: string -> string, value: number
      .context((ctx: string, value: number) => `${ctx}-processed`); // context: string -> string, value: number
    
    expect(op).toBeDefined();
    // The value type should remain number throughout
  });

  test('failsWith with custom error class', () => {
    class ValidationError extends Error {
      constructor(message: string, cause?: Error) {
        super(message, { cause });
      }
    }

    const op = operation(42, 'test')
      .failsWith(ValidationError, 'Validation failed');
    
    expect(op).toBeDefined();
  });

  test('failsWith with generic error', () => {
    const op = operation(42, 'test')
      .failsWith('Something went wrong');
    
    expect(op).toBeDefined();
  });

  test('step method with async functions', () => {
    const op = operation(10, 'test')
      .step(async (value: number) => ok(value * 2))
      .step(async (value: number) => ok(value + 1));
    
    expect(op).toBeDefined();
    expect(typeof op.step).toBe('function');
    expect(typeof op.context).toBe('function');
    expect(typeof op.failsWith).toBe('function');
    expect(typeof op.complete).toBe('function');
  });

  test('context method with async functions', () => {
    const op = operation(42, 'initial')
      .context(async (ctx: string, value: number) => `${ctx}-${value}`)
      .context(async (ctx: string, value: number) => `${ctx}-processed`);
    
    expect(op).toBeDefined();
    expect(typeof op.step).toBe('function');
    expect(typeof op.context).toBe('function');
    expect(typeof op.failsWith).toBe('function');
    expect(typeof op.complete).toBe('function');
  });

  test('step method with error results', () => {
    const op = operation(42, 'test')
      .step((value: number) => err('Step failed'))
      .step((value: number) => ok(value + 1));
    
    expect(op).toBeDefined();
    expect(typeof op.step).toBe('function');
    expect(typeof op.context).toBe('function');
    expect(typeof op.failsWith).toBe('function');
    expect(typeof op.complete).toBe('function');
  });

  test('context method with error results', () => {
    const op = operation(42, 'initial')
      .context((ctx: string, value: number) => err('Context failed'))
      .context((ctx: string, value: number) => `${ctx}-processed`);
    
    expect(op).toBeDefined();
    expect(typeof op.step).toBe('function');
    expect(typeof op.context).toBe('function');
    expect(typeof op.failsWith).toBe('function');
    expect(typeof op.complete).toBe('function');
  });

  // Additional comprehensive tests
  describe('Edge Cases and Error Scenarios', () => {
    test('operation with no steps', () => {
      const op = operation(42, 'test');
      expect(op).toBeDefined();
      expect(typeof op.complete).toBe('function');
    });

    test('operation with no steps - execution returns initial value', async () => {
      const result = await operation(42, 'test').complete();
      
      expect(result.err).toBeUndefined();
      expect(result.res).toBe(42);
    });

    test('operation with single step', () => {
      const op = operation(10, 'test')
        .step((value: number) => ok(value * 2));
      
      expect(op).toBeDefined();
      expect(typeof op.step).toBe('function');
    });

    test('operation with single context', () => {
      const op = operation(42, 'initial')
        .context((ctx: string, value: number) => `${ctx}-processed`);
      
      expect(op).toBeDefined();
      expect(typeof op.context).toBe('function');
    });

    test('operation with single failsWith', () => {
      const op = operation(42, 'test')
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

      const op = operation('hello', 0)
        .step((value: string) => ok(value.length)) // string -> number
        .context((ctx: number, value: number) => ctx + value) // context: number -> number
        .step((value: number) => ok(value.toString())) // number -> string
        .context((ctx: number, value: string) => `${ctx}-${value}`) // context: number -> string
        .failsWith(DatabaseError, 'Database operation failed')
        .step((value: string) => ok(value.split('-'))) // string -> string[]
        .context((ctx: string, value: string[]) => `${ctx}-${value.length}`); // context: string -> string
      
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

      const op1 = operation(42, 'test').failsWith(ValidationError, 'Validation failed');
      const op2 = operation(42, 'test').failsWith(NetworkError, 'Network failed');
      const op3 = operation(42, 'test').failsWith('Generic error');
      
      expect(op1).toBeDefined();
      expect(op2).toBeDefined();
      expect(op3).toBeDefined();
    });

    test('step with complex return types', () => {
      interface User {
        id: number;
        name: string;
      }

      const op = operation('test', 'initial')
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

      const op = operation(42, 'test')
        .context((ctx: Config, value: string) => ({ ...ctx, apiUrl: value }))
        .context((ctx: Config, value: string) => ({ ...ctx, timeout: 5000 }));
      
      expect(op).toBeDefined();
    });

    test('mixed async and sync steps', () => {
      const op = operation(42, 'test')
        .step((value: number) => ok(value * 2)) // sync
        .step(async (value: number) => ok(value + 1)) // async
        .step((value: number) => ok(value.toString())) // sync
        .step(async (value: string) => ok(value.length)); // async
      
      expect(op).toBeDefined();
    });

    test('mixed async and sync context', () => {
      const op = operation(42, 'test')
        .context((ctx: string, value: number) => `${ctx}-${value}`) // sync
        .context(async (ctx: string, value: number) => `${ctx}-async`) // async
        .context((ctx: string, value: number) => `${ctx}-final`); // sync
      
      expect(op).toBeDefined();
    });

    test('step with Error result', () => {
      const op = operation(42, 'test')
        .step((value: number) => err(new Error('Custom error')))
        .step((value: number) => ok(value + 1));
      
      expect(op).toBeDefined();
    });

    test('context with Error result', () => {
      const op = operation(42, 'test')
        .context((ctx: string, value: number) => err(new Error('Context error')))
        .context((ctx: string, value: number) => `${ctx}-processed`);
      
      expect(op).toBeDefined();
    });

    test('step with string error', () => {
      const op = operation(42, 'test')
        .step((value: number) => err('String error'))
        .step((value: number) => ok(value + 1));
      
      expect(op).toBeDefined();
    });

    test('context with string error', () => {
      const op = operation(42, 'test')
        .context((ctx: string, value: number) => err('String context error'))
        .context((ctx: string, value: number) => `${ctx}-processed`);
      
      expect(op).toBeDefined();
    });

    test('unexpected error during step execution', async () => {
      const op = operation(10, 'test')
        .step((value: number) => {
          // Simulate unexpected error (not a Result)
          throw new Error('Unexpected step error');
        });

      const result = await op.complete();

      expect(result.res).toBeUndefined();
      expect(result.err).toBeInstanceOf(Error);
      expect(result.err.message).toBe('Unexpected step error');
    });

    test('unexpected error during context execution', async () => {
      const op = operation(10, 'test')
        .context((ctx: string, value: number) => {
          // Simulate unexpected error (not a Result)
          throw new Error('Unexpected context error');
        });

      const result = await op.complete();

      expect(result.res).toBeUndefined();
      expect(result.err).toBeInstanceOf(Error);
      expect(result.err.message).toBe('Unexpected context error');
    });

    test('unexpected non-Error during execution', async () => {
      const op = operation(10, 'test')
        .step((value: number) => {
          // Simulate unexpected non-Error
          throw 'String error';
        });

      const result = await op.complete();

      expect(result.res).toBeUndefined();
      expect(result.err).toBeInstanceOf(Error);
      expect(result.err.message).toBe('String error');
    });

    test('unexpected error with error transformation', async () => {
      class CustomError extends Error {
        constructor(message: string, cause?: Error) {
          super(message, { cause });
        }
      }

      const op = operation(10, 'test')
        .failsWith(CustomError, 'Operation failed')
        .step((value: number) => {
          throw new Error('Step failed');
        });

      const result = await op.complete();

      expect(result.res).toBeUndefined();
      expect(result.err).toBeInstanceOf(CustomError);
      expect(result.err.message).toBe('Operation failed');
      expect(result.err.cause).toBeInstanceOf(Error);
      expect(result.err.cause.message).toBe('Step failed');
    });

    test('operation with complex data types', async () => {
      interface ComplexData {
        id: number;
        data: string[];
        metadata: Record<string, any>;
      }

      const result = await operation({ id: 1, data: ['a', 'b'], metadata: { key: 'value' } }, 'test')
        .step((value: ComplexData) => ok({ ...value, id: value.id + 1 }))
        .context((ctx: string, value: ComplexData) => `${ctx}-${value.id}`)
        .step((value: ComplexData) => ok(value.data.length))
        .complete();

      expect(result.err).toBeUndefined();
      expect(result.res).toBe(2);
    });

    test('operation with null and undefined values', async () => {
      const result = await operation(null, undefined)
        .step((value: null) => ok('processed'))
        .context((ctx: undefined, value: string) => 'context')
        .complete();

      expect(result.err).toBeUndefined();
      expect(result.res).toBe('processed');
    });

    test('operation with empty arrays and objects', async () => {
      const result = await operation([], {})
        .step((value: any[]) => ok(value.length))
        .context((ctx: any, value: number) => ({ ...ctx, count: value }))
        .step((value: number) => ok(value === 0))
        .complete();

      expect(result.err).toBeUndefined();
      expect(result.res).toBe(true);
    });
  });

  describe('Type Safety Tests', () => {
    test('step function parameter types', () => {
      // This test ensures TypeScript can infer the correct types
      const op = operation(42, 'test')
        .step((value: number, context: string) => {
          expect(typeof value).toBe('number');
          expect(typeof context).toBe('string');
          return ok(value.toString());
        });
      
      expect(op).toBeDefined();
    });

    test('context function parameter types', () => {
      // This test ensures TypeScript can infer the correct types
      const op = operation(42, 'test')
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

      const op = operation(42, 'test')
        .failsWith(CustomError, 'Custom error message');
      
      expect(op).toBeDefined();
      // The error type should be preserved in the operation
    });

    test('operation state immutability', () => {
      const op1 = operation(42, 'test').step((value: number) => ok(value * 2));
      const op2 = op1.step((value: number) => ok(value + 1));
      
      // Each operation should be a new instance
      expect(op1).not.toBe(op2);
      expect(op1).toBeDefined();
      expect(op2).toBeDefined();
    });
  });

  describe('Method Chaining Behavior', () => {
    test('step chaining returns new operation', () => {
      const op1 = operation(42, 'test');
      const op2 = op1.step((value: number) => ok(value * 2));
      const op3 = op2.step((value: number) => ok(value + 1));
      
      expect(op1).not.toBe(op2);
      expect(op2).not.toBe(op3);
      expect(op1).toBeDefined();
      expect(op2).toBeDefined();
      expect(op3).toBeDefined();
    });

    test('context chaining returns new operation', () => {
      const op1 = operation(42, 'test');
      const op2 = op1.context((ctx: string, value: number) => `${ctx}-${value}`);
      const op3 = op2.context((ctx: string, value: number) => `${ctx}-processed`);
      
      expect(op1).not.toBe(op2);
      expect(op2).not.toBe(op3);
      expect(op1).toBeDefined();
      expect(op2).toBeDefined();
      expect(op3).toBeDefined();
    });

    test('failsWith chaining returns new operation', () => {
      const op1 = operation(42, 'test');
      const op2 = op1.failsWith('First error');
      const op3 = op2.failsWith('Second error');
      
      expect(op1).not.toBe(op2);
      expect(op2).not.toBe(op3);
      expect(op1).toBeDefined();
      expect(op2).toBeDefined();
      expect(op3).toBeDefined();
    });

    test('mixed chaining returns new operations', () => {
      const op1 = operation(42, 'test');
      const op2 = op1.step((value: number) => ok(value * 2));
      const op3 = op2.context((ctx: string, value: number) => `${ctx}-${value}`);
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