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
 * Extension operation interface - Operation with a single action method
 */
export type ExtensionOperation<V, Ctx, ActionName extends string, ActionResult, E extends Error = Error> = 
  Operation<V, Ctx, E> & {
    [K in ActionName]: () => Promise<ActionResult>;
  };

/**
 * Extension builder interface - allows registering ONE action
 */
export interface ExtensionBuilder<CtxArg, Ctx> {
  /**
   * Register a single action handler
   * @param name - Action name (becomes a method name on the extension)
   * @param handler - Handler function that receives context and result
   * @returns Factory function for creating extension operations
   */
  action<ActionName extends string, ResultType>(
    name: ActionName,
    handler: ActionHandler<Ctx, any, ResultType>
  ): (arg: CtxArg) => ExtensionOperation<any, Ctx, ActionName, ResultType, Error> | Promise<ExtensionOperation<any, Ctx, ActionName, ResultType, Error>>;
}

/**
 * Factory function for creating extensions with a single action
 * @param contextFactory - Function that creates context from arguments
 * @returns Builder that allows registering one action
 */
export function makeOperation<CtxArg, Ctx>(
  contextFactory: (arg: CtxArg) => Ctx | Promise<Ctx>
): ExtensionBuilder<CtxArg, Ctx> {
  // Return builder with action method
  const builder: ExtensionBuilder<CtxArg, Ctx> = {
    action<ActionName extends string, ResultType>(
      name: ActionName,
      handler: ActionHandler<Ctx, any, ResultType>
    ): (arg: CtxArg) => ExtensionOperation<any, Ctx, ActionName, ResultType, Error> | Promise<ExtensionOperation<any, Ctx, ActionName, ResultType, Error>> {
      // Return factory that creates extension operations
      return (arg: CtxArg): ExtensionOperation<any, Ctx, ActionName, ResultType, Error> | Promise<ExtensionOperation<any, Ctx, ActionName, ResultType, Error>> => {
        const ctx = contextFactory(arg);
        
        if (ctx instanceof Promise) {
          return ctx.then(resolvedCtx => createExtensionOperation(resolvedCtx, name, handler));
        }
        
        return createExtensionOperation(ctx, name, handler);
      };
    }
  };
  
  return builder;
}

/**
 * Create an extension operation with a single action
 * Uses property assignment instead of Proxy for simplicity
 */
function createExtensionOperation<V, Ctx, ActionName extends string, ActionResult>(
  initialContext: Ctx,
  actionName: ActionName,
  handler: ActionHandler<Ctx, any, ActionResult>
): ExtensionOperation<V, Ctx, ActionName, ActionResult, Error> {
  // Create base operation
  const baseOp = operation<V, Ctx>(initialContext, undefined);
  
  // Add the action method via property assignment
  Object.defineProperty(baseOp, actionName, {
    value: async function() {
      const result = await baseOp.complete();
      return handler(initialContext, result);
    },
    writable: false,
    enumerable: true,
    configurable: false
  });
  
  return baseOp as ExtensionOperation<V, Ctx, ActionName, ActionResult, Error>;
}
