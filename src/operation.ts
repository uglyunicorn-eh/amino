import { type Result, type AsyncResult, ok, err } from './result.ts';

/**
 * Unified pipeline function signature - transforms both context and value
 * @param context - Current context
 * @param value - Current value
 * @returns Result or AsyncResult with new context and new value
 */
export type PipelineFunction<V, NV, C, NC> = (context: C, value: V) => Result<{ context: NC; value: NV }> | AsyncResult<{ context: NC; value: NV }>;

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
 * Operation interface - chainable pipeline builder
 * @param V - Value type
 * @param C - Context type  
 * @param E - Error type (must extend Error)
 */
export interface Operation<V, C, E extends Error = Error> {
  /**
   * Add a processing step to the pipeline
   * @param fn - Step function that transforms the value
   * @returns New operation with updated value type
   */
  step<NV>(fn: (value: V, context: C) => Result<NV> | AsyncResult<NV>): Operation<NV, C, E>;

  /**
   * Add a context transformation step to the pipeline
   * @param fn - Context function that transforms the context (returns new context directly)
   * @returns New operation with updated context type
   */
  context<NC>(fn: (context: C, value: V) => NC): Operation<V, NC, E>;

  /**
   * Set error transformation for the operation with custom error class
   * @param errorClass - Error class constructor
   * @param message - Error message
   * @returns New operation with updated error type
   */
  failsWith<NE extends Error>(errorClass: new (message: string, cause?: Error) => NE, message: string): Operation<V, C, NE>;

  /**
   * Set error transformation for the operation with generic error
   * @param message - Error message string
   * @returns New operation with updated error type
   */
  failsWith(message: string): Operation<V, C, Error>;

  /**
   * Execute the pipeline and return the final result
   * @returns AsyncResult with final value or error
   */
  complete(): AsyncResult<V, E>;
}

/**
 * Internal operation state
 */
type OperationState<V, C, E extends Error = Error> = {
  steps: PipelineStep<any, any, any, any>[];
  errorTransformer?: ErrorTransformer<E>;
  initialValue?: V;
  initialContext?: C;
};

/**
 * Internal operation implementation class
 */
class OperationImpl<V, C, E extends Error = Error> implements Operation<V, C, E> {
  constructor(private state: OperationState<V, C, E>) {}

  step<NV>(fn: (value: V, context: C) => Result<NV> | AsyncResult<NV>): Operation<NV, C, E> {
    const { steps, errorTransformer, initialValue, initialContext } = this.state;
    
    // Convert step function to unified pipeline function
    const pipelineFn: PipelineFunction<V, NV, C, C> = async (context: C, value: V) => {
      const result = fn(value, context);
      const awaited = (result && typeof (result as any).then === 'function') ? await result : result;
      const { err: error, res } = awaited;
      return error !== undefined ? err(error) : ok({ context, value: res });
    };

    const newSteps = [...steps, { fn: pipelineFn }];
    return new OperationImpl<NV, C, E>({
      steps: newSteps,
      errorTransformer,
      initialValue: initialValue as NV | undefined,
      initialContext,
    });
  }

  context<NC>(fn: (context: C, value: V) => NC): Operation<V, NC, E> {
    const { steps, errorTransformer, initialValue, initialContext } = this.state;
    
    // Convert plain context function to unified pipeline function
    const pipelineFn: PipelineFunction<V, V, C, NC> = async (context: C, value: V) => 
      ok({ context: fn(context, value), value });

    const newSteps = [...steps, { fn: pipelineFn }];
    return new OperationImpl<V, NC, E>({
      steps: newSteps,
      errorTransformer,
      initialValue,
      initialContext: initialContext as NC | undefined,
    });
  }

  failsWith<NE extends Error>(errorClass: new (message: string, cause?: Error) => NE, message: string): Operation<V, C, NE>;
  failsWith(message: string): Operation<V, C, Error>;
  failsWith<NE extends Error>(errorClassOrMessage: any, message?: string): Operation<V, C, NE> | Operation<V, C, Error> {
    const { steps, initialValue, initialContext } = this.state;
    
    if (typeof errorClassOrMessage === 'string') {
      const errorTransformer: ErrorTransformer<Error> = (originalError: Error) => 
        new Error(errorClassOrMessage, { cause: originalError });
      
      return new OperationImpl<V, C, Error>({
        steps,
        errorTransformer,
        initialValue,
        initialContext,
      });
    } else {
      const errorTransformer: ErrorTransformer<NE> = (originalError: Error): NE => 
        new (errorClassOrMessage as new (message: string, cause?: Error) => NE)(message!, originalError);
      
      return new OperationImpl<V, C, NE>({
        steps,
        errorTransformer,
        initialValue,
        initialContext,
      });
    }
  }

  complete(): AsyncResult<V, E> {
    return this.executePipeline();
  }

  private async executePipeline(): Promise<Result<V, E>> {
    const { steps, errorTransformer, initialValue, initialContext } = this.state;
    
    try {
      let currentValue: any = initialValue;
      let currentContext: any = initialContext;

      // Execute each step in sequence, checking for errors at each step.
      for (const { fn } of steps) {
        const { err: error, res } = await fn(currentContext, currentValue);
        
        if (error !== undefined) {
          // Step failed - apply error transformation if configured
          return err(errorTransformer ? errorTransformer(error) : error) as Result<V, E>;
        }
        
        // Update both context and value from unified result
        const { context, value } = res;
        currentContext = context;
        currentValue = value;
      }

      // All steps completed successfully
      return ok(currentValue);
    } catch (error) {
      // Unexpected error during execution
      const transformedError = errorTransformer
        ? errorTransformer(error instanceof Error ? error : new Error(String(error)))
        : (error instanceof Error ? error : new Error(String(error)));
      return err(transformedError) as Result<V, E>;
    }
  }
}

/**
 * Creates a new operation pipeline
 * @param initialValue - Optional initial value to start the pipeline with
 * @param initialContext - Optional initial context for the pipeline
 * @returns A new operation instance
 */
export function operation<V = unknown, C = unknown>(initialValue?: V, initialContext?: C): Operation<V, C, Error> {
  return new OperationImpl<V, C, Error>({
    steps: [],
    initialValue,
    initialContext,
  });
}
