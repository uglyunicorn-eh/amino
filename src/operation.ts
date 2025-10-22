import { type Result, type AsyncResult } from './result.ts';

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
export type ErrorTransformer<E> = (originalError: Error) => E;

/**
 * Internal step representation for the pipeline
 */
export type PipelineStep<V, NV, C> = {
  type: 'step';
  fn: StepFunction<V, NV, C>;
};

/**
 * Internal context step representation for the pipeline
 */
export type PipelineContextStep<V, C, NC> = {
  type: 'context';
  fn: ContextFunction<V, C, NC>;
};

/**
 * Union type for all pipeline steps
 */
export type AnyPipelineStep = PipelineStep<any, any, any> | PipelineContextStep<any, any, any>;

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
   * @param errorClass - Error class constructor
   * @param message - Error message
   * @returns New operation with updated error type
   */
  failsWith<NE>(errorClass: new (message: string, cause?: Error) => NE, message: string): Operation<V, C, NE>;

  /**
   * Set error transformation for the operation (generic Error)
   * @param message - Error message
   * @returns New operation with Error type
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
export type OperationState<V, C, E = Error> = {
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
      initialValue: undefined, // Will be set during execution
      initialContext: this.state.initialContext,
    });
  }

  context<NC>(fn: ContextFunction<V, C, NC>): Operation<V, NC, E> {
    const newSteps = [...this.state.steps, { type: 'context' as const, fn } as PipelineContextStep<V, C, NC>];
    return new OperationImpl<V, NC, E>({
      steps: newSteps,
      errorTransformer: this.state.errorTransformer,
      initialValue: this.state.initialValue,
      initialContext: undefined, // Will be set during execution
    });
  }

  failsWith<NE>(errorClass: new (message: string, cause?: Error) => NE, message: string): Operation<V, C, NE>;
  failsWith(message: string): Operation<V, C, Error>;
  failsWith<NE>(errorClassOrMessage: new (message: string, cause?: Error) => NE | string, message?: string): Operation<V, C, NE> | Operation<V, C, Error> {
    if (typeof errorClassOrMessage === 'string') {
      // Generic error with message
      const errorTransformer: ErrorTransformer<Error> = (originalError: Error) => {
        const newError = new Error(errorClassOrMessage);
        newError.cause = originalError;
        return newError;
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
        return new errorClassOrMessage(message!, originalError);
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
    // For now, return a placeholder - we'll implement execution in Step 6
    throw new Error('Pipeline execution not yet implemented');
  }
}

/**
 * Creates a new operation pipeline
 * @returns A new operation instance
 */
export function operation(): Operation<any, any, Error> {
  return new OperationImpl<any, any, Error>({
    steps: [],
  });
}
