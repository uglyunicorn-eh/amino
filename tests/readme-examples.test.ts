import { describe, it, expect } from 'bun:test';
import { ok, err, trycatch, type Result } from '../src/index';

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

  // Operation tests removed - operation will be rebuilt from scratch
});
