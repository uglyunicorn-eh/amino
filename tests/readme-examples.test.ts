import { describe, it, expect } from 'bun:test';
import { ok, err, trycatch, instruction, type Result } from '../src/index';

describe('README Examples', () => {
  describe('Result Pattern', () => {
    it('should handle success and errors without exceptions', () => {
      const { res, err: error } = ok(42);
      expect(error).toBeUndefined();
      expect(res).toBe(42);
    });

    it('should wrap sync functions in Result', () => {
      const result1 = trycatch(() => JSON.parse('{"name":"John"}'));
      if ('err' in result1 && 'res' in result1) {
        expect(result1.err).toBeUndefined();
        expect(result1.res).toEqual({ name: 'John' });
      }
    });

    it('should wrap async functions in AsyncResult', async () => {
      const result2 = await trycatch(async () => {
        // Mock async operation
        return { data: 'test' };
      });
      expect(result2.err).toBeUndefined();
      expect(result2.res).toEqual({ data: 'test' });
    });
  });

  describe('Instruction Pipeline - Basic Usage', () => {
    it('should work without context', async () => {
      const instr = instruction<number>()
        .step(async (v: number) => ok(v * 2))
        .step(async (v: number) => ok(v + 1));

      const result = await instr.run(5);
      expect(result.res).toBe(11);
    });

    it('should work with context', async () => {
      const instr2 = instruction<number, { base: number }>({ base: 10 })
        .step(async (v: number, ctx) => ok(v + ctx.base));

      const result2 = await instr2.run(5);
      expect(result2.res).toBe(15);
    });
  });

  describe('Instruction Pipeline - Features', () => {
    it('should transform values with steps', async () => {
      const instr = instruction<number>()
        .step(async (v: number) => ok(v * 2))
        .step(async (v: number) => ok(v.toString()));

      const result = await instr.run(5);
      expect(result.res).toBe('10');
    });

    it('should transform context', async () => {
      const instr = instruction<number, { count: number }>({ count: 0 })
        .context((ctx, v) => ({ ...ctx, count: ctx.count + v }));

      const result = await instr.run(5);
      expect(result.res).toBe(5);
      // Context transformation doesn't change the value, just the context
    });

    it('should validate with assertions', async () => {
      const instr = instruction<number>()
        .step(async (v: number) => ok(v * 2))
        .assert((v: number) => v > 0, 'Value must be positive');

      const result = await instr.run(5);
      expect(result.res).toBe(10);
      expect(result.err).toBeUndefined();
    });

    it('should fail assertion when validation fails', async () => {
      const instr = instruction<number>()
        .step(async (v: number) => ok(v * 2))
        .assert((v: number) => v < 0, 'Value must be negative');

      const result = await instr.run(5);
      expect(result.err).toBeDefined();
      expect(result.res).toBeUndefined();
    });

    it('should transform errors with failsWith', async () => {
      class CustomError extends Error {
        constructor(message: string, options?: { cause?: Error }) {
          super(message, options);
        }
      }

      const instr = instruction<number>()
        .failsWith(CustomError, 'Operation failed')
        .step<number, Error>(async (v: number) => err(new Error('Step failed')));

      const result = await instr.run(5);
      expect(result.err).toBeInstanceOf(CustomError);
      expect(result.err?.message).toBe('Operation failed');
    });

    it('should transform result with useResult', async () => {
      const instr = instruction<number>()
        .step(async (v: number) => ok(v * 2));

      const result = await instr.useResult((res) => {
        if (res.err) throw res.err;
        return res.res!.toString();
      }, 5);
      
      expect(result).toBe('10');
      expect(typeof result).toBe('string');
    });

    it('should work with useResult and undefined initial value', async () => {
      const instr2 = instruction<undefined, { base: number }>({ base: 0 })
        .step(async () => ok(42));

      const result2 = await instr2.useResult((res) => {
        if (res.err) throw res.err;
        return res.res!;
      });
      
      expect(result2).toBe(42);
      expect(typeof result2).toBe('number');
    });

    it('should compile pipeline for better performance', async () => {
      const compiled = instruction<number, { base: number }>({ base: 10 })
        .step(async (v, ctx) => ok(v + ctx.base))
        .compile();

      const result = await compiled(5);
      expect(result.res).toBe(15);
    });
  });
});
