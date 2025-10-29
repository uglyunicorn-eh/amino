import { type Operation, operation } from './operation.ts';
import { type Result } from './result.ts';

/**
 * Action handler signature - called when an action method is invoked
 * @param context - Final context from the pipeline
 * @param result - The final result from the pipeline
 * @returns Action-specific result
 */
export type ActionHandler<C, V, R> = (context: C, result: Result<V, Error>) => R | Promise<R>;

/**
 * Registry of action handlers by name
 */
type ActionRegistry = Map<string, ActionHandler<any, any, any>>;

/**
 * Acid operation factory signature
 * @param contextArg - Argument to the context factory
 * @returns Acid operation with registered actions
 */
export type AcidFactory<CtxArg, Ctx> = ((arg: CtxArg) => AcidOperation<any, Ctx, Error>) & AcidBuilder<Ctx>;

/**
 * Acid operation interface - Operation with dynamic action methods
 */
export interface AcidOperation<V, Ctx, E extends Error = Error> extends Operation<V, Ctx, E> {
  // Dynamic methods will be added via Proxy
}

/**
 * Acid builder interface - allows registering actions
 */
export interface AcidBuilder<Ctx> {
  /**
   * Register an action handler
   * @param name - Action name (becomes a method name on the acid operation)
   * @param handler - Handler function that receives context and result
   * @returns Factory function for creating acid operations with registered actions
   */
  action<ActionName extends string, ResultType>(
    name: ActionName,
    handler: ActionHandler<Ctx, any, ResultType>
  ): AcidBuilder<Ctx>;
}

/**
 * Factory function for creating extensible operations (acids)
 * @param contextFactory - Function that creates context from arguments
 * @returns Factory function that can register actions and create acid operations
 */
export function makeOperation<CtxArg, Ctx>(
  contextFactory: (arg: CtxArg) => Ctx | Promise<Ctx>
): AcidBuilder<Ctx> {
  const actions: ActionRegistry = new Map();
  
  // Create the callable factory function
  const factory = function(arg: CtxArg): AcidOperation<any, Ctx, Error> {
    const ctx = contextFactory(arg);
    
    if (ctx instanceof Promise) {
      return ctx.then(resolvedCtx => createAcidOperation(resolvedCtx, actions)) as any;
    }
    
    return createAcidOperation(ctx, actions);
  };
  
  // Add the builder methods
  factory.action = function<ActionName extends string, ResultType>(
    name: ActionName,
    handler: ActionHandler<Ctx, any, ResultType>
  ): AcidBuilder<Ctx> {
    actions.set(name, handler);
    return factory as any as AcidBuilder<Ctx>;
  };
  
  return factory as any as AcidBuilder<Ctx>;
}

/**
 * Create an acid operation with the given context and registered actions
 */
function createAcidOperation<V, Ctx, E extends Error = Error>(
  initialContext: Ctx,
  actions: ActionRegistry
): AcidOperation<V, Ctx, E> {
  let currentOp: Operation<any, Ctx, any> = operation<V, Ctx>(initialContext, undefined);
  
  const proxy = new Proxy({} as any, {
    get(target, prop) {
      // Check if it's a registered action
      if (typeof prop === 'string' && actions.has(prop)) {
        return async function() {
          const handler = actions.get(prop);
          if (!handler) {
            throw new Error(`Unknown action: ${prop}`);
          }
          
          // Execute the pipeline to get result and final context
          const result = await currentOp.complete();
          
          // Get the final context from the operation's internal state
          const finalContext = await getFinalContext(currentOp, initialContext);
          
          return handler(finalContext, result);
        };
      }
      
      // Special handling for chaining methods
      if (prop === 'step' || prop === 'context' || prop === 'failsWith') {
        return function(...args: any[]): any {
          const method = Reflect.get(currentOp, prop);
          const result = (method as any).apply(currentOp, args);
          currentOp = result as Operation<any, Ctx, any>;
          return proxy;
        };
      }
      
      // Delegate to current operation
      const value = Reflect.get(currentOp, prop);
      
      // If it's a method, bind it properly
      if (typeof value === 'function') {
        return value.bind(currentOp);
      }
      
      return value;
    }
  });
  
  return proxy as AcidOperation<V, Ctx, E>;
}

/**
 * Get the final context after executing the pipeline
 */
async function getFinalContext<V, Ctx, E extends Error = Error>(
  op: Operation<V, Ctx, E>,
  initialContext: Ctx
): Promise<Ctx> {
  try {
    // Access the internal implementation
    const impl = op as any;
    const state = impl.state;
    
    if (!state || !state.steps) {
      return initialContext;
    }
    
    // Execute the pipeline to get the final context
    const { steps } = state;
    let currentContext: any = initialContext;
    let currentValue: any = state.initialValue;
    
    for (const step of steps) {
      const [newContext, result] = await step(currentContext, currentValue);
      const { err: error, res } = result;
      
      if (error !== undefined) {
        return currentContext;
      }
      
      currentContext = newContext;
      currentValue = res;
    }
    
    return currentContext;
  } catch {
    // If we can't get the final context, return the initial context
    return initialContext;
  }
}
