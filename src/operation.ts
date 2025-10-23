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
 * Internal pipeline step representation as linked list node
 */
type PipelineStep<V, NV, C, NC> = {
  fn: PipelineFunction<V, NV, C, NC>;
  next?: PipelineStep<any, any, any, any>;
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
  head?: PipelineStep<any, any, any, any>;
  tail?: PipelineStep<any, any, any, any>;
  errorTransformer?: ErrorTransformer<E>;
  initialValue?: V;
  initialContext?: C;
  completeHandler?: CompletionHandler<V, C, E, R>;
};

/**
 * Internal operation implementation class with mutable state for lazy evaluation
 */
class OperationImpl<V, C, E extends Error = Error, R = AsyncResult<V, E>> implements Operation<V, C, E, R> {
  private state: OperationState<V, C, E, R>;

  constructor(state?: OperationState<V, C, E, R>) {
    // Copy the state object to avoid external mutations
    this.state = state ? { ...state } : {};
  }

  /**
   * Appends a new node to the pipeline linked list in O(1) time using tail pointer
   */
  private appendToPipeline<V, NV, C, NC>(step: PipelineStep<V, NV, C, NC>): void {
    const { tail } = this.state;
    if (tail) {
      tail.next = step;
      this.state.tail = step;
    } else {
      this.state.head = step;
      this.state.tail = step;
    }
  }

  step<NV>(fn: StepFunction<V, C, NV>): Operation<NV, C, E, R> {
    const pipelineFn: PipelineFunction<V, NV, C, C> = async (context: C, value: V) => 
      [context, await awaitResult(fn(value, context))];
    
    this.appendToPipeline({ fn: pipelineFn });
    
    return this as unknown as Operation<NV, C, E, R>;
  }

  context<NC>(fn: ContextFunction<C, V, NC>): Operation<V, NC, E, R> {
    const pipelineFn: PipelineFunction<V, V, C, NC> = async (context: C, value: V) => 
      [await awaitResult(fn(context, value)), ok(value)];
    
    this.appendToPipeline({ fn: pipelineFn });
    
    return this as unknown as Operation<V, NC, E, R>;
  }

  failsWith<NE extends Error>(errorClass: ErrorFactory<NE>, message: string): Operation<V, C, NE, R>;
  failsWith(message: string): Operation<V, C, Error, R>;
  failsWith<NE extends Error>(errorClassOrMessage: any, message?: string): Operation<V, C, NE, R> | Operation<V, C, Error, R> {
    if (typeof errorClassOrMessage === 'string') {
      this.state.errorTransformer = (originalError: Error) => 
        new Error(errorClassOrMessage, { cause: originalError }) as E;
    } else {
      this.state.errorTransformer = (originalError: Error): E => 
        new (errorClassOrMessage as ErrorFactory<NE>)(message!, { cause: originalError }) as unknown as E;
    }
    
    return this as unknown as Operation<V, C, NE, R>;
  }

  /**
   * Creates a failure result using the configured error factory
   */
  private failure(error: unknown): Result<V, E> {
    const { errorTransformer } = this.state;
    const normalizedError = error instanceof Error ? error : new Error(String(error));
    return err(errorTransformer ? errorTransformer(normalizedError) : normalizedError) as Result<V, E>;
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

  /**
   * Executes a single pipeline step and returns the result
   */
  private async executeStep(currentStep: PipelineStep<any, any, any, any>, currentContext: any, currentValue: any): Promise<{ newContext: any; newValue: any; error?: any }> {
    const [newContext, result] = await currentStep.fn(currentContext, currentValue);
    const { err: error, res } = result;
    
    if (error !== undefined) {
      return { newContext: currentContext, newValue: currentValue, error };
    }
    
    return { newContext, newValue: res };
  }

  private async executePipeline(): Promise<{ result: Result<V, E>; context: C }> {
    const { initialValue, initialContext, head } = this.state;
    
    try {
      let currentValue: any = initialValue;
      let currentContext: any = initialContext;

      // Execute each step in sequence
      let currentStep = head;
      while (currentStep) {
        const { newContext, newValue, error } = await this.executeStep(currentStep, currentContext, currentValue);
        
        if (error !== undefined) {
          return {
            result: this.failure(error),
            context: currentContext as C
          };
        }
        
        currentContext = newContext;
        currentValue = newValue;
        currentStep = currentStep.next;
      }

      // All steps completed successfully
      return {
        result: ok(currentValue),
        context: currentContext as C
      };
    } catch (error) {
      // Unexpected error during execution
      return {
        result: this.failure(error),
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
      initialValue,
      initialContext,
      completeHandler: async (result: Result<V, E>, context: C) => completeHandler(result, context),
    });
  };
}
