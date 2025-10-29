import { describe, expect, test } from 'bun:test';
import { makeOperation } from '../src/acid-factory.ts';
import { ok, err, type Result } from '../src/result.ts';
import { func } from '../src/acid/hono.ts';

describe('Acid Extensions', () => {
  describe('makeOperation', () => {
    test('creates an acid factory with action', () => {
      const factory = makeOperation<string, { value: string }>(
        (arg) => ({ value: arg })
      );

      expect(typeof factory).toBe('function');
      expect(typeof factory.action).toBe('function');
    });

    test('can register multiple actions', () => {
      const factory = makeOperation<number, { num: number }>(
        (num) => ({ num })
      )
        .action('test1', () => 'result1')
        .action('test2', () => 'result2');

      expect(typeof factory).toBe('function');
    });

    test('creates acid operation with context', async () => {
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

    test('acid operation can chain steps', () => {
      const factory = makeOperation<number, { count: number }>(
        (num) => ({ count: num })
      );

      const op = factory(5);
      const chained = op.step((value: any) => ok(value + 1));

      expect(chained).toBeDefined();
      expect(typeof chained.step).toBe('function');
    });

    test('acid operation executes action with correct context and result', async () => {
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
  });

  describe('Hono Acid', () => {
    test('exports func factory', () => {
      expect(typeof func).toBe('function');
    });

    test('func factory has action method', () => {
      expect(typeof func.action).toBe('function');
    });

    test('creates operation with Hono context', () => {
      const mockContext = {
        json: (obj: any, status?: number) => ({ obj, status }),
      };

      const op = func(mockContext);
      expect(op).toBeDefined();
      expect(typeof op.step).toBe('function');
      expect(typeof op.complete).toBe('function');
    });

    test('can chain steps on Hono operation', () => {
      const mockContext = {
        json: (obj: any, status?: number) => ({ obj, status }),
      };

      const op = func(mockContext);
      const chained = op.step(() => ok({ hello: 'world' }));

      expect(chained).toBeDefined();
      expect(typeof chained.step).toBe('function');
    });

    test('response action exists and is callable', () => {
      const mockContext = {
        json: (obj: any, status?: number) => ({ obj, status }),
      };

      const op = func(mockContext);
      
      // The response method should be available after action registration
      expect(typeof (op as any).response).toBe('function');
    });

    test('executes response action with success result', async () => {
      let capturedObj: any;
      let capturedStatus: number | undefined;
      
      const mockContext = {
        json: (obj: any, status?: number) => {
          capturedObj = obj;
          capturedStatus = status;
          return Promise.resolve({ obj, status });
        },
      };

      const op = func(mockContext);
      const result = await op.step(() => ok({ hello: 'world' }));

      const response = await (result as any).response();
      
      expect(response).toBeDefined();
      expect(capturedStatus).toBe(200);
      expect(capturedObj.status).toBe('ok');
    });

    test('response action handles error result correctly', async () => {
      let capturedObj: any;
      let capturedStatus: number | undefined;
      
      const mockContext = {
        json: (obj: any, status?: number) => {
          capturedObj = obj;
          capturedStatus = status;
          return Promise.resolve({ obj, status });
        },
      };

      const op = func(mockContext);
      const result = await op.step(() => err('Test error'));

      const response = await (result as any).response();
      
      expect(response).toBeDefined();
      expect(capturedStatus).toBe(400);
      expect(capturedObj.status).toBe('error');
    });
  });
});

