import { type Result, type AsyncResult, ok, err } from './result.ts';

/**
 * Utility to check if a value is promise-like
 */
function isPromiseLike(value: unknown): value is Promise<unknown> {
  return value != null && typeof value === 'object' && typeof (value as any).then === 'function';
}

/**
 * Utility to handle both sync and async function results
 */
async function awaitResult<T>(value: T | Promise<T>): Promise<T> {
  return isPromiseLike(value) ? await value : value;
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
 * Internal pipeline step representation
 */
type PipelineStep<V, NV, C, NC> = {
  fn: PipelineFunction<V, NV, C, NC>;
};

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
   * Execute the pipeline and return the final result
   * @returns AsyncResult with final value or error, or custom return type if handler provided
   */
  complete(): R extends AsyncResult<V, E> ? AsyncResult<V, E> : Promise<R>;
}

/**
 * Type-safe operation wrapper that explicitly defines the final result type
 */
export interface TypedOperation<V, C, E extends Error = Error> {
  step<NV>(fn: StepFunction<V, C, NV>): TypedOperation<NV, C, E>;
  context<NC>(fn: ContextFunction<C, V, NC>): TypedOperation<V, NC, E>;
  failsWith<NE extends Error>(errorClass: ErrorFactory<NE>, message: string): TypedOperation<V, C, NE>;
  failsWith(message: string): TypedOperation<V, C, Error>;
  complete(): AsyncResult<V, E>;
}

/**
 * Completion handler signature - can be sync or async
 * @param result - The final result from the pipeline
 * @param context - The final context from the pipeline
 * @returns Custom result type (sync or async)
 */
export type CompletionHandler<V, C, E extends Error, R> = (result: Result<V, E>, context: C) => R | Promise<R>;

/**
 * Internal operation state
 */
type OperationState<V, C, E extends Error = Error, R = AsyncResult<V, E>> = {
  steps: PipelineStep<any, any, any, any>[];
  errorTransformer?: ErrorTransformer<E>;
  initialValue?: V;
  initialContext?: C;
  completeHandler?: CompletionHandler<V, C, E, R>;
};

/**
 * Internal operation implementation class
 */
class OperationImpl<V, C, E extends Error = Error, R = AsyncResult<V, E>> implements Operation<V, C, E, R> {
  constructor(private state: OperationState<V, C, E, R>) {}

  step<NV>(fn: StepFunction<V, C, NV>): Operation<NV, C, E, R> {
    const pipelineFn: PipelineFunction<V, NV, C, C> = async (context: C, value: V) => 
      [context, await awaitResult(fn(value, context))];
    
    return new OperationImpl<NV, C, E, R>({
      ...this.state,
      steps: [...this.state.steps, { fn: pipelineFn }],
      initialValue: this.state.initialValue as NV | undefined,
      completeHandler: this.state.completeHandler as any,
    });
  }

  context<NC>(fn: ContextFunction<C, V, NC>): Operation<V, NC, E, R> {
    const pipelineFn: PipelineFunction<V, V, C, NC> = async (context: C, value: V) => 
      [await awaitResult(fn(context, value)), ok(value)];
    
    return new OperationImpl<V, NC, E, R>({
      ...this.state,
      steps: [...this.state.steps, { fn: pipelineFn }],
      initialContext: this.state.initialContext as NC | undefined,
      completeHandler: this.state.completeHandler as any,
    });
  }

  failsWith<NE extends Error>(errorClass: ErrorFactory<NE>, message: string): Operation<V, C, NE, R>;
  failsWith(message: string): Operation<V, C, Error, R>;
  failsWith<NE extends Error>(errorClassOrMessage: any, message?: string): Operation<V, C, NE, R> | Operation<V, C, Error, R> {
    if (typeof errorClassOrMessage === 'string') {
      const errorTransformer: ErrorTransformer<Error> = (originalError: Error) => 
        new Error(errorClassOrMessage, { cause: originalError });
      
      return new OperationImpl<V, C, Error, R>({
        ...this.state,
        errorTransformer,
        completeHandler: this.state.completeHandler as any,
      });
    } else {
      const errorTransformer: ErrorTransformer<NE> = (originalError: Error): NE => 
        new (errorClassOrMessage as ErrorFactory<NE>)(message!, { cause: originalError });
      
      return new OperationImpl<V, C, NE, R>({
        ...this.state,
        errorTransformer,
        completeHandler: this.state.completeHandler as any,
      });
    }
  }

  complete(): R extends AsyncResult<V, E> ? AsyncResult<V, E> : Promise<R> {
    const { completeHandler } = this.state;
    
    if (completeHandler) {
      return this.executePipeline().then(({ result, context }) => 
        completeHandler(result, context as C)
      ) as R extends AsyncResult<V, E> ? AsyncResult<V, E> : Promise<R>;
    }
    
    return this.executePipeline().then(({ result }) => result) as R extends AsyncResult<V, E> ? AsyncResult<V, E> : Promise<R>;
  }

  private async executePipeline(): Promise<{ result: Result<V, E>; context: C }> {
    const { steps, errorTransformer, initialValue, initialContext } = this.state;
    
    try {
      let currentValue: any = initialValue;
      let currentContext: any = initialContext;

      // Execute each step in sequence, checking for errors at each step.
      for (const { fn } of steps) {
        const [newContext, result] = await fn(currentContext, currentValue);
        const { err: error, res } = result;
        
        if (error !== undefined) {
          // Step failed - apply error transformation if configured
          return {
            result: err(errorTransformer ? errorTransformer(error) : error) as Result<V, E>,
            context: currentContext as C
          };
        }
        
        // Update both context and value from tuple
        currentContext = newContext;
        currentValue = res;
      }

      // All steps completed successfully
      return {
        result: ok(currentValue),
        context: currentContext as C
      };
    } catch (error) {
      // Unexpected error during execution
      const transformedError = errorTransformer 
        ? errorTransformer(error instanceof Error ? error : new Error(String(error)))
        : (error instanceof Error ? error : new Error(String(error)));
      return {
        result: err(transformedError) as Result<V, E>,
        context: initialContext as C
      };
    }
  }
}

/**
 * Creates a new operation pipeline
 * @param initialContext - Optional initial context for the pipeline
 * @param initialValue - Optional initial value to start the pipeline with
 * @returns A new operation instance
 */
export function operation<C = unknown, V = unknown>(initialContext?: C, initialValue?: V): TypedOperation<V, C, Error> {
  return new OperationImpl<V, C, Error>({
    steps: [],
    initialValue,
    initialContext,
  }) as TypedOperation<V, C, Error>;
}

/**
 * Creates a custom operation factory with a completion handler
 * @param completeHandler - Handler that receives result and context, returns custom type
 * @returns Factory function that creates operations with custom completion
 */
export function makeOperation<C = unknown, E extends Error = Error, R = any>(
  completeHandler: CompletionHandler<any, C, E, R>
): <V = unknown>(initialContext?: C, initialValue?: V) => Operation<V, C, E, Promise<R>> {
  return <V = unknown>(initialContext?: C, initialValue?: V) => {
    return new OperationImpl<V, C, E, Promise<R>>({
      steps: [],
      initialValue,
      initialContext,
      completeHandler: async (result: Result<V, E>, context: C) => completeHandler(result, context),
    });
  };
}
