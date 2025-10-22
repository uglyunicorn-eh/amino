import { type Result, type AsyncResult, ok, err } from './result.ts';

/**
 * Step function signature - transforms value while preserving context
 * @param value - Current value
 * @param context - Current context
 * @returns Result or AsyncResult with new value
 */
export type StepFunction<V, NV, C> = (value: V, context: C) => Result<NV> | AsyncResult<NV>;

/**
 * Context function signature - transforms context while preserving value
 * @param context - Current context
 * @param value - Current value
 * @returns Result or AsyncResult with new context
 */
export type ContextFunction<V, C, NC> = (context: C, value: V) => Result<NC> | AsyncResult<NC>;

/**
 * Error transformer signature - transforms errors
 * @param originalError - The original error
 * @returns New error instance
 */
type ErrorTransformer<E> = (originalError: Error) => E;

/**
 * Internal step representation for the pipeline
 */
type PipelineStep<V, NV, C> = {
  type: 'step';
  fn: StepFunction<V, NV, C>;
};

/**
 * Internal context step representation for the pipeline
 */
type PipelineContextStep<V, C, NC> = {
  type: 'context';
  fn: ContextFunction<V, C, NC>;
};

/**
 * Union type for all pipeline steps
 */
type AnyPipelineStep = PipelineStep<any, any, any> | PipelineContextStep<any, any, any>;

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
  step<NV>(fn: StepFunction<V, NV, C>): Operation<NV, C, E>;

  /**
   * Add a context transformation step to the pipeline
   * @param fn - Context function that transforms the context
   * @returns New operation with updated context type
   */
  context<NC>(fn: ContextFunction<V, C, NC>): Operation<V, NC, E>;

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
  steps: AnyPipelineStep[];
  errorTransformer?: ErrorTransformer<E>;
  initialValue?: V;
  initialContext?: C;
};

/**
 * Internal operation implementation class
 */
class OperationImpl<V, C, E = Error> implements Operation<V, C, E> {
  constructor(private state: OperationState<V, C, E>) {}

  step<NV>(fn: StepFunction<V, NV, C>): Operation<NV, C, E> {
    const newSteps = [...this.state.steps, { type: 'step' as const, fn } as PipelineStep<V, NV, C>];
    return new OperationImpl<NV, C, E>({
      steps: newSteps,
      errorTransformer: this.state.errorTransformer,
      initialValue: this.state.initialValue, // Preserve the initial value
      initialContext: this.state.initialContext,
    });
  }

  context<NC>(fn: ContextFunction<V, C, NC>): Operation<V, NC, E> {
    const newSteps = [...this.state.steps, { type: 'context' as const, fn } as PipelineContextStep<V, C, NC>];
    return new OperationImpl<V, NC, E>({
      steps: newSteps,
      errorTransformer: this.state.errorTransformer,
      initialValue: this.state.initialValue,
      initialContext: this.state.initialContext, // Preserve the initial context
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

      // Execute each step in sequence
      for (const step of this.state.steps) {
        if (step.type === 'step') {
          // Execute step function
          const result = await step.fn(currentValue, currentContext);
          
          if (result.err !== undefined) {
            // Step failed - apply error transformation if configured
            const error = this.state.errorTransformer 
              ? this.state.errorTransformer(result.err)
              : result.err;
            return err(error) as Result<V, E>;
          }
          
          currentValue = result.res;
        } else if (step.type === 'context') {
          // Execute context function
          const result = await step.fn(currentContext, currentValue);
          
          if (result.err !== undefined) {
            // Context update failed - apply error transformation if configured
            const error = this.state.errorTransformer 
              ? this.state.errorTransformer(result.err)
              : result.err;
            return err(error) as Result<V, E>;
          }
          
          currentContext = result.res;
        }
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
