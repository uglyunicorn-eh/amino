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
  if (value instanceof Promise) {
    return true;
  }
  
  return value !== null && typeof value === 'object' && typeof (value as { then?: unknown }).then === 'function';
}

type StepIteration<V, C, NV, NC, E extends Error = Error> = (
  v: V,
  c: C
) => Promise<[Result<NV, E>, NC]>;

type ErrorTransformer<E> = (originalError: Error) => E;

/**
 * Computes the updated result type when the value type changes from V to NV.
 * If R is Result<V>, it becomes Result<NV>.
 * The R type parameter is not customizable by users; it always follows the Result<V> pattern.
 */
type UpdatedResultType<R, V, NV> = R extends Result<V> ? Result<NV> : R;

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
 * @param R - Result type (defaults to Result<V>, can be changed by useResult)
 */
export interface Instruction<
  IV = undefined,
  IC = undefined,
  V = undefined,
  C = undefined,
  E extends Error = Error,
  R = Result<V>,
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
   * @returns Result of the pipeline execution (Promise<R> where R defaults to Result<V>)
   */
  run(...args: IV extends undefined ? [] : [IV]): Promise<R>;

  /**
   * Set error transformation for the instruction with custom error class
   * @param errorClass - Error class constructor
   * @param message - Error message
   * @returns New instruction with updated error type
   */
  failsWith<NE extends Error>(
    errorClass: ErrorFactory<NE>,
    message: string
  ): Instruction<IV, IC, V, C, NE, R>;

  /**
   * Set error transformation for the instruction with generic error
   * @param message - Error message string
   * @returns New instruction with updated error type
   */
  failsWith(message: string): Instruction<IV, IC, V, C, Error, R>;

  /**
   * Add a processing step to the pipeline
   * @param fn - Step function that transforms the value
   * @returns New instruction with updated value type
   * If R is the default Result<V>, it becomes Result<NV>
   * If R is a custom type (from useResult), it is preserved
   */
  step<NV, SE extends Error = Error>(
    fn: StepFunction<V, C, NV, SE>
  ): Instruction<IV, IC, NV, C, E, UpdatedResultType<R, V, NV>>;

  /**
   * Add an assertion/validation step that doesn't transform the value
   * @param predicate - Predicate function that returns true if assertion passes
   * @param message - Optional error message if assertion fails
   * @returns New instruction with same value type (no transformation)
   * R type is preserved (custom type from useResult or default Result<V>)
   */
  assert(
    predicate: AssertFunction<V, C>,
    message?: string
  ): Instruction<IV, IC, V, C, E, R>;

  /**
   * Add a context transformation step to the pipeline
   * @param fn - Context function that transforms the context
   * @returns New instruction with updated context type
   * R type is preserved (custom type from useResult or default Result<V>)
   */
  context<NC>(fn: ContextFunction<C, V, NC>): Instruction<IV, IC, V, NC, E, R>;

  /**
   * Run the instruction and transform the result
   * @param fn - Function that receives the result of .run() and returns a new value
   * @param value - Optional initial value (required if IV is not undefined)
   * @returns Promise of the callback's return value
   */
  useResult<RR>(
    fn: (result: R) => RR | Promise<RR>,
    ...args: IV extends undefined ? [] : [value: IV]
  ): Promise<RR>;
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
  R = Result<V>,
> implements Instruction<IV, IC, V, C, E, R> {
  private readonly steps: StepIteration<any, any, any, any, any>[];
  private readonly initialContext: IC;
  private readonly errorTransformer?: ErrorTransformer<E>;
  private readonly _parent?: InstructionImpl<any, any, any, any, any, any>;
  private _cachedSteps: StepIteration<any, any, any, any, any>[] | null = null;

  constructor(
    initialContext: IC,
    steps: StepIteration<any, any, any, any, any>[] = [],
    errorTransformer?: ErrorTransformer<E>,
    parent?: InstructionImpl<any, any, any, any, any, any>
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
   * 
   * Cache is safe because InstructionImpl instances are immutable - once created,
   * the steps array and parent reference never change, so the cache never becomes stale.
   */
  private getSteps(): StepIteration<any, any, any, any, any>[] {
    if (this._cachedSteps) {
      return this._cachedSteps;
    }

    if (this._parent) {
      this._cachedSteps = [...this._parent.getSteps(), ...this.steps];
    } else {
      this._cachedSteps = this.steps;
    }

    return this._cachedSteps;
  }

  compile(overwriteContext?: IC): CompiledPipeline<IV, V, E> {
    const boundContext = (overwriteContext ?? this.initialContext) as IC;

    return (async (v?: IV): Promise<Result<V, E>> => {
      const value = v as IV;
      const result = await this.executeSteps(value, boundContext);
      return result;
    }) as CompiledPipeline<IV, V, E>;
  }

  run(...args: IV extends undefined ? [] : [IV]): Promise<R> {
    const value = args[0] as IV;
    
    // Default behavior: return Result<V, E>
    // Since R defaults to Result<V>, this should match Promise<R>
    const compiled = this.compile();
    return compiled(value) as Promise<R>;
  }

  failsWith<NE extends Error>(
    errorClass: ErrorFactory<NE>,
    message: string
  ): Instruction<IV, IC, V, C, NE, R>;
  failsWith(message: string): Instruction<IV, IC, V, C, Error, R>;
  failsWith<NE extends Error>(
    errorClassOrMessage: ErrorFactory<NE> | string,
    message?: string
  ): Instruction<IV, IC, V, C, NE, R> | Instruction<IV, IC, V, C, Error, R> {
    if (typeof errorClassOrMessage === 'string') {
      const errorTransformer: ErrorTransformer<Error> = (originalError: Error) =>
        new Error(errorClassOrMessage, { cause: originalError });
      
      return this.createInstructionWithErrorType<Error>(errorTransformer);
    } else {
      if (message === undefined) {
        throw new Error('message is required when using custom error class');
      }
      
      const errorTransformer: ErrorTransformer<NE> = (originalError: Error): NE =>
        // Double type assertion needed: ErrorFactory<NE> -> unknown -> NE
        // This is necessary because TypeScript can't verify the generic error factory pattern
        new (errorClassOrMessage as ErrorFactory<NE>)(message, {
          cause: originalError,
        }) as unknown as NE;

      return this.createInstructionWithErrorType<NE>(errorTransformer);
    }
  }

  step<NV, SE extends Error = Error>(
    fn: StepFunction<V, C, NV, SE>
  ): Instruction<IV, IC, NV, C, E, UpdatedResultType<R, V, NV>> {
    const newStep: StepIteration<V, C, NV, C, E> = async (
      v: V,
      c: C
    ): Promise<[Result<NV, E>, C]> => {
      const stepResult = fn(v, c);
      const resolved = isPromiseLike(stepResult) ? await stepResult : stepResult;
      return [resolved as Result<NV, E>, c];
    };

    return this.createChildInstruction<NV, C>(newStep);
  }

  assert(
    predicate: AssertFunction<V, C>,
    message?: string
  ): Instruction<IV, IC, V, C, E, R> {
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

    // For assert, V doesn't change, so we preserve R type
    return this.createInstructionWithPreservedR<V, C>(newStep);
  }

  context<NC>(fn: ContextFunction<C, V, NC>): Instruction<IV, IC, V, NC, E, R> {
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

    // For context, V doesn't change, so we preserve R type
    return this.createInstructionWithPreservedR<V, NC>(newStep);
  }

  async useResult<RR>(
    fn: (result: R) => RR | Promise<RR>,
    ...args: IV extends undefined ? [] : [value: IV]
  ): Promise<RR> {
    const result = await this.run(...args);
    const fnResult = fn(result);
    return isPromiseLike(fnResult) ? await fnResult : fnResult;
  }

  /**
   * Create a child instruction with structural sharing for efficient branching
   * @param newStep - The step to add
   * @returns New instruction instance
   */
  private createChildInstruction<NV, NC>(
    newStep: StepIteration<V, C, NV, NC, E>
  ): InstructionImpl<IV, IC, NV, NC, E, UpdatedResultType<R, V, NV>> {
    // If R is the default Result<V>, update it to Result<NV> when value type changes
    // If R is a custom type (from useResult), preserve it
    const steps = this._parent ? [newStep] : [...this.steps, newStep];
    const parent = this._parent ? this : undefined;
    
    return new InstructionImpl<IV, IC, NV, NC, E, UpdatedResultType<R, V, NV>>(
      this.initialContext,
      steps,
      this.errorTransformer,
      parent
    ) as InstructionImpl<IV, IC, NV, NC, E, UpdatedResultType<R, V, NV>>;
  }

  /**
   * Create a new instruction with preserved R type (for assert and context)
   * @param newStep - The step to add
   * @returns New instruction instance with same R type
   */
  private createInstructionWithPreservedR<NV, NC>(
    newStep: StepIteration<V, C, NV, NC, E>
  ): InstructionImpl<IV, IC, NV, NC, E, R> {
    const steps = this._parent ? [newStep] : [...this.steps, newStep];
    const parent = this._parent ? this : undefined;
    
    return new InstructionImpl<IV, IC, NV, NC, E, R>(
      this.initialContext,
      steps,
      this.errorTransformer,
      parent
    ) as InstructionImpl<IV, IC, NV, NC, E, R>;
  }

  /**
   * Create a new instruction with updated error type but preserved R type (for failsWith)
   * @param errorTransformer - Error transformer function
   * @returns New instruction instance with updated error type
   */
  private createInstructionWithErrorType<NE extends Error>(
    errorTransformer: ErrorTransformer<NE>
  ): InstructionImpl<IV, IC, V, C, NE, R> {
    return new InstructionImpl<IV, IC, V, C, NE, R>(
      this.initialContext,
      this.steps,
      errorTransformer,
      this._parent
    ) as InstructionImpl<IV, IC, V, C, NE, R>;
  }

  private async executeSteps(
    v: IV,
    c: IC
  ): Promise<Result<V, E>> {
    const [result, _] = await this.executeStepsWithContext(v, c);
    return result;
  }

  private async executeStepsWithContext(
    v: IV,
    c: IC
  ): Promise<[Result<V, E>, C]> {
    try {
      let currentValue: any = v;
      let currentContext: any = c;

      const steps = this.getSteps();

      for (const step of steps) {
        const [result, newContext] = await step(currentValue, currentContext);
        if (result.err !== undefined) {
          return [this.failure(result.err), currentContext];
        }
        currentValue = result.res;
        currentContext = newContext;
      }

      return [ok(currentValue), currentContext];
    } catch (error) {
      return [this.failure(error), c as unknown as C];
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
 * Create a new instruction without initial context
 * @returns New instruction instance with undefined context
 * 
 * @template IV - Initial Value type (defaults to undefined)
 * 
 * Note: When IV is undefined, the initial value is optional when calling run() or compile()
 * When IV is specified, the first step receives IV as the value type
 */
export function instruction<IV = undefined>(): Instruction<IV, undefined, IV extends undefined ? undefined : IV, undefined, Error, Result<IV extends undefined ? undefined : IV>>;

/**
 * Create a new instruction with initial context
 * @param initialContext - Initial context for the instruction pipeline
 * @returns New instruction instance
 * 
 * @template IV - Initial Value type (defaults to undefined)
 * @template IC - Initial Context type (inferred from initialContext)
 * 
 * Note: When IV is undefined, the initial value is optional when calling run() or compile()
 * When IV is specified, the first step receives IV as the value type
 */
export function instruction<IV = undefined, IC = undefined>(
  initialContext: IC
): Instruction<IV, IC, IV extends undefined ? undefined : IV, IC, Error, Result<IV extends undefined ? undefined : IV>>;

/**
 * Create a new instruction with optional initial context
 * @param initialContext - Optional initial context for the instruction pipeline
 * @returns New instruction instance
 */
export function instruction<IV = undefined, IC = undefined>(
  initialContext?: IC
): Instruction<IV, IC, IV extends undefined ? undefined : IV, IC, Error, Result<IV extends undefined ? undefined : IV>> {
  type InitialV = IV extends undefined ? undefined : IV;
  return new InstructionImpl<IV, IC, InitialV, IC, Error, Result<InitialV>>(initialContext as IC);
}

