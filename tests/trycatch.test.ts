import { describe, test, expect } from 'bun:test';
import { trycatch } from '../src/index.ts';

describe('trycatch', () => {
  describe('Synchronous', () => {
    test('returns ok for successful function', () => {
      const result = trycatch(() => 42);
      
      expect(result.err).toBeUndefined();
      if (result.err === undefined) {
        expect(result.res).toBe(42);
      }
    });

    test('returns err when function throws Error', () => {
      const error = new Error('Failed');
      const result = trycatch(() => {
        throw error;
      });
      
      expect(result.err).toBe(error);
      expect(result.res).toBeUndefined();
    });

    test('returns err when function throws non-Error', () => {
      const result = trycatch(() => {
        throw 'string error';
      });
      
      expect(result.res).toBeUndefined();
      if (result.err !== undefined) {
        expect(result.err).toBeInstanceOf(Error);
        expect(result.err.message).toBe('string error');
      }
    });
  });

  describe('Asynchronous', () => {
    test('returns ok for resolved promise', async () => {
      const result = await trycatch(async () => 42);
      
      expect(result.err).toBeUndefined();
      if (result.err === undefined) {
        expect(result.res).toBe(42);
      }
    });

    test('returns err when promise rejects with Error', async () => {
      const error = new Error('Async failed');
      const result = await trycatch(async () => {
        throw error;
      });
      
      expect(result.err).toBe(error);
      expect(result.res).toBeUndefined();
    });

    test('returns err when promise rejects with non-Error', async () => {
      const result = await trycatch(async () => {
        throw 404;
      });
      
      expect(result.res).toBeUndefined();
      if (result.err !== undefined) {
        expect(result.err).toBeInstanceOf(Error);
        expect(result.err.message).toBe('404');
      }
    });
  });
});
