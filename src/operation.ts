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
 * @param E - Error type
 */
export interface Operation<V, C, E = Error> {
  /**
   * Add a processing step to the pipeline
   * @param fn - Step function that transforms the value
   * @returns New operation with updated value type
   */
  step<NV>(fn: (value: V, context: C) => Result<NV> | AsyncResult<NV>): Operation<NV, C, E>;

  /**
   * Add a context transformation step to the pipeline
   * @param fn - Context function that transforms the context
   * @returns New operation with updated context type
   */
  context<NC>(fn: (context: C, value: V) => Result<NC> | AsyncResult<NC>): Operation<V, NC, E>;

  /**
   * Set error transformation for the operation
   * @param errorClassOrMessage - Error class constructor or message string
   * @param message - Error message (required when errorClassOrMessage is a constructor)
   * @returns New operation with updated error type
   */
  failsWith<NE>(errorClassOrMessage: new (message: string, cause?: Error) => NE | string, message?: string): Operation<V, C, NE> | Operation<V, C, Error>;

  /**
   * Execute the pipeline and return the final result
   * @returns AsyncResult with final value or error
   */
  complete(): AsyncResult<V, E>;
}

/**
 * Internal operation state
 */
type OperationState<V, C, E = Error> = {
  steps: PipelineStep<any, any, any, any>[];
  errorTransformer?: ErrorTransformer<E>;
  initialValue?: V;
  initialContext?: C;
};

/**
 * Internal operation implementation class
 */
class OperationImpl<V, C, E = Error> implements Operation<V, C, E> {
  constructor(private state: OperationState<V, C, E>) {}

  step<NV>(fn: (value: V, context: C) => Result<NV> | AsyncResult<NV>): Operation<NV, C, E> {
    // Convert step function to unified pipeline function
    const pipelineFn: PipelineFunction<V, NV, C, C> = async (context: C, value: V) => {
      const result = await fn(value, context);
      if (result.err !== undefined) {
        return err(result.err);
      }
      return ok({ context, value: result.res });
    };

    const newSteps = [...this.state.steps, { fn: pipelineFn }];
    return new OperationImpl<NV, C, E>({
      steps: newSteps,
      errorTransformer: this.state.errorTransformer,
      initialValue: this.state.initialValue as NV | undefined,
      initialContext: this.state.initialContext,
    });
  }

  context<NC>(fn: (context: C, value: V) => Result<NC> | AsyncResult<NC>): Operation<V, NC, E> {
    // Convert context function to unified pipeline function
    const pipelineFn: PipelineFunction<V, V, C, NC> = async (context: C, value: V) => {
      const result = await fn(context, value);
      if (result.err !== undefined) {
        return err(result.err);
      }
      return ok({ context: result.res, value });
    };

    const newSteps = [...this.state.steps, { fn: pipelineFn }];
    return new OperationImpl<V, NC, E>({
      steps: newSteps,
      errorTransformer: this.state.errorTransformer,
      initialValue: this.state.initialValue,
      initialContext: this.state.initialContext as NC | undefined,
    });
  }

  failsWith<NE>(errorClassOrMessage: new (message: string, cause?: Error) => NE | string, message?: string): Operation<V, C, NE> | Operation<V, C, Error> {
    if (typeof errorClassOrMessage === 'string') {
      // Generic error with message
      const errorTransformer: ErrorTransformer<Error> = (originalError: Error) => {
        return new Error(errorClassOrMessage, { cause: originalError });
      };
      
      return new OperationImpl<V, C, Error>({
        steps: this.state.steps,
        errorTransformer,
        initialValue: this.state.initialValue,
        initialContext: this.state.initialContext,
      });
    } else {
      // Custom error class with message
      const errorTransformer: ErrorTransformer<NE> = (originalError: Error): NE => {
        return new (errorClassOrMessage as new (message: string, cause?: Error) => NE)(message!, originalError);
      };
      
      return new OperationImpl<V, C, NE>({
        steps: this.state.steps,
        errorTransformer,
        initialValue: this.state.initialValue,
        initialContext: this.state.initialContext,
      });
    }
  }

  complete(): AsyncResult<V, E> {
    return this.executePipeline();
  }

  private async executePipeline(): Promise<Result<V, E>> {
    try {
      let currentValue: any = this.state.initialValue;
      let currentContext: any = this.state.initialContext;

      // Execute each step in sequence - no if statements needed!
      for (const step of this.state.steps) {
        const result = await step.fn(currentContext, currentValue);
        
        if (result.err !== undefined) {
          // Step failed - apply error transformation if configured
          const error = this.state.errorTransformer 
            ? this.state.errorTransformer(result.err)
            : result.err;
          return err(error) as Result<V, E>;
        }
        
        // Update both context and value from unified result
        currentContext = result.res.context;
        currentValue = result.res.value;
      }

      // All steps completed successfully
      return ok(currentValue);
    } catch (error) {
      // Unexpected error during execution
      const transformedError = this.state.errorTransformer 
        ? this.state.errorTransformer(error instanceof Error ? error : new Error(String(error)))
        : (error instanceof Error ? error : new Error(String(error)));
      return err(transformedError) as Result<V, E>;
    }
  }
}

/**
 * Creates a new operation pipeline
 * @param initialValue - Initial value to start the pipeline with
 * @param initialContext - Initial context for the pipeline
 * @returns A new operation instance
 */
export function operation<V, C>(initialValue: V, initialContext: C): Operation<V, C, Error> {
  return new OperationImpl<V, C, Error>({
    steps: [],
    initialValue,
    initialContext,
  });
}
