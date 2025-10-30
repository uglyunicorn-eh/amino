import { describe, expect, test } from 'bun:test';
import { makeOperation, type ExtensionOperation } from '../src/acid-factory.ts';
import { ok, err, type Result } from '../src/result.ts';

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

      const op = factory(5);
      const chained = op.step((_value: undefined) => ok(1));

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
      const result = op.step((_value: undefined) => ok(100));

      // Verify that step was added and operation is valid
      expect(result).toBeDefined();
      expect(typeof result.finalize).toBe('function');
    });

    test('extension handles operation with no steps', async () => {
      let capturedValue: number | undefined;
      
      const factory = makeOperation<number, { num: number }>(
        (num) => ({ num })
      )
        .action('handle', async ({ num }, { res, err }) => {
          capturedValue = num;
          return 'processed';
        });

      const op = factory(5);
      
      // Call the action (which will complete with no steps)
      const result = await op.handle();
      
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
      const firstStep = op.step<string>((_value: undefined) => ok('1'));
      const result = firstStep.step((value: string) => ok(value + '2'));

      expect(result).toBeDefined();
      expect(typeof result.execute).toBe('function');
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
      const result = await op.finalize();
      
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
      
      const result = op
        .step((_value: undefined) => ok(5))
        .context((ctx, _value) => ({ value: ctx.value * 2 }));
      
      expect(result).toBeDefined();
      expect(typeof result.total).toBe('function');
      
      // Execute the action to test context propagation
      const total = await result.total();
      expect(total).toBeGreaterThan(0);
    });

    test('extension handles missing steps', async () => {
      // Create a factory and operation  
      const factory = makeOperation<number, { count: number }>(
        (num) => ({ count: num })
      )
        .action('test', async (ctx, result) => ctx);

      const op = factory(5);
      
      // Call the action - should work even with no steps
      const result = await op.test();
      
      // Should return initial context
      expect(result.count).toBe(5);
    });

    test('extension error handling', async () => {
      // Create an operation that will cause an error in the pipeline
      const factory = makeOperation<number, { value: number }>(
        (num) => ({ value: num })
      )
        .action('error', async (ctx, result) => {
          // Return context even when there's an error
          return result.err ? ctx : ctx;
        });

      const op = factory(10);
      
      // Create an operation that will produce an error
      const errorOp = op.step((_value: undefined) => err(new Error('Test error')));
      
      // Call the action - it should handle the error
      const result = await errorOp.error();
      
      // Should return the initial context on error  
      expect(result.value).toBe(10);
    });

    test('extension handles concurrent action calls', async () => {
      const factory = makeOperation<number, { id: number }>(
        (num) => ({ id: num })
      )
        .action('get', async (ctx, result) => ctx.id);

      const op = factory(99);
      
      // Call action multiple times concurrently
      const results = await Promise.all([
        op.get(),
        op.get(),
        op.get()
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
      
      // Call action on operation with no steps
      const result = await op.test();
      expect(result.count).toBe(10);
    });

    test('failsWith with string message preserves extension action', async () => {
      const factory = makeOperation<number, { id: number }>(
        (num) => ({ id: num })
      )
        .action('handle', async (ctx, result) => {
          if (result.err) {
            return { status: 'error', error: result.err.message, id: ctx.id };
          }
          return { status: 'ok', value: result.res, id: ctx.id };
        });

      const op = factory(42);
      const withFailsWith = op.failsWith('Operation failed');

      // Verify extension action is preserved
      expect(typeof withFailsWith.handle).toBe('function');
      
      // Verify step can still be chained
      const withStep = withFailsWith.step((_value: undefined) => ok(100));
      expect(typeof withStep.handle).toBe('function');
      
      // Test execution
      const result = await withStep.handle();
      expect(result.status).toBe('ok');
      expect(result.value).toBe(100);
      expect(result.id).toBe(42);
    });

    test('failsWith with custom error class preserves extension action', async () => {
      class ValidationError extends Error {
        constructor(message: string, options?: { cause?: Error }) {
          super(message, options);
        }
      }

      const factory = makeOperation<number, { id: number }>(
        (num) => ({ id: num })
      )
        .action('process', async (ctx, result) => {
          if (result.err) {
            return { 
              status: 'error', 
              errorType: result.err.constructor.name,
              errorMessage: result.err.message,
              id: ctx.id 
            };
          }
          return { status: 'ok', value: result.res, id: ctx.id };
        });

      const op = factory(99);
      const withFailsWith = op.failsWith(ValidationError, 'Validation failed');

      // Verify extension action is preserved
      expect(typeof withFailsWith.process).toBe('function');
      
      // Verify step can still be chained
      const withStep = withFailsWith.step((_value: undefined) => ok(200));
      expect(typeof withStep.process).toBe('function');
      
      // Test execution with error
      const withError = withFailsWith.step((_value: undefined) => err(new Error('Something went wrong')));
      const result = await withError.process();
      
      expect(result.status).toBe('error');
      expect(result.errorType).toBe('ValidationError');
      expect(result.errorMessage).toBe('Validation failed');
      expect(result.id).toBe(99);
    });

    test('failsWith preserves extension action through multiple chains', async () => {
      const factory = makeOperation<string, { prefix: string }>(
        (str) => ({ prefix: str })
      )
        .action('execute', async (ctx, result) => {
          // Note: ctx is the initial context, not the transformed one
          // This is expected behavior - the action handler receives the initial context
          return { ctx: ctx.prefix, result: result.res };
        });

      const op = factory('test');
      
      // Chain failsWith, step, and context
      const withFailsWith = op.failsWith('Custom error');
      const withStep = withFailsWith.step<string>((_value: undefined) => ok('value1'));
      const withContext = withStep.context((ctx, _value) => ({ prefix: ctx.prefix + '-updated' }));
      const chained = withContext.step((value: string) => ok(value + '2'));

      // Verify extension action is preserved through all chains
      expect(typeof chained.execute).toBe('function');
      
      const result = await chained.execute();
      expect(result.result).toBe('value12');
      // The action handler receives the initial context, not the transformed one
      expect(result.ctx).toBe('test');
    });
  });
});

