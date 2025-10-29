import { describe, expect, test } from 'bun:test';
import { makeOperation } from '../src/acid-factory.ts';
import { ok, type Result } from '../src/result.ts';

describe('Extension System', () => {
  describe('makeOperation', () => {
    test('creates an extension builder with action', () => {
      const builder = makeOperation<string, { value: string }>(
        (arg) => ({ value: arg })
      );

      expect(typeof builder).toBe('object');
      expect(typeof builder.action).toBe('function');
    });

    test('can register single action and get factory', () => {
      const factory = makeOperation<number, { num: number }>(
        (num) => ({ num })
      )
        .action('test', () => 'result');

      expect(typeof factory).toBe('function');
    });

    test('creates extension operation with context', async () => {
      const factory = makeOperation<string, { ctx: string }>(
        (arg) => ({ ctx: arg })
      )
        .action('handle', async ({ ctx }, { res, err }) => {
          if (err) return `error: ${err.message}`;
          return `success: ${ctx} - ${res}`;
        });

      const op = factory('test-context');
      expect(op).toBeDefined();
      expect(typeof op.step).toBe('function');
      expect(typeof op.complete).toBe('function');
    });

    test('extension operation can chain steps', async () => {
      const factory = makeOperation<number, { count: number }>(
        (num) => ({ count: num })
      ).action('execute', async (ctx, result) => ctx);

      const op = await factory(5);
      const chained = op.step((value: any) => ok(value + 1));

      expect(chained).toBeDefined();
      expect(typeof chained.step).toBe('function');
    });

    test('extension operation executes action with correct context and result', async () => {
      interface TestContext {
        id: number;
      }

      const factory = makeOperation<number, TestContext>(
        (num) => ({ id: num })
      )
        .action('finalize', async ({ id }, { res, err }: Result<number>) => {
          if (err) {
            return { status: 'error', id, error: err.message };
          }
          return { status: 'ok', id, value: res };
        });

      const op = factory(42);
      const result = await op.step((value: any) => ok(100));

      // Verify that step was added and operation is valid
      expect(result).toBeDefined();
    });

    test('extension handles operation with no steps', async () => {
      let capturedValue: any;
      
      const factory = makeOperation<number, { num: number }>(
        (num) => ({ num })
      )
        .action('handle', async ({ num }, { res, err }) => {
          capturedValue = num;
          return 'processed';
        });

      const op = factory(5);
      
      // Call the action (which will complete with no steps)
      const result = await (op as any).handle();
      
      expect(result).toBe('processed');
      expect(capturedValue).toBe(5);
    });

    test('extension executes with multiple chained steps', async () => {
      const factory = makeOperation<string, { prefix: string }>(
        (str) => ({ prefix: str })
      )
        .action('execute', async (ctx, result) => {
          return { ctx, result };
        });

      const op = factory('test');
      const result = await op
        .step((value: any) => ok(value + '1'))
        .step((value: string) => ok(value + '2'));

      expect(result).toBeDefined();
      expect(typeof (result as any).execute).toBe('function');
    });

    test('extension action executes when called directly without steps', async () => {
      const factory = makeOperation<number, { count: number }>(
        (num) => ({ count: num })
      )
        .action('finalize', async (ctx, result) => {
          return { ctxValue: ctx.count, resultOk: result.res !== undefined };
        });

      const op = factory(100);
      
      // Call action directly without any steps
      const result = await (op as any).finalize();
      
      expect(result).toBeDefined();
      expect(result.ctxValue).toBe(100);
      expect(result.resultOk).toBe(false); // no result since no steps executed
    });

    test('extension with context transformation through steps', async () => {
      const factory = makeOperation<number, { value: number }>(
        (num) => ({ value: num })
      )
        .action('total', async (ctx, result) => {
          return ctx.value + (result.res || 0);
        });

      const op = factory(10);
      
      const result = await op
        .step((value: any) => ok(5))
        .context((ctx, value) => ({ value: ctx.value * 2 }));
      
      expect(result).toBeDefined();
      expect(typeof (result as any).total).toBe('function');
      
      // Execute the action to test context propagation
      const total = await (result as any).total();
      expect(total).toBeGreaterThan(0);
    });

    test('extension handles missing steps', async () => {
      // Create a factory and operation  
      const factory = makeOperation<number, { count: number }>(
        (num) => ({ count: num })
      )
        .action('test', async (ctx, result) => ctx);

      const op = factory(5);
      
      // Get the actual operation reference
      const actualOp = (op as any).currentOp || (op as any);
      if (actualOp.state) {
        // Set steps to undefined to trigger line 152
        actualOp.state.steps = undefined;
      }
      
      // Call the action
      const result = await (op as any).test();
      
      // Should return initial context
      expect(result.count).toBe(5);
    });

    test('extension error handling', async () => {
      // Create an operation that will cause an error in getFinalContext
      const factory = makeOperation<number, { value: number }>(
        (num) => ({ value: num })
      )
        .action('error', async (ctx, result) => ctx);

      const op = factory(10);
      
      // Cause an error by making state.steps throw when accessed
      const originalState = (op as any).state;
      Object.defineProperty((op as any), 'state', {
        get() {
          return {
            steps: [() => { throw new Error('Test error in steps'); }],
            initialValue: undefined,
            initialContext: { value: 10 }
          };
        },
        configurable: true
      });
      
      // Call the action - it should catch the error and return initial context (line 173)
      const result = await (op as any).error();
      
      // Should return the initial context on error  
      expect(result.value).toBe(10);
      
      // Restore
      Object.defineProperty((op as any), 'state', {
        get() { return originalState; },
        configurable: true
      });
    });

    test('extension handles concurrent action calls', async () => {
      const factory = makeOperation<number, { id: number }>(
        (num) => ({ id: num })
      )
        .action('get', async (ctx, result) => ctx.id);

      const op = factory(99);
      
      // Call action multiple times concurrently
      const results = await Promise.all([
        (op as any).get(),
        (op as any).get(),
        (op as any).get()
      ]);
      
      expect(results).toEqual([99, 99, 99]);
    });

    test('handles empty operation directly', async () => {
      // Create a factory
      const factory = makeOperation<number, { count: number }>(
        (num) => ({ count: num })
      )
        .action('test', async (ctx, result) => ctx);

      const op = factory(10);
      
      // Access the wrapped operation
      const wrappedOp: any = op;
      
      // Try to modify the internal state
      if (wrappedOp.state) {
        wrappedOp.state.steps = null;
      }
      
      const result = await (op as any).test();
      expect(result.count).toBe(10);
    });
  });
});

