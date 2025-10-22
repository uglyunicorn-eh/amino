import { describe, test, expect } from 'bun:test';
import { ok, err, type Result } from '../src/index.ts';

describe('Result Pattern', () => {
  describe('ok() - Success results', () => {
    test('creates success result', () => {
      const result = ok('hello');
      
      expect(result.res).toBe('hello');
      expect(result.err).toBeUndefined();
    });

    test('creates success result with complex object', () => {
      const obj = { name: 'test', value: 123 };
      const result = ok(obj);
      
      expect(result.res).toEqual(obj);
      expect(result.err).toBeUndefined();
    });
  });

  describe('err() - Fail results', () => {
    test('creates fail result with Error instance', () => {
      const error = new Error('Something went wrong');
      const result = err(error);
      
      expect(result.res).toBeUndefined();
      expect(result.err).toBe(error);
      expect(result.err.message).toBe('Something went wrong');
    });

    test('creates fail result with string (auto-wrapped)', () => {
      const result = err('Something failed');
      
      expect(result.res).toBeUndefined();
      expect(result.err).toBeInstanceOf(Error);
      expect(result.err.message).toBe('Something failed');
    });
  });

  describe('Type narrowing', () => {
    test('narrows to Success type when err is undefined', () => {
      const result: Result<string> = ok('success');
      
      if (result.err === undefined) {
        const value: string = result.res;
        expect(value).toBe('success');
      }
    });

    test('narrows to Fail type when err is defined', () => {
      const result: Result<string> = err('failure');
      
      if (result.err !== undefined) {
        const error: Error = result.err;
        expect(error.message).toBe('failure');
        expect(result.res).toBeUndefined();
      }
    });
  });

  describe('Practical usage', () => {
    test('function returning Result', () => {
      function divide(a: number, b: number): Result<number> {
        if (b === 0) {
          return err('Division by zero');
        }
        return ok(a / b);
      }

      const success = divide(10, 2);
      if (success.err === undefined) {
        expect(success.res).toBe(5);
      }

      const failure = divide(10, 0);
      if (failure.err !== undefined) {
        expect(failure.err.message).toBe('Division by zero');
      }
    });
  });
});
