import { describe, expect, test } from 'bun:test';
import { instruction } from '../src/instruction.ts';
import { ok, err, type Result } from '../src/result.ts';

describe('Instruction Pipeline', () => {
  test('can mix step, context, assert, and failsWith methods', () => {
    class CustomError extends Error {
      constructor(message: string, options?: { cause?: Error }) {
        super(message, options);
      }
    }

    const instr = instruction<number, { base: number }>({ base: 0 })
      .step(async (v: number, ctx: { base: number }) => ok(ctx.base + v))
      .assert((v: number) => v !== 0, 'Result cannot be zero')
      .context((ctx: { base: number }, v: number) => ({ ...ctx, base: ctx.base + v }))
      .failsWith(CustomError, 'Step failed')
      .step(async (v: number, ctx: { base: number }) => ok(ctx.base / v));

    expect(instr).toBeDefined();
    expect(typeof instr.step).toBe('function');
    expect(typeof instr.context).toBe('function');
    expect(typeof instr.assert).toBe('function');
    expect(typeof instr.failsWith).toBe('function');
  });

  test('run method executes pipeline successfully', async () => {
    const initialContext = { base: 0 };
    const instr = instruction<number, { base: number }>(initialContext)
      .step(async (v: number, ctx: { base: number }) => ok(ctx.base + v))
      .step(async (v: number) => ok(v * 2));

    const result = await instr.run(5);

    expect(result.err).toBeUndefined();
    expect(result.res).toBe(10); // (0 + 5) * 2
  });

  test('run method uses initial context', async () => {
    const initialContext = { base: 3 };
    const instr = instruction<number, { base: number }>(initialContext)
      .step(async (v: number, ctx: { base: number }) => ok(ctx.base + v));

    const result = await instr.run(5);

    expect(result.err).toBeUndefined();
    expect(result.res).toBe(8); // 3 + 5
  });

  test('compile method returns executable function', async () => {
    const initialContext = { base: 0 };
    const instr = instruction<number, { base: number }>(initialContext)
      .step(async (v: number, ctx: { base: number }) => ok(ctx.base + v))
      .step(async (v: number) => ok(v * 2));

    const compiled = instr.compile();
    const result = await compiled(5);

    expect(result.err).toBeUndefined();
    expect(result.res).toBe(10); // (0 + 5) * 2
  });

  test('compile method with context override', async () => {
    const initialContext = { base: 0 };
    const instr = instruction<number, { base: number }>(initialContext)
      .step(async (v: number, ctx: { base: number }) => ok(ctx.base + v));

    const overrideContext = { base: 3 };
    const compiled = instr.compile(overrideContext);
    const result = await compiled(5);

    expect(result.err).toBeUndefined();
    expect(result.res).toBe(8); // 3 + 5 (uses override context)
  });

  test('context transformation updates context', async () => {
    const initialContext = { base: 0 };
    const instr = instruction<number, { base: number }>(initialContext)
      .step(async (v: number, ctx: { base: number }) => ok(ctx.base + v))
      .context((ctx: { base: number }, v: number) => ({ ...ctx, base: ctx.base + v }))
      .step(async (v: number, ctx: { base: number }) => ok(ctx.base / v));

    const result = await instr.run(5);

    expect(result.err).toBeUndefined();
    expect(result.res).toBe(1); // (0 + 5) / 5 = 1
  });

  test('assert passes validation', async () => {
    const initialContext = { base: 0 };
    const instr = instruction<number, { base: number }>(initialContext)
      .step(async (v: number) => ok(v * 2))
      .assert((v: number) => v !== 0, 'Value cannot be zero')
      .step(async (v: number) => ok(v + 1));

    const result = await instr.run(5);

    expect(result.err).toBeUndefined();
    expect(result.res).toBe(11); // (5 * 2) + 1
  });

  test('assert fails validation and stops pipeline', async () => {
    const initialContext = { base: 0 };
    const instr = instruction<number, { base: number }>(initialContext)
      .step(async (v: number) => ok(v * 2))
      .assert((v: number) => v === 0, 'Value must be zero')
      .step(async (v: number) => ok(v + 1)); // Should not execute

    const result = await instr.run(5);

    expect(result.err).toBeDefined();
    expect(result.err?.message).toBe('Value must be zero');
    expect(result.res).toBeUndefined();
  });

  test('assert with custom message', async () => {
    const initialContext = { base: 0 };
    const instr = instruction<number, { base: number }>(initialContext)
      .step(async (v: number) => ok(v))
      .assert((v: number) => v < 0, 'Value must be negative');

    const result = await instr.run(5);

    expect(result.err).toBeDefined();
    expect(result.err?.message).toBe('Value must be negative');
  });

  test('failsWith transforms error with custom error class', async () => {
    class ValidationError extends Error {
      constructor(message: string, options?: { cause?: Error }) {
        super(message, options);
      }
    }

    const initialContext = { base: 0 };
    const instr = instruction<number, { base: number }>(initialContext)
      .failsWith(ValidationError, 'Validation failed')
      .step(async (v: number) => err(new Error('Step failed')));

    const result = await instr.run(5);

    expect(result.err).toBeDefined();
    expect(result.err).toBeInstanceOf(ValidationError);
    expect(result.err?.message).toBe('Validation failed');
    expect(result.err?.cause instanceof Error ? result.err.cause.message : undefined).toBe('Step failed');
  });

  test('failsWith transforms error with generic error', async () => {
    const initialContext = { base: 0 };
    const instr = instruction<number, { base: number }>(initialContext)
      .failsWith('Operation failed')
      .step(async (v: number) => err(new Error('Step failed')));

    const result = await instr.run(5);

    expect(result.err).toBeDefined();
    expect(result.err).toBeInstanceOf(Error);
    expect(result.err?.message).toBe('Operation failed');
    expect(result.err?.cause instanceof Error ? result.err.cause.message : undefined).toBe('Step failed');
  });

  test('pipeline fails fast on first error', async () => {
    let step2Executed = false;
    let step3Executed = false;

    const initialContext = { base: 0 };
    const instr = instruction<number, { base: number }>(initialContext)
      .step(async (v: number) => err(new Error('Step 1 failed')))
      .step(async () => {
        step2Executed = true;
        return ok(10);
      })
      .step(async () => {
        step3Executed = true;
        return ok(20);
      });

    const result = await instr.run(5);

    expect(result.err).toBeDefined();
    expect(result.err?.message).toBe('Step 1 failed');
    expect(step2Executed).toBe(false);
    expect(step3Executed).toBe(false);
  });

  test('pipeline fails fast on assertion failure', async () => {
    let step2Executed = false;

    const initialContext = { base: 0 };
    const instr = instruction<number, { base: number }>(initialContext)
      .step(async (v: number) => ok(v * 2))
      .assert((v: number) => v === 0, 'Value must be zero')
      .step(async () => {
        step2Executed = true;
        return ok(10);
      });

    const result = await instr.run(5);

    expect(result.err).toBeDefined();
    expect(step2Executed).toBe(false);
  });

  test('supports async step functions', async () => {
    const initialContext = { base: 0 };
    const instr = instruction<number, { base: number }>(initialContext)
      .step(async (v: number) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return ok(v * 2);
      })
      .step(async (v: number) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return ok(v + 1);
      });

    const result = await instr.run(5);

    expect(result.err).toBeUndefined();
    expect(result.res).toBe(11); // (5 * 2) + 1
  });

  test('supports sync step functions', async () => {
    const initialContext = { base: 0 };
    const instr = instruction<number, { base: number }>(initialContext)
      .step((v: number) => ok(v * 2))
      .step((v: number) => ok(v + 1));

    const result = await instr.run(5);

    expect(result.err).toBeUndefined();
    expect(result.res).toBe(11); // (5 * 2) + 1
  });

  test('supports mixed sync and async steps', async () => {
    const initialContext = { base: 0 };
    const instr = instruction<number, { base: number }>(initialContext)
      .step((v: number) => ok(v * 2))
      .step(async (v: number) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return ok(v + 1);
      })
      .step((v: number) => ok(v * 2));

    const result = await instr.run(5);

    expect(result.err).toBeUndefined();
    expect(result.res).toBe(22); // ((5 * 2) + 1) * 2
  });

  test('supports async context transformation', async () => {
    const initialContext = { base: 0 };
    const instr = instruction<number, { base: number }>(initialContext)
      .step(async (v: number) => ok(v))
      .context(async (ctx: { base: number }, v: number) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return { ...ctx, base: ctx.base + v };
      })
      .step(async (v: number, ctx: { base: number }) => ok(ctx.base + v));

    const result = await instr.run(5);

    expect(result.err).toBeUndefined();
    expect(result.res).toBe(10); // (0 + 5) + 5
  });

  test('supports async assertions', async () => {
    const initialContext = { base: 0 };
    const instr = instruction<number, { base: number }>(initialContext)
      .step(async (v: number) => ok(v))
      .assert(async (v: number) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return v > 0;
      }, 'Value must be positive');

    const result = await instr.run(5);

    expect(result.err).toBeUndefined();
    expect(result.res).toBe(5);
  });

  test('type inference through chain', async () => {
    const initialContext = { base: 0 };
    const instr = instruction<number, { base: number }>(initialContext)
      .step(async (v: number) => ok(v.toString())) // number -> string
      .step(async (v: string) => ok(v.length)) // string -> number
      .step(async (v: number) => ok(v > 0)); // number -> boolean

    const result = await instr.run(42);

    expect(result.err).toBeUndefined();
    expect(result.res).toBe(true); // "42".length === 2, 2 > 0 === true
  });

  test('immutability: branching from base instruction', async () => {
    const initialContext = { base: 0 };
    const baseInstr = instruction<number, { base: number }>(initialContext)
      .step(async (v: number) => ok(v * 2));

    const instr1 = baseInstr.step(async (v: number) => ok(v + 1));
    const instr2 = baseInstr.step(async (v: number) => ok(v - 1));

    const result1 = await instr1.run(5);
    const result2 = await instr2.run(5);

    // Base instruction should still work with original steps
    const baseResult = await baseInstr.run(5);

    expect(result1.err).toBeUndefined();
    expect(result1.res).toBe(11); // (5 * 2) + 1

    expect(result2.err).toBeUndefined();
    expect(result2.res).toBe(9); // (5 * 2) - 1

    expect(baseResult.err).toBeUndefined();
    expect(baseResult.res).toBe(10); // 5 * 2
  });

  test('immutability: context changes in branches do not affect base', async () => {
    const initialContext = { base: 0 };
    const baseInstr = instruction<number, { base: number }>(initialContext);

    // Create branches with context transformation BEFORE the step
    const instr1 = baseInstr
      .context((ctx: { base: number }) => ({ ...ctx, base: 3 }))
      .step(async (v: number, ctx: { base: number }) => ok(ctx.base + v));
    
    const instr2 = baseInstr
      .context((ctx: { base: number }) => ({ ...ctx, base: 5 }))
      .step(async (v: number, ctx: { base: number }) => ok(ctx.base + v));

    // Base instruction with step but no context transformation
    const baseInstrWithStep = baseInstr
      .step(async (v: number, ctx: { base: number }) => ok(ctx.base + v));

    const baseResult = await baseInstrWithStep.run(5);
    const result1 = await instr1.run(5);
    const result2 = await instr2.run(5);

    expect(baseResult.err).toBeUndefined();
    expect(baseResult.res).toBe(5); // 0 + 5

    expect(result1.err).toBeUndefined();
    expect(result1.res).toBe(8); // 3 + 5

    expect(result2.err).toBeUndefined();
    expect(result2.res).toBe(10); // 5 + 5
  });

  test('handles errors thrown in steps', async () => {
    const initialContext = { base: 0 };
    const instr = instruction<number, { base: number }>(initialContext)
      .step(async (v: number) => {
        throw new Error('Step threw error');
      });

    const result = await instr.run(5);

    expect(result.err).toBeDefined();
    expect(result.err?.message).toBe('Step threw error');
  });

  test('handles non-Error exceptions', async () => {
    const initialContext = { base: 0 };
    const instr = instruction<number, { base: number }>(initialContext)
      .step(async (v: number) => {
        throw new Error('String error');
      });

    const result = await instr.run(5);

    expect(result.err).toBeDefined();
    expect(result.err?.message).toBe('String error');
  });

  test('compile can be called multiple times with same result', async () => {
    const initialContext = { base: 0 };
    const instr = instruction<number, { base: number }>(initialContext)
      .step(async (v: number) => ok(v * 2));

    const compiled1 = instr.compile();
    const compiled2 = instr.compile();

    const result1 = await compiled1(5);
    const result2 = await compiled2(5);

    expect(result1.err).toBeUndefined();
    expect(result1.res).toBe(10);
    expect(result2.err).toBeUndefined();
    expect(result2.res).toBe(10);
  });

  test('compile with different context overrides', async () => {
    const initialContext = { base: 0 };
    const instr = instruction<number, { base: number }>(initialContext)
      .step(async (v: number, ctx: { base: number }) => ok(ctx.base + v));

    const compiled1 = instr.compile({ base: 3 });
    const compiled2 = instr.compile({ base: 7 });

    const result1 = await compiled1(5);
    const result2 = await compiled2(5);

    expect(result1.err).toBeUndefined();
    expect(result1.res).toBe(8); // 3 + 5

    expect(result2.err).toBeUndefined();
    expect(result2.res).toBe(12); // 7 + 5
  });

  test('complex pipeline with multiple transformations', async () => {
    const initialContext = { base: 0, count: 0 };
    const instr = instruction<number, { base: number; count: number }>(initialContext)
      .step(async (v: number, ctx: { base: number; count: number }) => ok(ctx.base + v))
      .assert((v: number) => v !== 0, 'Result cannot be zero')
      .context((ctx: { base: number; count: number }, v: number) => ({
        ...ctx,
        base: ctx.base + v,
        count: ctx.count + 1,
      }))
      .step(async (v: number, ctx: { base: number; count: number }) => ok(ctx.base / v))
      .step(async (v: number) => ok(v * 2));

    const result = await instr.run(5);

    expect(result.err).toBeUndefined();
    expect(result.res).toBe(2); // ((0 + 5) / 5) * 2 = 2
  });

  test('empty instruction pipeline', async () => {
    const initialContext = { base: 0 };
    const instr = instruction<number, { base: number }>(initialContext);

    const result = await instr.run(5);

    expect(result.err).toBeUndefined();
    expect(result.res).toBe(5); // No transformations, value unchanged
  });

  test('assertion with context access', async () => {
    const initialContext = { min: 10, max: 100 };
    const instr = instruction<number, { min: number; max: number }>(initialContext)
      .step(async (v: number) => ok(v * 2))
      .assert((v: number, ctx: { min: number; max: number }) => {
        return v >= ctx.min && v <= ctx.max;
      }, 'Value out of range');

    const result1 = await instr.run(5); // 5 * 2 = 10, within range
    const result2 = await instr.run(60); // 60 * 2 = 120, out of range

    expect(result1.err).toBeUndefined();
    expect(result1.res).toBe(10);

    expect(result2.err).toBeDefined();
    expect(result2.err?.message).toBe('Value out of range');
  });

  describe('useResult', () => {
    test('useResult unwraps result and transforms return type', async () => {
      const initialContext = { base: 0 };
      const instr = instruction<number, { base: number }>(initialContext)
        .step(async (v: number) => ok(v * 2))
        .useResult(async (v: number) => v.toString());

      const result = await instr.run(5);

      expect(result).toBe('10'); // Unwrapped string, not Result
      expect(typeof result).toBe('string');
    });

    test('useResult with sync function', async () => {
      const initialContext = { base: 0 };
      const instr = instruction<number, { base: number }>(initialContext)
        .step(async (v: number) => ok(v * 2))
        .useResult((v: number) => v + 1);

      const result = await instr.run(5);

      expect(result).toBe(11); // Unwrapped number
      expect(typeof result).toBe('number');
    });

    test('useResult receives context', async () => {
      const initialContext = { base: 10 };
      const instr = instruction<number, { base: number }>(initialContext)
        .step(async (v: number) => ok(v * 2))
        .context((ctx: { base: number }, v: number) => ({ ...ctx, base: ctx.base + v }))
        .useResult((v: number, ctx: { base: number }) => v + ctx.base);

      const result = await instr.run(5);

      // v = 10 (5 * 2), ctx.base = 10 + 10 = 20, result = 10 + 20 = 30
      expect(result).toBe(30);
    });

    test('useResult throws error when pipeline fails', async () => {
      const initialContext = { base: 0 };
      const instr = instruction<number, { base: number }>(initialContext)
        .step<number, Error>(async (v: number) => err(new Error('Step failed')))
        .useResult((v: number) => v.toString());

      await expect(instr.run(5)).rejects.toThrow('Step failed');
    });

    test('useResult throws error when assertion fails', async () => {
      const initialContext = { base: 0 };
      const instr = instruction<number, { base: number }>(initialContext)
        .step(async (v: number) => ok(v * 2))
        .assert((v: number) => v === 0, 'Value must be zero')
        .useResult((v: number) => v.toString());

      await expect(instr.run(5)).rejects.toThrow('Value must be zero');
    });

    test('useResult with different return types', async () => {
      const initialContext = { base: 0 };
      
      const instr1 = instruction<number, { base: number }>(initialContext)
        .step(async (v: number) => ok(v * 2))
        .useResult((v: number) => ({ value: v, doubled: true }));

      const result1 = await instr1.run(5);
      expect(result1).toEqual({ value: 10, doubled: true });

      const instr2 = instruction<number, { base: number }>(initialContext)
        .step(async (v: number) => ok(v * 2))
        .useResult((v: number) => [v, v * 2]);

      const result2 = await instr2.run(5);
      expect(result2).toEqual([10, 20]);
    });

    test('compile still returns AsyncResult after useResult', async () => {
      const initialContext = { base: 0 };
      const instr = instruction<number, { base: number }>(initialContext)
        .step(async (v: number) => ok(v * 2))
        .useResult((v: number) => v.toString());

      const compiled = instr.compile();
      const result = await compiled(5);

      // compile() should still return Result, not unwrapped
      expect(result.err).toBeUndefined();
      expect(result.res).toBe(10); // Number, not string
      expect(typeof result.res).toBe('number');
    });

    test('useResult with async function', async () => {
      const initialContext = { base: 0 };
      const instr = instruction<number, { base: number }>(initialContext)
        .step(async (v: number) => ok(v * 2))
        .useResult(async (v: number) => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return v.toString();
        });

      const result = await instr.run(5);

      expect(result).toBe('10');
      expect(typeof result).toBe('string');
    });

    test('useResult preserves error transformation', async () => {
      class CustomError extends Error {
        constructor(message: string, options?: { cause?: Error }) {
          super(message, options);
        }
      }

      const initialContext = { base: 0 };
      const instr = instruction<number, { base: number }>(initialContext)
        .failsWith(CustomError, 'Custom error')
        .step<number, Error>(async (v: number) => err(new Error('Step failed')))
        .useResult((v: number) => v.toString());

      await expect(instr.run(5)).rejects.toThrow(CustomError);
      try {
        await instr.run(5);
      } catch (error) {
        expect(error).toBeInstanceOf(CustomError);
        expect((error as CustomError).message).toBe('Custom error');
      }
    });

    test('useResult can be chained with other methods before it', async () => {
      const initialContext = { base: 0 };
      const instr = instruction<number, { base: number }>(initialContext)
        .step(async (v: number) => ok(v * 2))
        .assert((v: number) => v > 0, 'Value must be positive')
        .context((ctx: { base: number }, v: number) => ({ ...ctx, base: ctx.base + v }))
        .useResult((v: number, ctx: { base: number }) => v + ctx.base);

      const result = await instr.run(5);

      // v = 10 (5 * 2), ctx.base = 0 + 10 = 10, result = 10 + 10 = 20
      expect(result).toBe(20);
    });

    test('type inference through useResult', async () => {
      const initialContext = { base: 0 };
      const instr = instruction<number, { base: number }>(initialContext)
        .step(async (v: number) => ok(v.toString())) // number -> string
        .useResult((v: string) => v.length); // string -> number

      const result = await instr.run(42);

      expect(result).toBe(2); // "42".length === 2
      expect(typeof result).toBe('number');
    });

    test('useResult followed by step preserves unwrapped type', async () => {
      const initialContext = { base: 0 };
      const instr = instruction<number, { base: number }>(initialContext)
        .useResult(async (v: number, ctx: { base: number }) => v) // Unwrap to number
        .step(async (v: number, ctx: { base: number }) => ok(ctx.base + v)); // Transform number -> number

      const result = await instr.run(1);

      // Result should still be unwrapped number, not Result<number>
      expect(result).toBe(1); // Unwrapped value, not Result
      expect(typeof result).toBe('number');
      // Verify it's not a Result object
      expect(result).not.toHaveProperty('res');
      expect(result).not.toHaveProperty('err');
    });

    test('useResult with assert and context preserves unwrapped type', async () => {
      const initialContext = { base: 0 };
      const instr = instruction<number, { base: number }>(initialContext)
        .step(async (v: number) => ok(v * 2)) // number -> number
        .useResult((v: number) => v.toString()) // Unwrap to string
        .assert((v: number) => v > 0, 'Value must be positive') // Assert preserves R
        .context((ctx: { base: number }, v: number) => ({ ...ctx, base: ctx.base + v })); // Context preserves R

      const result = await instr.run(5);

      // Result should still be unwrapped string (from useResult), not Result<string>
      expect(result).toBe('10'); // Unwrapped string
      expect(typeof result).toBe('string');
      expect(result).not.toHaveProperty('res');
      expect(result).not.toHaveProperty('err');
    });
  });
});

