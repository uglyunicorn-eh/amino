import { describe, test, expect } from 'bun:test';
import { operation } from '../src/operation.ts';

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
      .step((value, ctx) => ({ res: value + 1, err: undefined }));
    
    expect(op).toBeDefined();
  });
});
