import { type Result, type AsyncResult, ok, err } from './result.ts';

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
 * Internal pipeline function signature - transforms both context and value
 * Context transformations always succeed, value transformations return Result
 * Always async for consistency
 * @param context - Current context
 * @param value - Current value
 * @returns Promise of tuple [new context, Result of new value]
 */
type PipelineFunction<V, NV, C, NC> = (context: C, value: V) => Promise<[NC, Result<NV>]>;

/**
 * Error transformer signature - transforms errors
 * @param originalError - The original error
 * @returns New error instance
 */
type ErrorTransformer<E> = (originalError: Error) => E;


/**
 * Type-safe Operation interface - chainable pipeline builder
 * @param V - Final value type after all transformations
 * @param C - Final context type after all transformations (default: undefined)
 * @param E - Error type (must extend Error)
 */
export interface Operation<V, C = undefined, E extends Error = Error> {
  /**
   * Add a processing step to the pipeline
   * @param fn - Step function that transforms the value (can return Result with custom error type)
   * @returns New operation with updated value type
   */
  step<NV, SE extends Error = Error>(fn: StepFunction<V, C, NV, SE>): Operation<NV, C, E>;

  /**
   * Add a context transformation step to the pipeline
   * @param fn - Context function that transforms the context (returns new context directly)
   * @returns New operation with updated context type
   */
  context<NC>(fn: ContextFunction<C, V, NC>): Operation<V, NC, E>;

  /**
   * Add an assertion/validation step that doesn't transform the value
   * @param predicate - Predicate function that returns true if assertion passes
   * @param message - Optional error message if assertion fails (default: 'Assertion failed')
   * @returns New operation with same value type (no transformation)
   */
  assert(predicate: AssertFunction<V, C>, message?: string): Operation<V, C, E>;

  /**
   * Set error transformation for the operation with custom error class
   * @param errorClass - Error class constructor
   * @param message - Error message
   * @returns New operation with updated error type
   */
  failsWith<NE extends Error>(errorClass: ErrorFactory<NE>, message: string): Operation<V, C, NE>;

  /**
   * Set error transformation for the operation with generic error
   * @param message - Error message string
   * @returns New operation with updated error type
   */
  failsWith(message: string): Operation<V, C, Error>;

  /**
   * Compile the pipeline into an optimized function
   * @param context - Optional context to bind (uses initial context if not provided)
   * @returns Compiled function that only needs value
   */
  compile(): CompiledPipelineWithContext<V, E>;
  compile(context: C): CompiledPipelineWithContext<V, E>;

  /**
   * Execute the pipeline and return the final result
   * @returns AsyncResult with final value or error
   */
  complete(): AsyncResult<V, E>;
}

/**
 * Compiled pipeline function with context already bound
 */
type CompiledPipelineWithContext<V, E extends Error = Error> = (value: V) => Promise<Result<V, E>>;

/**
 * Internal operation state - simplified and mutable for performance
 */
type OperationState<V, C = undefined, E extends Error = Error> = {
  steps: PipelineFunction<any, any, any, any>[];
  errorTransformer?: ErrorTransformer<E>;
  initialValue?: V;
  initialContext?: C;
};

/**
 * Internal operation implementation class with mutable state and compilation support
 */
class OperationImpl<V, C = undefined, E extends Error = Error> implements Operation<V, C, E> {
  private state: OperationState<V, C, E>;

  constructor(state?: OperationState<V, C, E>) {
    // Simplified initialization - no copying, direct mutation for performance
    this.state = state || { steps: [] };
  }

  step<NV, SE extends Error = Error>(fn: StepFunction<V, C, NV, SE>): Operation<NV, C, E> {
    this.state.steps.push(async (context: C, value: V) => {
      const result = fn(value, context);
      const resolvedResult = isPromiseLike(result) ? await result : result;
      // Normalize the error type to match operation's error type if needed
      return [context, resolvedResult as Result<NV, E>];
    });
    return this as unknown as Operation<NV, C, E>;
  }

  context<NC>(fn: ContextFunction<C, V, NC>): Operation<V, NC, E> {
    this.state.steps.push(async (context: C, value: V) => {
      const newContext = fn(context, value);
      return [isPromiseLike(newContext) ? await newContext : newContext, ok(value)];
    });
    return this as unknown as Operation<V, NC, E>;
  }

  assert(predicate: AssertFunction<V, C>, message?: string): Operation<V, C, E> {
    this.state.steps.push(async (context: C, value: V) => {
      const result = predicate(value, context);
      const passed = isPromiseLike(result) ? await result : result;
      
      if (!passed) {
        // Return error directly - executor will apply error transformation via this.failure()
        return [context, err(new Error(message || 'Assertion failed')) as Result<V, E>];
      }
      
      return [context, ok(value)];
    });
    return this as unknown as Operation<V, C, E>;
  }

  failsWith<NE extends Error>(errorClass: ErrorFactory<NE>, message: string): Operation<V, C, NE>;
  failsWith(message: string): Operation<V, C, Error>;
  failsWith<NE extends Error>(errorClassOrMessage: any, message?: string): Operation<V, C, NE> | Operation<V, C, Error> {
    this.state.errorTransformer = typeof errorClassOrMessage === 'string'
      ? (originalError: Error) => new Error(errorClassOrMessage, { cause: originalError }) as E
      : (originalError: Error): E => new (errorClassOrMessage as ErrorFactory<NE>)(message!, { cause: originalError }) as unknown as E;
    
    return this as unknown as Operation<V, C, NE>;
  }

  private failure(error: unknown): Result<V, E> {
    const normalizedError = error instanceof Error ? error : new Error(String(error));
    return err(this.state.errorTransformer ? this.state.errorTransformer(normalizedError) : normalizedError) as Result<V, E>;
  }

  compile(): CompiledPipelineWithContext<V, E>;
  compile(context: C): CompiledPipelineWithContext<V, E>;
  compile(context?: C): CompiledPipelineWithContext<V, E> {
    const boundContext = (context ?? this.state.initialContext) as C;
    return async (value: V): Promise<Result<V, E>> => {
      const { result } = await this.executeCompiledPipeline(value, boundContext);
      return result;
    };
  }

  complete(): AsyncResult<V, E> {
    const { initialValue } = this.state;
    return this.compile()(initialValue as V);
  }

  private async executeCompiledPipeline(value: V, context: C): Promise<{ result: Result<V, E>; context: C }> {
    try {
      let currentValue: any = value;
      let currentContext: any = context;

      for (const step of this.state.steps) {
        const [newContext, result] = await step(currentContext, currentValue);
        const { err: error, res } = result;
        
        if (error !== undefined) {
          return { result: this.failure(error), context: currentContext };
        }
        
        currentContext = newContext;
        currentValue = res;
      }

      return { result: ok(currentValue), context: currentContext };
    } catch (error) {
      return { result: this.failure(error), context };
    }
  }

}

export function operation<V, C = undefined>(initialContext?: C, initialValue?: V): Operation<V, C, Error> {
  return new OperationImpl<V, C, Error>({
    steps: [],
    initialValue,
    initialContext,
  }) as Operation<V, C, Error>;
}
