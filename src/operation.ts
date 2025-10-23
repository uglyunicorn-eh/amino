import { type Result, type AsyncResult, ok, err } from './result.ts';

/**
 * Unified pipeline function signature - transforms both context and value
 * Context transformations always succeed, value transformations return Result
 * @param context - Current context
 * @param value - Current value
 * @returns Tuple of [new context, Result of new value]
 */
export type PipelineFunction<V, NV, C, NC> = (context: C, value: V) => [NC, Result<NV>] | Promise<[NC, Result<NV>]>;

/**
 * Error transformer signature - transforms errors
 * @param originalError - The original error
 * @returns New error instance
 */
type ErrorTransformer<E> = (originalError: Error) => E;

/**
 * Internal pipeline step representation using linked list
 */
type PipelineStep<V, NV, C, NC> = {
  fn: PipelineFunction<V, NV, C, NC>;
  next?: PipelineStep<any, any, any, any>;
};

/**
 * Operation interface - chainable pipeline builder
 * @param V - Value type
 * @param C - Context type  
 * @param E - Error type (must extend Error)
 * @param R - Return type of complete() method
 */
export interface Operation<V, C, E extends Error = Error, R = AsyncResult<V, E>> {
  /**
   * Add a processing step to the pipeline
   * @param fn - Step function that transforms the value
   * @returns New operation with updated value type
   */
  step<NV>(fn: (value: V, context: C) => Result<NV> | AsyncResult<NV>): Operation<NV, C, E, R>;

  /**
   * Add a context transformation step to the pipeline
   * @param fn - Context function that transforms the context (returns new context directly)
   * @returns New operation with updated context type
   */
  context<NC>(fn: (context: C, value: V) => NC): Operation<V, NC, E, R>;

  /**
   * Set error transformation for the operation with custom error class
   * @param errorClass - Error class constructor
   * @param message - Error message
   * @returns New operation with updated error type
   */
  failsWith<NE extends Error>(errorClass: new (message: string, cause?: Error) => NE, message: string): Operation<V, C, NE, R>;

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
 * Internal operation state
 */
type OperationState<V, C, E extends Error = Error, R = AsyncResult<V, E>> = {
  stepsHead?: PipelineStep<any, any, any, any>;
  stepsTail?: PipelineStep<any, any, any, any>;
  errorTransformer?: ErrorTransformer<E>;
  initialValue?: V;
  initialContext?: C;
  completeHandler?: (result: Result<V, E>, context: C) => R;
};

/**
 * Internal operation implementation class
 */
class OperationImpl<V, C, E extends Error = Error, R = AsyncResult<V, E>> implements Operation<V, C, E, R> {
  constructor(private state: OperationState<V, C, E, R>) {}

  step<NV>(fn: (value: V, context: C) => Result<NV> | AsyncResult<NV>): Operation<NV, C, E, R> {
    const { stepsHead, stepsTail, errorTransformer, initialValue, initialContext, completeHandler } = this.state;
    
    // Convert step function to unified pipeline function
    const pipelineFn: PipelineFunction<V, NV, C, C> = async (context: C, value: V) => {
      const result = fn(value, context);
      const awaited = (result && typeof (result as any).then === 'function') 
        ? await result 
        : result as Result<NV>;
      return [context, awaited]; // Context unchanged, result forwarded
    };

    // Create new step and append to linked list (O(1) operation with tail pointer)
    const newStep: PipelineStep<V, NV, C, C> = {
      fn: pipelineFn,
      next: undefined
    };

    let newHead = stepsHead;
    let newTail = newStep;

    if (stepsTail) {
      stepsTail.next = newStep;
      newTail = newStep;
    } else {
      newHead = newStep;
    }

    return new OperationImpl<NV, C, E, R>({
      stepsHead: newHead,
      stepsTail: newTail,
      errorTransformer,
      initialValue: initialValue as NV | undefined,
      initialContext,
      completeHandler: completeHandler as any,
    });
  }

  context<NC>(fn: (context: C, value: V) => NC): Operation<V, NC, E, R> {
    const { stepsHead, stepsTail, errorTransformer, initialValue, initialContext, completeHandler } = this.state;
    
    // Convert plain context function to unified pipeline function
    const pipelineFn: PipelineFunction<V, V, C, NC> = async (context: C, value: V) => 
      [fn(context, value), ok(value)]; // New context, value unchanged

    // Create new step and append to linked list (O(1) operation with tail pointer)
    const newStep: PipelineStep<V, V, C, NC> = {
      fn: pipelineFn,
      next: undefined
    };

    let newHead = stepsHead;
    let newTail = newStep;

    if (stepsTail) {
      stepsTail.next = newStep;
      newTail = newStep;
    } else {
      newHead = newStep;
    }

    return new OperationImpl<V, NC, E, R>({
      stepsHead: newHead,
      stepsTail: newTail,
      errorTransformer,
      initialValue,
      initialContext: initialContext as NC | undefined,
      completeHandler: completeHandler as any,
    });
  }

  failsWith<NE extends Error>(errorClass: new (message: string, cause?: Error) => NE, message: string): Operation<V, C, NE, R>;
  failsWith(message: string): Operation<V, C, Error, R>;
  failsWith<NE extends Error>(errorClassOrMessage: any, message?: string): Operation<V, C, NE, R> | Operation<V, C, Error, R> {
    const { stepsHead, stepsTail, initialValue, initialContext, completeHandler } = this.state;
    
    if (typeof errorClassOrMessage === 'string') {
      const errorTransformer: ErrorTransformer<Error> = (originalError: Error) => 
        new Error(errorClassOrMessage, { cause: originalError });
      
      return new OperationImpl<V, C, Error, R>({
        stepsHead,
        stepsTail,
        errorTransformer,
        initialValue,
        initialContext,
        completeHandler: completeHandler as any,
      });
    } else {
      const errorTransformer: ErrorTransformer<NE> = (originalError: Error): NE => 
        new (errorClassOrMessage as new (message: string, cause?: Error) => NE)(message!, originalError);
      
      return new OperationImpl<V, C, NE, R>({
        stepsHead,
        stepsTail,
        errorTransformer,
        initialValue,
        initialContext,
        completeHandler: completeHandler as any,
      });
    }
  }

  complete(): R extends AsyncResult<V, E> ? AsyncResult<V, E> : Promise<R> {
    const { completeHandler } = this.state;
    
    if (completeHandler) {
      return this.executePipeline().then(({ result, context }) => 
        completeHandler(result, context as C)
      ) as any;
    }
    
    return this.executePipeline().then(({ result }) => result) as any;
  }

  private async executePipeline(): Promise<{ result: Result<V, E>; context: any }> {
    const { stepsHead, errorTransformer, initialValue, initialContext } = this.state;
    
    try {
      let currentValue: any = initialValue;
      let currentContext: any = initialContext;

      // Execute each step in sequence by traversing the linked list
      let currentStep = stepsHead;
      while (currentStep) {
        const [newContext, result] = await currentStep.fn(currentContext, currentValue);
        const { err: error, res } = result;
        
        if (error !== undefined) {
          // Step failed - apply error transformation if configured
          return {
            result: err(errorTransformer ? errorTransformer(error) : error) as Result<V, E>,
            context: currentContext
          };
        }
        
        // Update both context and value from tuple
        currentContext = newContext;
        currentValue = res;
        
        // Move to next step
        currentStep = currentStep.next;
      }

      // All steps completed successfully
      return {
        result: ok(currentValue),
        context: currentContext
      };
    } catch (error) {
      // Unexpected error during execution
      const transformedError = errorTransformer 
        ? errorTransformer(error instanceof Error ? error : new Error(String(error)))
        : (error instanceof Error ? error : new Error(String(error)));
      return {
        result: err(transformedError) as Result<V, E>,
        context: initialContext
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
export function operation<C = unknown, V = unknown>(initialContext?: C, initialValue?: V): Operation<V, C, Error> {
  return new OperationImpl<V, C, Error>({
    stepsHead: undefined,
    stepsTail: undefined,
    initialValue,
    initialContext,
  });
}

/**
 * Creates a custom operation factory with a completion handler
 * @param completeHandler - Handler that receives result and context, returns custom type
 * @returns Factory function that creates operations with custom completion
 */
export function makeOperation<C = unknown, E extends Error = Error, R = any>(
  completeHandler: (result: Result<any, E>, context: C) => R
): <V = unknown>(initialContext?: C, initialValue?: V) => Operation<V, C, E, Promise<R>> {
  return <V = unknown>(initialContext?: C, initialValue?: V) => {
    return new OperationImpl<V, C, E, Promise<R>>({
      stepsHead: undefined,
      stepsTail: undefined,
      initialValue,
      initialContext,
      completeHandler: completeHandler as any,
    });
  };
}
