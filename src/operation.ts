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
 * Utility type for any Result or AsyncResult
 */
export type AnyResult<T = any> = Result<T> | AsyncResult<T>;

/**
 * Step function signature - transforms value and returns Result
 * @param value - Current value
 * @param context - Current context
 * @returns Result or AsyncResult of new value
 */
export type StepFunction<V, C, NV> = (value: V, context: C) => AnyResult<NV>;

/**
 * Context function signature - transforms context
 * @param context - Current context
 * @param value - Current value
 * @returns New context (sync or async)
 */
export type ContextFunction<C, V, NC> = (context: C, value: V) => NC | Promise<NC>;

/**
 * Error factory signature - matches standard Error constructor
 * @param message - Error message
 * @param options - Error options including cause
 * @returns New error instance
 */
export type ErrorFactory<E extends Error> = new (message: string, options?: { cause?: Error }) => E;

/**
 * Unified pipeline function signature - transforms both context and value
 * Context transformations always succeed, value transformations return Result
 * Always async for consistency
 * @param context - Current context
 * @param value - Current value
 * @returns Promise of tuple [new context, Result of new value]
 */
export type PipelineFunction<V, NV, C, NC> = (context: C, value: V) => Promise<[NC, Result<NV>]>;

/**
 * Error transformer signature - transforms errors
 * @param originalError - The original error
 * @returns New error instance
 */
type ErrorTransformer<E> = (originalError: Error) => E;


/**
 * Type-safe Operation interface - chainable pipeline builder
 * @param V - Final value type after all transformations
 * @param C - Final context type after all transformations
 * @param E - Error type (must extend Error)
 * @param R - Return type of complete() method
 */
export interface Operation<V, C, E extends Error = Error, R = AsyncResult<V, E>> {
  /**
   * Add a processing step to the pipeline
   * @param fn - Step function that transforms the value
   * @returns New operation with updated value type
   */
  step<NV>(fn: StepFunction<V, C, NV>): Operation<NV, C, E, R>;

  /**
   * Add a context transformation step to the pipeline
   * @param fn - Context function that transforms the context (returns new context directly)
   * @returns New operation with updated context type
   */
  context<NC>(fn: ContextFunction<C, V, NC>): Operation<V, NC, E, R>;

  /**
   * Set error transformation for the operation with custom error class
   * @param errorClass - Error class constructor
   * @param message - Error message
   * @returns New operation with updated error type
   */
  failsWith<NE extends Error>(errorClass: ErrorFactory<NE>, message: string): Operation<V, C, NE, R>;

  /**
   * Set error transformation for the operation with generic error
   * @param message - Error message string
   * @returns New operation with updated error type
   */
  failsWith(message: string): Operation<V, C, Error, R>;

  /**
   * Compile the pipeline into an optimized function
   * @param context - Optional context to bind (uses initial context if not provided)
   * @returns Compiled function that only needs value
   */
  compile(): CompiledPipelineWithContext<V, E>;
  compile(context: C): CompiledPipelineWithContext<V, E>;

  /**
   * Execute the pipeline and return the final result
   * @returns AsyncResult with final value or error, or custom return type if handler provided
   */
  complete(): R extends AsyncResult<V, E> ? AsyncResult<V, E> : Promise<R>;
}

/**
 * Compiled pipeline function with context already bound
 */
type CompiledPipelineWithContext<V, E extends Error = Error> = (value: V) => Promise<Result<V, E>>;

/**
 * Completion handler signature - can be sync or async
 * @param result - The final result from the pipeline
 * @param context - The final context from the pipeline
 * @returns Custom result type (sync or async)
 */
export type CompletionHandler<V, C, E extends Error, R> = (result: Result<V, E>, context: C) => R | Promise<R>;

/**
 * Internal operation state - simplified and mutable for performance
 */
type OperationState<V, C, E extends Error = Error, R = AsyncResult<V, E>> = {
  steps: PipelineFunction<any, any, any, any>[];
  errorTransformer?: ErrorTransformer<E>;
  initialValue?: V;
  initialContext?: C;
  completeHandler?: CompletionHandler<V, C, E, R>;
};

/**
 * Internal operation implementation class with mutable state and compilation support
 */
class OperationImpl<V, C, E extends Error = Error, R = AsyncResult<V, E>> implements Operation<V, C, E, R> {
  private state: OperationState<V, C, E, R>;

  constructor(state?: OperationState<V, C, E, R>) {
    // Simplified initialization - no copying, direct mutation for performance
    this.state = state || { steps: [] };
  }

  step<NV>(fn: StepFunction<V, C, NV>): Operation<NV, C, E, R> {
    this.state.steps.push(async (context: C, value: V) => {
      const result = fn(value, context);
      return [context, isPromiseLike(result) ? await result : result];
    });
    return this as unknown as Operation<NV, C, E, R>;
  }

  context<NC>(fn: ContextFunction<C, V, NC>): Operation<V, NC, E, R> {
    this.state.steps.push(async (context: C, value: V) => {
      const newContext = fn(context, value);
      return [isPromiseLike(newContext) ? await newContext : newContext, ok(value)];
    });
    return this as unknown as Operation<V, NC, E, R>;
  }

  failsWith<NE extends Error>(errorClass: ErrorFactory<NE>, message: string): Operation<V, C, NE, R>;
  failsWith(message: string): Operation<V, C, Error, R>;
  failsWith<NE extends Error>(errorClassOrMessage: any, message?: string): Operation<V, C, NE, R> | Operation<V, C, Error, R> {
    this.state.errorTransformer = typeof errorClassOrMessage === 'string'
      ? (originalError: Error) => new Error(errorClassOrMessage, { cause: originalError }) as E
      : (originalError: Error): E => new (errorClassOrMessage as ErrorFactory<NE>)(message!, { cause: originalError }) as unknown as E;
    
    return this as unknown as Operation<V, C, NE, R>;
  }

  private failure(error: unknown): Result<V, E> {
    const normalizedError = error instanceof Error ? error : new Error(String(error));
    return err(this.state.errorTransformer ? this.state.errorTransformer(normalizedError) : normalizedError) as Result<V, E>;
  }

  compile(): CompiledPipelineWithContext<V, E>;
  compile(context: C): CompiledPipelineWithContext<V, E>;
  compile(context?: C): CompiledPipelineWithContext<V, E> {
    const boundContext = context ?? this.state.initialContext ?? ({} as C);
    return (value: V): Promise<Result<V, E>> => this.executeCompiledPipeline(value, boundContext);
  }

  complete(): R extends AsyncResult<V, E> ? AsyncResult<V, E> : Promise<R> {
    const { completeHandler, initialValue, initialContext } = this.state;
    const context = initialContext || ({} as C);
    
    if (completeHandler) {
      return this.executeCompiledPipelineWithContext(initialValue as V, context)
        .then(({ result, context: finalContext }) => completeHandler(result, finalContext)) as R extends AsyncResult<V, E> ? AsyncResult<V, E> : Promise<R>;
    }
    return this.compile()(initialValue as V) as R extends AsyncResult<V, E> ? AsyncResult<V, E> : Promise<R>;
  }

  private async executeCompiledPipelineWithContext(value: V, context: C): Promise<{ result: Result<V, E>; context: C }> {
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

  private async executeCompiledPipeline(value: V, context: C): Promise<Result<V, E>> {
    const { result } = await this.executeCompiledPipelineWithContext(value, context);
    return result;
  }

}

export function operation<C = unknown, V = unknown>(initialContext?: C, initialValue?: V): Operation<V, C, Error, AsyncResult<V, Error>> {
  return new OperationImpl<V, C, Error>({
    steps: [],
    initialValue,
    initialContext,
  }) as Operation<V, C, Error, AsyncResult<V, Error>>;
}

export function makeOperation<C = unknown, E extends Error = Error, R = any>(
  completeHandler: CompletionHandler<any, C, E, R>
): <V = unknown>(initialContext?: C, initialValue?: V) => Operation<V, C, E, Promise<R>> {
  return <V = unknown>(initialContext?: C, initialValue?: V) => 
    new OperationImpl<V, C, E, Promise<R>>({
      steps: [],
      initialValue,
      initialContext,
      completeHandler: async (result: Result<V, E>, context: C) => completeHandler(result, context),
    });
}
