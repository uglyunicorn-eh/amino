import { type Result, type AsyncResult, ok, err } from './result.ts';

/**
 * Step function signature - transforms value and returns Result
 * @param value - Current value
 * @param context - Current context
 * @returns Result or AsyncResult of new value with custom error type
 */
export type StepFunction<V, C, NV, SE extends Error = Error> = (value: V, context: C) => Result<NV, SE> | AsyncResult<NV, SE>;

/**
 * Context function signature - transforms context
 * @param context - Current context
 * @param value - Current value
 * @returns New context (sync or async)
 */
export type ContextFunction<C, V, NC> = (context: C, value: V) => NC | Promise<NC>;

/**
 * Assert function signature - validates value without transformation
 * @param value - Current value
 * @param context - Current context
 * @returns Boolean indicating if assertion passes (sync or async)
 */
export type AssertFunction<V, C> = (value: V, context: C) => boolean | Promise<boolean>;

/**
 * Error factory signature - matches standard Error constructor
 * @param message - Error message
 * @param options - Error options including cause
 * @returns New error instance
 */
export type ErrorFactory<E extends Error> = new (message: string, options?: { cause?: Error }) => E;

/**
 * Utility to check if a value is promise-like
 * Optimized for performance: uses instanceof for native promises, duck-typing for custom ones
 */
function isPromiseLike(value: unknown): value is Promise<unknown> {
  // Fast path for native promises
  if (value instanceof Promise) {
    return true;
  }
  
  // Duck-typing check for custom Promise-like objects
  return value !== null && typeof value === 'object' && typeof (value as { then?: unknown }).then === 'function';
}

/**
 * Step iteration - a function that executes a single step
 * Takes current value and context, returns result and new context
 */
type StepIteration<V, C, NV, NC, E extends Error = Error> = (
  v: V,
  c: C
) => Promise<[Result<NV, E>, NC]>;

/**
 * Error transformer signature - transforms errors
 */
type ErrorTransformer<E> = (originalError: Error) => E;

/**
 * Compiled pipeline function with context already bound
 * When IV is undefined, the value parameter is optional
 */
type CompiledPipeline<IV, V, E extends Error = Error> = IV extends undefined
  ? (v?: IV) => AsyncResult<V, E>
  : (v: IV) => AsyncResult<V, E>;

/**
 * Type-safe Instruction interface - chainable pipeline builder
 * @param IV - Initial Value type (input type, preserved through chain)
 * @param IC - Initial Context type (input type, preserved through chain)
 * @param V - Current Value type (transforms through pipeline)
 * @param C - Current Context type (transforms through pipeline)
 * @param E - Error type (must extend Error)
 */
export interface Instruction<
  IV = undefined,
  IC = undefined,
  V = undefined,
  C = undefined,
  E extends Error = Error,
> {
  /**
   * Compile the pipeline with context override
   * @param overwriteContext - Context to bind (overrides initial context)
   * @returns Compiled function that only needs value
   */
  compile(overwriteContext: IC): CompiledPipeline<IV, V, E>;

  /**
   * Compile the pipeline with initial context
   * @returns Compiled function that only needs value
   */
  compile(): CompiledPipeline<IV, V, E>;

  /**
   * Run the pipeline with a value (uses initial context)
   * When IV is undefined, the value parameter is optional
   * @param v - Initial value to process (optional when IV is undefined)
   * @returns Result of the pipeline execution
   */
  run(...args: IV extends undefined ? [] : [IV]): AsyncResult<V, E>;

  /**
   * Set error transformation for the instruction with custom error class
   * @param errorClass - Error class constructor
   * @param message - Error message
   * @returns New instruction with updated error type
   */
  failsWith<NE extends Error>(
    errorClass: ErrorFactory<NE>,
    message: string
  ): Instruction<IV, IC, V, C, NE>;

  /**
   * Set error transformation for the instruction with generic error
   * @param message - Error message string
   * @returns New instruction with updated error type
   */
  failsWith(message: string): Instruction<IV, IC, V, C, Error>;

  /**
   * Add a processing step to the pipeline
   * @param fn - Step function that transforms the value
   * @returns New instruction with updated value type
   */
  step<NV, SE extends Error = Error>(
    fn: StepFunction<V, C, NV, SE>
  ): Instruction<IV, IC, NV, C, E>;

  /**
   * Add an assertion/validation step that doesn't transform the value
   * @param predicate - Predicate function that returns true if assertion passes
   * @param message - Optional error message if assertion fails
   * @returns New instruction with same value type (no transformation)
   */
  assert(
    predicate: AssertFunction<V, C>,
    message?: string
  ): Instruction<IV, IC, V, C, E>;

  /**
   * Add a context transformation step to the pipeline
   * @param fn - Context function that transforms the context
   * @returns New instruction with updated context type
   */
  context<NC>(fn: ContextFunction<C, V, NC>): Instruction<IV, IC, V, NC, E>;
}

/**
 * Internal instruction implementation class with immutable array storage
 * Uses structural sharing for efficient branching
 */
class InstructionImpl<
  IV = undefined,
  IC = undefined,
  V = undefined,
  C = undefined,
  E extends Error = Error,
> implements Instruction<IV, IC, V, C, E> {
  private readonly steps: StepIteration<any, any, any, any, any>[];
  private readonly initialContext: IC;
  private readonly errorTransformer?: ErrorTransformer<E>;
  private readonly _parent?: InstructionImpl<any, any, any, any, any>;
  private _cachedSteps: StepIteration<any, any, any, any, any>[] | null = null;

  constructor(
    initialContext: IC,
    steps: StepIteration<any, any, any, any, any>[] = [],
    errorTransformer?: ErrorTransformer<E>,
    parent?: InstructionImpl<any, any, any, any, any>
  ) {
    this.initialContext = initialContext;
    this.steps = steps;
    this.errorTransformer = errorTransformer;
    this._parent = parent;
  }

  /**
   * Get the full steps array, building it from parent if needed
   * Uses structural sharing: only copies when necessary
   * Caches result to avoid rebuilding
   */
  private getSteps(): StepIteration<any, any, any, any, any>[] {
    if (this._cachedSteps) {
      return this._cachedSteps;
    }

    if (this._parent) {
      // Build from parent's steps + our new steps (structural sharing)
      // If we have a parent, this.steps contains only new steps added after branching
      this._cachedSteps = [...this._parent.getSteps(), ...this.steps];
    } else {
      this._cachedSteps = this.steps;
    }

    return this._cachedSteps;
  }

  compile(overwriteContext?: IC): CompiledPipeline<IV, V, E> {
    const boundContext = (overwriteContext ?? this.initialContext) as IC;

    // Create a function that accepts optional parameter when IV is undefined
    // TypeScript will handle the overload resolution at compile time
    return (async (v?: IV): Promise<Result<V, E>> => {
      // If v is undefined and IV is undefined, use undefined; otherwise use v ?? undefined
      const value = (v ?? undefined) as IV;
      const result = await this.executeSteps(value, boundContext);
      return result;
    }) as CompiledPipeline<IV, V, E>;
  }

  run(...args: IV extends undefined ? [] : [IV]): AsyncResult<V, E> {
    // When IV is undefined, args is empty; otherwise args[0] is the value
    const value = (args[0] ?? undefined) as IV;
    return this.compile()(value as any);
  }

  failsWith<NE extends Error>(
    errorClass: ErrorFactory<NE>,
    message: string
  ): Instruction<IV, IC, V, C, NE>;
  failsWith(message: string): Instruction<IV, IC, V, C, Error>;
  failsWith<NE extends Error>(
    errorClassOrMessage: ErrorFactory<NE> | string,
    message?: string
  ): Instruction<IV, IC, V, C, NE> | Instruction<IV, IC, V, C, Error> {
    if (typeof errorClassOrMessage === 'string') {
      const errorTransformer: ErrorTransformer<Error> = (originalError: Error) =>
        new Error(errorClassOrMessage, { cause: originalError });
      
      return new InstructionImpl<IV, IC, V, C, Error>(
        this.initialContext,
        this.steps,
        errorTransformer,
        this._parent
      ) as Instruction<IV, IC, V, C, Error>;
    } else {
      const errorTransformer: ErrorTransformer<NE> = (originalError: Error): NE =>
        new (errorClassOrMessage as ErrorFactory<NE>)(message!, {
          cause: originalError,
        }) as unknown as NE;

      return new InstructionImpl<IV, IC, V, C, NE>(
        this.initialContext,
        this.steps,
        errorTransformer,
        this._parent
      ) as Instruction<IV, IC, V, C, NE>;
    }
  }

  step<NV, SE extends Error = Error>(
    fn: StepFunction<V, C, NV, SE>
  ): Instruction<IV, IC, NV, C, E> {
    // Create step that only executes this transformation
    const newStep: StepIteration<V, C, NV, C, E> = async (
      v: V,
      c: C
    ): Promise<[Result<NV, E>, C]> => {
      const stepResult = fn(v, c);
      const resolved = isPromiseLike(stepResult) ? await stepResult : stepResult;
      return [resolved as Result<NV, E>, c];
    };

    // Use structural sharing for branching
    // If we have a parent, only store new steps (efficient branching)
    // Otherwise, copy array and append new step (linear chain)
    if (this._parent) {
      // Branching: only store the new step, reference parent
      return new InstructionImpl<IV, IC, NV, C, E>(
        this.initialContext,
        [newStep],
        this.errorTransformer,
        this
      );
    } else {
      // Linear chain: copy and append
      const newSteps = [...this.steps, newStep];
      return new InstructionImpl<IV, IC, NV, C, E>(
        this.initialContext,
        newSteps,
        this.errorTransformer
      );
    }
  }

  assert(
    predicate: AssertFunction<V, C>,
    message?: string
  ): Instruction<IV, IC, V, C, E> {
    // Create assertion step that validates without transformation
    const newStep: StepIteration<V, C, V, C, E> = async (
      v: V,
      c: C
    ): Promise<[Result<V, E>, C]> => {
      const result = predicate(v, c);
      const passed = isPromiseLike(result) ? await result : result;

      if (!passed) {
        const error = new Error(message || 'Assertion failed');
        return [err(error) as Result<V, E>, c];
      }

      return [ok(v), c];
    };

    // Use structural sharing for branching
    if (this._parent) {
      // Branching: only store the new step, reference parent
      return new InstructionImpl<IV, IC, V, C, E>(
        this.initialContext,
        [newStep],
        this.errorTransformer,
        this
      );
    } else {
      const newSteps = [...this.steps, newStep];
      return new InstructionImpl<IV, IC, V, C, E>(
        this.initialContext,
        newSteps,
        this.errorTransformer
      );
    }
  }

  context<NC>(fn: ContextFunction<C, V, NC>): Instruction<IV, IC, V, NC, E> {
    // Create context transformation step
    const newStep: StepIteration<V, C, V, NC, E> = async (
      v: V,
      c: C
    ): Promise<[Result<V, E>, NC]> => {
      const newContext = fn(c, v);
      const resolvedContext = isPromiseLike(newContext)
        ? await newContext
        : newContext;

      return [ok(v), resolvedContext];
    };

    // Use structural sharing for branching
    if (this._parent) {
      // Branching: only store the new step, reference parent
      return new InstructionImpl<IV, IC, V, NC, E>(
        this.initialContext,
        [newStep],
        this.errorTransformer,
        this
      );
    } else {
      const newSteps = [...this.steps, newStep];
      return new InstructionImpl<IV, IC, V, NC, E>(
        this.initialContext,
        newSteps,
        this.errorTransformer
      );
    }
  }

  private async executeSteps(
    v: IV,
    c: IC
  ): Promise<Result<V, E>> {
    try {
      let currentValue: any = v;
      let currentContext: any = c;

      // Get full steps array (may require building from parent)
      const steps = this.getSteps();

      // Execute steps sequentially, passing current value and context
      for (const step of steps) {
        const [result, newContext] = await step(currentValue, currentContext);
        if (result.err !== undefined) {
          return this.failure(result.err);
        }
        currentValue = result.res;
        currentContext = newContext;
      }

      return ok(currentValue);
    } catch (error) {
      return this.failure(error);
    }
  }

  private failure(error: unknown): Result<V, E> {
    const normalizedError =
      error instanceof Error ? error : new Error(String(error));
    return err(
      this.errorTransformer
        ? this.errorTransformer(normalizedError)
        : normalizedError
    ) as Result<V, E>;
  }
}

/**
 * Create a new instruction with initial context
 * @param initialContext - Initial context for the instruction pipeline
 * @returns New instruction instance
 * 
 * @template IC - Initial Context type
 * @template IV - Initial Value type (defaults to undefined)
 * 
 * Note: When IV is undefined, the initial value is optional when calling run() or compile()
 */
export function instruction<IC, IV = undefined>(
  initialContext: IC
): Instruction<IV, IC, undefined, IC, Error> {
  return new InstructionImpl<IV, IC, undefined, IC, Error>(initialContext);
}

