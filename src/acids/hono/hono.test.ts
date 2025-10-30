import { describe, expect, test } from 'bun:test';
import { func } from './index.ts';
import { ok, err } from '../../result.ts';
import type { Context } from 'hono';

describe('Hono Extension', () => {
  test('exports func factory', () => {
    expect(typeof func).toBe('function');
  });

  test('func is callable factory', () => {
    expect(typeof func).toBe('function');
  });

  test('creates operation with Hono context', () => {
    const mockContext = {
      json: (obj: unknown, status?: number) => new Response(JSON.stringify(obj), { status }),
    } as Context;

    const op = func(mockContext);
    expect(op).toBeDefined();
    expect(typeof op.step).toBe('function');
    expect(typeof op.complete).toBe('function');
  });

  test('can chain steps on Hono operation', () => {
    const mockContext = {
      json: (obj: unknown, status?: number) => new Response(JSON.stringify(obj), { status }),
    } as Context;

    const op = func(mockContext);
    const chained = op.step(() => ok({ hello: 'world' }));

    expect(chained).toBeDefined();
    expect(typeof chained.step).toBe('function');
  });

  test('response action exists and is callable', () => {
    const mockContext = {
      json: (obj: unknown, status?: number) => new Response(JSON.stringify(obj), { status }),
    } as Context;

    const op = func(mockContext);
    
    // The response method should be available after action registration
    expect(typeof op.response).toBe('function');
  });

  test('executes response action with success result', async () => {
    let capturedObj: unknown;
    let capturedStatus: number | undefined;
    
    const mockContext = {
      json: (obj: unknown, status?: number) => {
        capturedObj = obj;
        capturedStatus = status;
        return new Response(JSON.stringify(obj), { status });
      },
    } as Context;

    const op = func(mockContext);
    const result = op.step(() => ok({ hello: 'world' }));

    const response = await result.response();
    
    expect(response).toBeDefined();
    expect(capturedStatus).toBe(200);
    expect(capturedObj).toEqual({ hello: 'world' });
  });

  test('response action handles error result correctly', async () => {
    let capturedObj: unknown;
    let capturedStatus: number | undefined;
    
    const mockContext = {
      json: (obj: unknown, status?: number) => {
        capturedObj = obj;
        capturedStatus = status;
        return new Response(JSON.stringify(obj), { status });
      },
    } as Context;

    const op = func(mockContext);
    const result = op.step(() => err('Test error'));

    const response = await result.response();
    
    expect(response).toBeDefined();
    expect(capturedStatus).toBe(400);
    expect(capturedObj).toEqual({ error: 'Test error' });
  });
});

