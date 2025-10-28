import { describe, it, expect } from 'bun:test';
import { ok, err, operation, trycatch, type Result } from '../src/index';

describe('README Examples', () => {
  describe('Result Pattern', () => {
    it('should handle success and errors without exceptions', () => {
      function divide(a: number, b: number): Result<number> {
        if (b === 0) return err('Division by zero');
        return ok(a / b);
      }

      const { res, err: error } = divide(10, 2);
      expect(error).toBeUndefined();
      expect(res).toBe(5);

      const { res: res2, err: error2 } = divide(10, 0);
      expect(error2).not.toBeUndefined();
      expect(res2).toBeUndefined();
    });
  });

  describe('Try-Catch Wrapper', () => {
    it('should wrap sync functions', () => {
      const result = trycatch(() => JSON.parse('{"name":"John"}'));
      if ('res' in result && 'err' in result) {
        expect(result.err).toBeUndefined();
        expect(result.res).toEqual({ name: 'John' });
      }
    });

    it('should wrap async functions', async () => {
      const { res, err } = await trycatch(async () => {
        // Mock fetch for testing
        const mockData = { data: 'test' };
        return mockData;
      });
      expect(err).toBeUndefined();
      expect(res).toEqual({ data: 'test' });
    });
  });

  describe('Basic Operation Usage', () => {
    it('should work with no initial context or value', async () => {
      const result = await operation()
        .step(() => ok(42))
        .step((value: number) => ok(value * 2))
        .complete();

      expect(result.err).toBeUndefined();
      expect(result.res).toBe(84);
    });

    it('should work with context and value', async () => {
      const resultWithContext = await operation({ userId: 'user123', requestId: 'req456' }, 10)
        .step((value: number) => ok(value * 2))
        .step((value: number) => ok(value + 1))
        .complete();

      expect(resultWithContext.err).toBeUndefined();
      expect(resultWithContext.res).toBe(21);
    });

    it('should work without context (uses undefined)', async () => {
      const simpleResult = await operation(undefined, 10)
        .step((value: number) => ok(value * 2))
        .complete();

      expect(simpleResult.err).toBeUndefined();
      expect(simpleResult.res).toBe(20);
    });
  });

  describe('Performance Optimization with Compilation', () => {
    it('should compile operations without initial arguments', async () => {
      // Provide an initial value for type inference
      const processNumber = operation<number>()
        .step((value: number) => ok(value * 2))
        .step((value: number) => ok(value + 1))
        .compile();

      const result1 = await processNumber(5);
      expect(result1.err).toBeUndefined();
      expect(result1.res).toBe(11);

      const result2 = await processNumber(10);
      expect(result2.err).toBeUndefined();
      expect(result2.res).toBe(21);
    });

    it('should work with compiled pipeline and initial context', async () => {
      const context = { requestId: 'req1' };
      const validateUser = (value: number) => ok(value);
      const processUser = (value: number) => ok(value * 2);

      const compiledFn = operation(context, 5)
        .step(validateUser)
        .step(processUser)
        .compile();

      const result = await compiledFn(5);
      expect(result.err).toBeUndefined();
      expect(result.res).toBe(10);
    });
  });

  describe('Fail-Fast Error Handling', () => {
    it('should stop on first error', async () => {
      const result = await operation({ operationId: 'op123' }, 5)
        .step((value: number) => ok(value * 2))
        .step((value: number) => err('Failed!'))
        .complete();

      expect(result.err).not.toBeUndefined();
      expect(result.err?.message).toBe('Failed!');
    });
  });

  describe('Context Management', () => {
    it('should transform context during pipeline', async () => {
      interface MyContext {
        userId: string;
        processed?: boolean;
      }

      const result = await operation({ userId: 'user123' }, 5)
        .step((value: number) => ok(value * 2))
        .context((ctx: MyContext, value: number) => ({ ...ctx, processed: true }))
        .step((value: number) => ok(value + 1))
        .complete();

      expect(result.err).toBeUndefined();
      expect(result.res).toBe(11);
    });
  });

  describe('Custom Error Types', () => {
    it('should apply custom error types', async () => {
      class ValidationError extends Error {
        constructor(message: string, options?: { cause?: Error }) {
          super(message, options);
          this.name = 'ValidationError';
        }
      }

      const result = await operation({ requestId: 'req123' }, 42)
        .failsWith(ValidationError, 'Validation failed')
        .step((value: number) => err(new Error('Invalid input')))
        .complete();

      expect(result.err).toBeInstanceOf(ValidationError);
      expect(result.err?.message).toBe('Validation failed');
      expect(result.err?.cause).toBeInstanceOf(Error);
    });

    it('should work with generic failsWith', async () => {
      const result = await operation({ requestId: 'req123' }, 42)
        .failsWith('Generic error')
        .step((value: number) => err(new Error('Something went wrong')))
        .complete();

      expect(result.err).toBeInstanceOf(Error);
      expect(result.err?.message).toBe('Generic error');
    });
  });

  describe('Async Operations', () => {
    it('should handle mixed sync and async operations', async () => {
      const result = await operation({ sessionId: 'sess456' }, 5)
        .step((value: number) => ok(value * 2))
        .step(async (value: number) => ok(value + 1))
        .step((value: number) => ok(value * 2))
        .complete();

      expect(result.err).toBeUndefined();
      expect(result.res).toBe(22); // (5 * 2 + 1) * 2
    });
  });

  describe('Type Safety', () => {
    it('should infer types throughout the chain', async () => {
      const result = await operation({ traceId: 'trace789' }, 42)
        .step((value: number) => ok(value.toString()))
        .step((value: string) => ok(value.length))
        .step((value: number) => ok(value > 0))
        .complete();

      expect(result.err).toBeUndefined();
      // result.res should be typed as boolean
      expect(result.res).toBe(true);
    });
  });
});
