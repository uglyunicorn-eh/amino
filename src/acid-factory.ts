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
export type AcidFactory<CtxArg, Ctx> = AcidBuilder<CtxArg, Ctx>;

/**
 * Acid operation interface - Operation with dynamic action methods
 */
export interface AcidOperation<V, Ctx, E extends Error = Error> extends Operation<V, Ctx, E> {
  // Dynamic methods will be added via Proxy
}

/**
 * Acid builder interface - allows registering actions
 */
export interface AcidBuilder<CtxArg, Ctx> {
  /**
   * Register an action handler
   * @param name - Action name (becomes a method name on the acid operation)
   * @param handler - Handler function that receives context and result
   * @returns Factory function for creating acid operations with registered actions
   */
  action<ActionName extends string, ResultType>(
    name: ActionName,
    handler: ActionHandler<Ctx, any, ResultType>
  ): AcidBuilder<CtxArg, Ctx>;
  
  /**
   * Call the factory with a context argument
   */
  (arg: CtxArg): AcidOperation<any, Ctx, Error>;
}

/**
 * Factory function for creating extensible operations (acids)
 * @param contextFactory - Function that creates context from arguments
 * @returns Factory function that can register actions and create acid operations
 */
export function makeOperation<CtxArg, Ctx>(
  contextFactory: (arg: CtxArg) => Ctx | Promise<Ctx>
): AcidBuilder<CtxArg, Ctx> {
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
  ): AcidBuilder<CtxArg, Ctx> {
    actions.set(name, handler);
    return factory as any as AcidBuilder<CtxArg, Ctx>;
  };
  
  return factory as any as AcidBuilder<CtxArg, Ctx>;
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
          const handler = actions.get(prop)!; // Safe because actions.has(prop) is true
          
          // Execute the pipeline to get result
          const result = await currentOp.complete();
          
          // Return the initial context (context transforms are handled internally by the operation)
          return handler(initialContext, result);
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
