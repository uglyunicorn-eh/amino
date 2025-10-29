import { describe, expect, test } from 'bun:test';
import { func } from '../src/acid/hono.ts';
import { ok, err } from '../src/result.ts';

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

