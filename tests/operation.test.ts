import { describe, expect, test } from 'bun:test';
import { operation, makeOperation } from '../src/operation.ts';
import { ok, err, type Result } from '../src/result.ts';

describe('Operation Pipeline', () => {
  test('creates operation instance', () => {
    const op = operation('initial-context', 42);
    expect(op).toBeDefined();
    expect(typeof op.step).toBe('function');
    expect(typeof op.context).toBe('function');
    expect(typeof op.failsWith).toBe('function');
    expect(typeof op.complete).toBe('function');
  });

  test('creates operation instance with optional arguments', () => {
    const op1 = operation();
    const op2 = operation(42);
    const op3 = operation('context', undefined);
    
    expect(op1).toBeDefined();
    expect(op2).toBeDefined();
    expect(op3).toBeDefined();
  });

  test('can chain step methods', () => {
    const op = operation('test-context', 10)
      .step((value: number) => ok(value * 2))
      .step((value: number) => ok(value + 1));
    
    expect(op).toBeDefined();
    expect(typeof op.step).toBe('function');
    expect(typeof op.context).toBe('function');
    expect(typeof op.failsWith).toBe('function');
    expect(typeof op.complete).toBe('function');
  });

  test('can chain context methods', () => {
    const op = operation('initial', 42)
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

    const op = operation('test', 42)
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

    const op = operation('initial', 10)
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
    const op = operation('test', 10)
      .step((value: number) => ok(value * 2))
      .step((value: number) => ok(value + 1));
    
    const result = await op.complete();
    
    expect(result.err).toBeUndefined();
    expect(result.res).toBe(21); // (10 * 2) + 1
  });

  test('pipeline execution with context updates', async () => {
    const op = operation('initial', 5)
      .step((value: number) => ok(value * 2))
      .context((ctx: string, value: number) => `${ctx}-${value}`)
      .step((value: number) => ok(value + 1));
    
    const result = await op.complete();
    
    expect(result.err).toBeUndefined();
    expect(result.res).toBe(11); // (5 * 2) + 1
  });

  test('pipeline execution with async steps', async () => {
    const op = operation('test', 3)
      .step(async (value: number) => ok(value * 2))
      .step(async (value: number) => ok(value + 1));
    
    const result = await op.complete();
    
    expect(result.err).toBeUndefined();
    expect(result.res).toBe(7); // (3 * 2) + 1
  });

  test('pipeline execution with mixed async/sync steps', async () => {
    const op = operation('test', 4)
      .step((value: number) => ok(value * 2)) // sync
      .step(async (value: number) => ok(value + 1)) // async
      .step((value: number) => ok(value * 2)); // sync
    
    const result = await op.complete();
    
    expect(result.err).toBeUndefined();
    expect(result.res).toBe(18); // ((4 * 2) + 1) * 2
  });

  test('pipeline execution with error handling', async () => {
    const op = operation('test', 10)
      .step((value: number) => err('Step failed'))
      .step((value: any) => ok(value + 1));
    
    const result = await op.complete();
    
    expect(result.res).toBeUndefined();
    expect(result.err).toBeInstanceOf(Error);
    expect(result.err?.message).toBe('Step failed');
  });

  test('pipeline execution with error transformation', async () => {
    class CustomError extends Error {
      constructor(message: string, cause?: Error) {
        super(message, { cause });
      }
    }

    const op = operation('test', 10)
      .failsWith(CustomError, 'Operation failed')
      .step((value: number) => err('Step failed'));
    
    const result = await op.complete();
    
    expect(result.res).toBeUndefined();
    expect(result.err).toBeInstanceOf(CustomError);
    expect(result.err?.message).toBe('Operation failed');
    expect(result.err?.cause).toBeInstanceOf(Error);
    expect((result.err?.cause as Error)?.message).toBe('Step failed');
  });

  test('step method preserves types', () => {
    const op = operation('test', 42)
      .step((value: number) => ok(value.toString())) // number -> string
      .step((value: string) => ok(value.length)); // string -> number
    
    expect(op).toBeDefined();
    // The types should be preserved through the chain
  });

  test('context method preserves value types', () => {
    const op = operation('initial', 42)
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

    const op = operation('test', 42)
      .failsWith(ValidationError, 'Validation failed');
    
    expect(op).toBeDefined();
  });

  test('failsWith with generic error', () => {
    const op = operation('test', 42)
      .failsWith('Something went wrong');
    
    expect(op).toBeDefined();
  });

  test('step method with async functions', () => {
    const op = operation('test', 10)
      .step(async (value: number) => ok(value * 2))
      .step(async (value: number) => ok(value + 1));
    
    expect(op).toBeDefined();
    expect(typeof op.step).toBe('function');
    expect(typeof op.context).toBe('function');
    expect(typeof op.failsWith).toBe('function');
    expect(typeof op.complete).toBe('function');
  });

  test('context method with async functions', () => {
    const op = operation('initial', 42)
      .context(async (ctx: string, value: number) => `${ctx}-${value}`)
      .context(async (ctx: any, value: number) => `${ctx}-processed`);
    
    expect(op).toBeDefined();
    expect(typeof op.step).toBe('function');
    expect(typeof op.context).toBe('function');
    expect(typeof op.failsWith).toBe('function');
    expect(typeof op.complete).toBe('function');
  });

  test('step method with error results', () => {
    const op = operation('test', 42)
      .step((value: number) => err('Step failed'))
      .step((value: any) => ok(value + 1));
    
    expect(op).toBeDefined();
    expect(typeof op.step).toBe('function');
    expect(typeof op.context).toBe('function');
    expect(typeof op.failsWith).toBe('function');
    expect(typeof op.complete).toBe('function');
  });

  test('context method with chaining', () => {
    const op = operation('initial', 42)
      .context((ctx: string, value: number) => `${ctx}-updated`)
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
      const op = operation('test', 42);
      expect(op).toBeDefined();
      expect(typeof op.complete).toBe('function');
    });

    test('operation with no steps - execution returns initial value', async () => {
      const result = await operation('test', 42).complete();
      
      expect(result.err).toBeUndefined();
      expect(result.res).toBe(42);
    });

    test('operation with single step', () => {
      const op = operation('test', 10)
        .step((value: number) => ok(value * 2));
      
      expect(op).toBeDefined();
      expect(typeof op.step).toBe('function');
    });

    test('operation with single context', () => {
      const op = operation('initial', 42)
        .context((ctx: string, value: number) => `${ctx}-processed`);
      
      expect(op).toBeDefined();
      expect(typeof op.context).toBe('function');
    });

    test('operation with single failsWith', () => {
      const op = operation('test', 42)
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

      const op = operation(0, 'hello')
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

      const op1 = operation('test', 42).failsWith(ValidationError, 'Validation failed');
      const op2 = operation('test', 42).failsWith(NetworkError, 'Network failed');
      const op3 = operation('test', 42).failsWith('Generic error');
      
      expect(op1).toBeDefined();
      expect(op2).toBeDefined();
      expect(op3).toBeDefined();
    });

    test('step with complex return types', () => {
      interface User {
        id: number;
        name: string;
      }

      const op = operation('initial', 'test')
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

      const op = operation('test', 42)
        .context((ctx: any, value: any) => ({ ...ctx, apiUrl: value }))
        .context((ctx: any, value: any) => ({ ...ctx, timeout: 5000 }));
      
      expect(op).toBeDefined();
    });

    test('mixed async and sync steps', () => {
      const op = operation('test', 42)
        .step((value: number) => ok(value * 2)) // sync
        .step(async (value: number) => ok(value + 1)) // async
        .step((value: number) => ok(value.toString())) // sync
        .step(async (value: string) => ok(value.length)); // async
      
      expect(op).toBeDefined();
    });

    test('mixed async and sync context', () => {
      const op = operation('test', 42)
        .context((ctx: string, value: number) => `${ctx}-${value}`) // sync
        .context(async (ctx: any, value: number) => `${ctx}-async`) // async
        .context((ctx: any, value: number) => `${ctx}-final`); // sync
      
      expect(op).toBeDefined();
    });

    test('step with Error result', () => {
      const op = operation('test', 42)
        .step((value: number) => err(new Error('Custom error')))
        .step((value: any) => ok(value + 1));
      
      expect(op).toBeDefined();
    });

    test('context with Error result', () => {
      const op = operation('test', 42)
        .context((ctx: string, value: number) => err(new Error('Context error')))
        .context((ctx: any, value: number) => `${ctx}-processed`);
      
      expect(op).toBeDefined();
    });

    test('step with string error', () => {
      const op = operation('test', 42)
        .step((value: number) => err('String error'))
        .step((value: any) => ok(value + 1));
      
      expect(op).toBeDefined();
    });

    test('context with multiple transformations', () => {
      const op = operation('test', 42)
        .context((ctx: string, value: number) => `${ctx}-${value}`)
        .context((ctx: string, value: number) => `${ctx}-processed`);
      
      expect(op).toBeDefined();
    });

    test('unexpected error during step execution', async () => {
      const op = operation('test', 10)
        .step((value: number) => {
          // Simulate unexpected error (not a Result)
          throw new Error('Unexpected step error');
        });

      const result = await op.complete();

      expect(result.res).toBeUndefined();
      expect(result.err).toBeInstanceOf(Error);
      expect(result.err?.message).toBe('Unexpected step error');
    });

    test('unexpected error during context execution', async () => {
      const op = operation('test', 10)
        .context((ctx: string, value: number) => {
          // Simulate unexpected error (not a Result)
          throw new Error('Unexpected context error');
        });

      const result = await op.complete();

      expect(result.res).toBeUndefined();
      expect(result.err).toBeInstanceOf(Error);
      expect(result.err?.message).toBe('Unexpected context error');
    });

    test('unexpected non-Error during execution', async () => {
      const op = operation('test', 10)
        .step((value: number) => {
          // Simulate unexpected non-Error
          throw 'String error';
        });

      const result = await op.complete();

      expect(result.res).toBeUndefined();
      expect(result.err).toBeInstanceOf(Error);
      expect(result.err?.message).toBe('String error');
    });

    test('unexpected error with error transformation', async () => {
      class CustomError extends Error {
        constructor(message: string, cause?: Error) {
          super(message, { cause });
        }
      }

      const op = operation('test', 10)
        .failsWith(CustomError, 'Operation failed')
        .step((value: number) => {
          throw new Error('Step failed');
        });

      const result = await op.complete();

      expect(result.res).toBeUndefined();
      expect(result.err).toBeInstanceOf(CustomError);
      expect(result.err?.message).toBe('Operation failed');
      expect(result.err?.cause).toBeInstanceOf(Error);
      expect((result.err?.cause as Error)?.message).toBe('Step failed');
    });

    test('operation with complex data types', async () => {
      interface ComplexData {
        id: number;
        data: string[];
        metadata: Record<string, any>;
      }

      const result = await operation('test', { id: 1, data: ['a', 'b'], metadata: { key: 'value' } })
        .step((value: ComplexData) => ok({ ...value, id: value.id + 1 }))
        .context((ctx: string, value: ComplexData) => `${ctx}-${value.id}`)
        .step((value: ComplexData) => ok(value.data.length))
        .complete();

      expect(result.err).toBeUndefined();
      expect(result.res).toBe(2);
    });

    test('operation with null and undefined values', async () => {
      const result = await operation(undefined, null)
        .step((value: null) => ok('processed'))
        .context((ctx: undefined, value: string) => 'context')
        .complete();

      expect(result.err).toBeUndefined();
      expect(result.res).toBe('processed');
    });

    test('operation with empty arrays and objects', async () => {
      const result = await operation({}, [])
        .step((value: any[]) => ok(value.length))
        .context((ctx: any, value: number) => ({ ...ctx, count: value }))
        .step((value: number) => ok(value === 0))
        .complete();

      expect(result.err).toBeUndefined();
      expect(result.res).toBe(true as any);
    });

    test('failsWith with custom error class without message', () => {
      class SimpleError extends Error {
        constructor(message: string) {
          super(message);
        }
      }

      const op = operation('test', 42)
        .failsWith(SimpleError, 'Simple error message');
      
      expect(op).toBeDefined();
      expect(typeof op.failsWith).toBe('function');
    });

    test('failsWith with error class with proper signature', () => {
      class ProperError extends Error {
        constructor(message: string, cause?: Error) {
          super(message, { cause });
          this.name = 'ProperError';
        }
      }

      const op = operation('test', 42)
        .failsWith(ProperError, 'Proper error');
      
      expect(op).toBeDefined();
    });

    test('error transformation with custom error class execution', async () => {
      class CustomError extends Error {
        constructor(message: string, cause?: Error) {
          super(message, { cause });
          this.name = 'CustomError';
        }
      }

      const op = operation('test', 10)
        .failsWith(CustomError, 'Custom operation failed')
        .step((value: number) => err('Step failed'));

      const result = await op.complete();

      expect(result.res).toBeUndefined();
      expect(result.err).toBeInstanceOf(CustomError);
      expect(result.err?.message).toBe('Custom operation failed');
      expect(result.err?.cause).toBeInstanceOf(Error);
      expect((result.err?.cause as Error)?.message).toBe('Step failed');
    });

    test('error transformation with generic error execution', async () => {
      const op = operation('test', 10)
        .failsWith('Generic operation failed')
        .step((value: number) => err('Step failed'));

      const result = await op.complete();

      expect(result.res).toBeUndefined();
      expect(result.err).toBeInstanceOf(Error);
      expect(result.err?.message).toBe('Generic operation failed');
      expect(result.err?.cause).toBeInstanceOf(Error);
      expect((result.err?.cause as Error)?.message).toBe('Step failed');
    });
  });

  describe('Type Safety Tests', () => {
    test('step function parameter types', () => {
      // This test ensures TypeScript can infer the correct types
      const op = operation('test', 42)
        .step((value: number, context: string) => {
          expect(typeof value).toBe('number');
          expect(typeof context).toBe('string');
          return ok(value.toString());
        });
      
      expect(op).toBeDefined();
    });

    test('context function parameter types', () => {
      // This test ensures TypeScript can infer the correct types
      const op = operation('test', 42)
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

      const op = operation('test', 42)
        .failsWith(CustomError, 'Custom error message');
      
      expect(op).toBeDefined();
      // The error type should be preserved in the operation
    });

    test('operation state immutability', () => {
      const op1 = operation('test', 42).step((value: number) => ok(value * 2));
      const op2 = op1.step((value: number) => ok(value + 1));
      
      // Each operation should be a new instance
      expect(op1).not.toBe(op2);
      expect(op1).toBeDefined();
      expect(op2).toBeDefined();
    });
  });

  describe('Method Chaining Behavior', () => {
    test('step chaining returns new operation', () => {
      const op1 = operation('test', 42);
      const op2 = op1.step((value: number) => ok(value * 2));
      const op3 = op2.step((value: number) => ok(value + 1));
      
      expect(op1).not.toBe(op2);
      expect(op2).not.toBe(op3);
      expect(op1).toBeDefined();
      expect(op2).toBeDefined();
      expect(op3).toBeDefined();
    });

    test('context chaining returns new operation', () => {
      const op1 = operation('test', 42);
      const op2 = op1.context((ctx: string, value: number) => `${ctx}-${value}`);
      const op3 = op2.context((ctx: string, value: number) => `${ctx}-processed`);
      
      expect(op1).not.toBe(op2);
      expect(op2).not.toBe(op3);
      expect(op1).toBeDefined();
      expect(op2).toBeDefined();
      expect(op3).toBeDefined();
    });

    test('failsWith chaining returns new operation', () => {
      const op1 = operation('test', 42);
      const op2 = op1.failsWith('First error');
      const op3 = op2.failsWith('Second error');
      
      expect(op1).not.toBe(op2);
      expect(op2).not.toBe(op3);
      expect(op1).toBeDefined();
      expect(op2).toBeDefined();
      expect(op3).toBeDefined();
    });

    test('mixed chaining returns new operations', () => {
      const op1 = operation('test', 42);
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

describe('makeOperation Factory', () => {
  test('creates a factory that returns operations', () => {
    const factory = makeOperation((result: Result<any>) => result);
    expect(typeof factory).toBe('function');
    
    const op = factory('context', 10);
    expect(op).toBeDefined();
    expect(typeof op.step).toBe('function');
    expect(typeof op.context).toBe('function');
    expect(typeof op.complete).toBe('function');
  });

  test('custom completion handler is called with result and context', async () => {
    let capturedResult: Result<any> | undefined;
    let capturedContext: any;
    
    const factory = makeOperation((result: Result<any>, context: any) => {
      capturedResult = result;
      capturedContext = context;
      return { custom: true, result };
    });

    const result = await factory({ test: 'context' }, 10)
      .step((value: number) => ok(value * 2))
      .complete();

    expect(capturedResult).toBeDefined();
    expect(capturedResult?.err).toBeUndefined();
    expect(capturedResult?.res).toBe(20);
    expect(capturedContext).toEqual({ test: 'context' });
    expect(result.custom).toBe(true);
    expect(result.result).toBeDefined();
  });

  test('handler return type is preserved', async () => {
    const factory = makeOperation((result: Result<number>) => {
      if (result.err !== undefined) {
        return { success: false, error: result.err.message };
      }
      return { success: true, value: result.res };
    });

    const result = await factory('ctx', 5)
      .step((value: number) => ok(value * 3))
      .complete();

    expect(result).toEqual({ success: true, value: 15 });
  });

  test('handler receives error result on failure', async () => {
    const factory = makeOperation((result: Result<any>) => {
      if (result.err !== undefined) {
        return { error: result.err.message };
      }
      return { value: result.res };
    });

    const result = await factory('ctx', 10)
      .step((value: number) => err('Something failed'))
      .complete();

    expect(result).toEqual({ error: 'Something failed' });
  });

  test('works with Hono-like context structure', async () => {
    interface HonoContext {
      json: (data: any, status?: number) => { body: any; status: number };
    }

    const honoFactory = makeOperation((result: Result<any>, context: { honoCtx: HonoContext }) => {
      if (result.err !== undefined) {
        return context.honoCtx.json({ error: result.err.message }, 500);
      }
      return context.honoCtx.json(result.res);
    });

    const mockHonoCtx: HonoContext = {
      json: (data, status = 200) => ({ body: data, status })
    };

    const result = await honoFactory({ honoCtx: mockHonoCtx }, 42)
      .step((value: number) => ok(value * 2))
      .complete();

    expect(result).toEqual({ body: 84, status: 200 });
  });

  test('works with Hono-like context on error', async () => {
    interface HonoContext {
      json: (data: any, status?: number) => { body: any; status: number };
    }

    const honoFactory = makeOperation((result: Result<any>, context: { honoCtx: HonoContext }) => {
      if (result.err !== undefined) {
        return context.honoCtx.json({ error: result.err.message }, 500);
      }
      return context.honoCtx.json(result.res);
    });

    const mockHonoCtx: HonoContext = {
      json: (data, status = 200) => ({ body: data, status })
    };

    const result = await honoFactory({ honoCtx: mockHonoCtx }, 42)
      .step((value: number) => err('Failed'))
      .complete();

    expect(result).toEqual({ body: { error: 'Failed' }, status: 500 });
  });

  test('chaining still works with makeOperation', async () => {
    interface TestContext {
      value: string;
    }

    const factory = makeOperation((result: Result<any>, context: TestContext) => {
      if (result.err !== undefined) return { error: true };
      return { value: result.res, context: context.value };
    });

    const result = await factory({ value: 'initial' }, 5)
      .step((value: number) => ok(value * 2))
      .context((ctx: TestContext, value: number) => ({ value: `${ctx.value}-${value}` }))
      .step((value: number) => ok(value + 1))
      .complete();

    expect(result.value).toBe(11);
    expect(result.context).toBe('initial-10');
  });

  test('failsWith works with makeOperation', async () => {
    class CustomError extends Error {
      constructor(message: string, cause?: Error) {
        super(message, { cause });
      }
    }

    const factory = makeOperation((result: Result<any, CustomError>) => {
      if (result.err !== undefined) {
        return { errorType: result.err.constructor.name, message: result.err.message };
      }
      return { value: result.res };
    });

    const result = await factory('ctx', 10)
      .failsWith(CustomError, 'Custom error occurred')
      .step((value: number) => err('Internal error'))
      .complete();

    expect(result).toEqual({ 
      errorType: 'CustomError', 
      message: 'Custom error occurred' 
    });
  });

  test('context is accessible in handler', async () => {
    interface AppContext {
      userId: string;
      requestId: string;
    }

    const factory = makeOperation((result: Result<any>, context: AppContext) => {
      return {
        userId: context.userId,
        requestId: context.requestId,
        result: result.err === undefined ? result.res : null,
        error: result.err?.message
      };
    });

    const result = await factory({ userId: 'user123', requestId: 'req456' }, 100)
      .step((value: number) => ok(value / 2))
      .complete();

    expect(result).toEqual({
      userId: 'user123',
      requestId: 'req456',
      result: 50,
      error: undefined
    });
  });

  test('factory with no initial values', async () => {
    const factory = makeOperation((result: Result<any>) => {
      if (result.err !== undefined) return { error: true };
      return { value: result.res };
    });

    const result = await factory()
      .step(() => ok(42))
      .complete();

    expect(result).toEqual({ value: 42 });
  });

  test('async steps work with custom handler', async () => {
    const factory = makeOperation((result: Result<any>) => {
      if (result.err !== undefined) return { error: true };
      return { value: result.res };
    });

    const result = await factory('ctx', 5)
      .step(async (value: number) => ok(value * 2))
      .step((value: number) => ok(value + 10))
      .step(async (value: number) => ok(value * 3))
      .complete();

    expect(result).toEqual({ value: 60 }); // ((5 * 2) + 10) * 3
  });

  test('context updates are visible in handler', async () => {
    const factory = makeOperation((result: Result<any>, context: any) => {
      return {
        finalContext: context,
        result: result.err === undefined ? result.res : null
      };
    });

    const result = await factory('initial', 10)
      .step((value: number) => ok(value * 2))
      .context((ctx: string, value: number) => `${ctx}-step1-${value}`)
      .step((value: number) => ok(value + 5))
      .context((ctx: string, value: number) => `${ctx}-step2-${value}`)
      .complete();

    expect(result).toEqual({
      finalContext: 'initial-step1-20-step2-25',
      result: 25
    });
  });

  test('factory creates independent operations', async () => {
    const factory = makeOperation((result: Result<any>) => {
      if (result.err !== undefined) return { error: true };
      return { value: result.res };
    });

    const result1 = await factory('ctx1', 10)
      .step((value: number) => ok(value * 2))
      .complete();

    const result2 = await factory('ctx2', 20)
      .step((value: number) => ok(value * 3))
      .complete();

    expect(result1).toEqual({ value: 20 });
    expect(result2).toEqual({ value: 60 });
  });
});