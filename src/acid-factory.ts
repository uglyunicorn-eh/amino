import { type Operation, type ErrorFactory, operation } from './operation.ts';
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
 * Overrides step, context, and failsWith to preserve the extension action
 */
export type ExtensionOperation<V, Ctx, ActionName extends string, ActionResult, E extends Error = Error> = 
  Omit<Operation<V, Ctx, E>, 'step' | 'context' | 'failsWith'> & {
    step<NV>(fn: Parameters<Operation<V, Ctx, E>['step']>[0]): ExtensionOperation<NV, Ctx, ActionName, ActionResult, E>;
    context<NC>(fn: Parameters<Operation<V, Ctx, E>['context']>[0]): ExtensionOperation<V, NC, ActionName, ActionResult, E>;
    failsWith<NE extends Error>(errorClass: ErrorFactory<NE>, message: string): ExtensionOperation<V, Ctx, ActionName, ActionResult, NE>;
    failsWith(message: string): ExtensionOperation<V, Ctx, ActionName, ActionResult, Error>;
  } & {
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
  ): (arg: CtxArg) => ExtensionOperation<any, Ctx, ActionName, ResultType, Error>;
}

/**
 * Factory function for creating extensions with a single action
 * @param contextFactory - Function that creates context from arguments (must be synchronous)
 * @returns Builder that allows registering one action
 */
export function makeOperation<CtxArg, Ctx>(
  contextFactory: (arg: CtxArg) => Ctx
): ExtensionBuilder<CtxArg, Ctx> {
  // Return builder with action method
  const builder: ExtensionBuilder<CtxArg, Ctx> = {
    action<ActionName extends string, ResultType>(
      name: ActionName,
      handler: ActionHandler<Ctx, any, ResultType>
    ): (arg: CtxArg) => ExtensionOperation<any, Ctx, ActionName, ResultType, Error> {
      // Return factory that creates extension operations
      return (arg: CtxArg): ExtensionOperation<any, Ctx, ActionName, ResultType, Error> => {
        const ctx = contextFactory(arg);
        return createExtensionOperation(ctx, name, handler);
      };
    }
  };
  
  return builder;
}

/**
 * Create an extension operation with a single action
 * Overrides chaining methods to preserve the extension action
 */
function createExtensionOperation<V, Ctx, ActionName extends string, ActionResult>(
  initialContext: Ctx,
  actionName: ActionName,
  handler: ActionHandler<Ctx, any, ActionResult>
): ExtensionOperation<V, Ctx, ActionName, ActionResult, Error> {
  // Create base operation
  const baseOp = operation<V, Ctx>(initialContext, undefined);
  
  // Helper to add extension action to any operation
  const addExtensionAction = <NV, NC, NE extends Error>(
    op: Operation<NV, NC, NE>
  ): ExtensionOperation<NV, NC, ActionName, ActionResult, NE> => {
    // Check if property already exists (might have been added already)
    if (!(actionName in op)) {
      Object.defineProperty(op, actionName, {
        value: async function() {
          const result = await (op as Operation<NV, NC, NE>).complete();
          return handler(initialContext, result);
        },
        writable: false,
        enumerable: true,
        configurable: true // Allow reconfiguration if needed
      });
    }
    return op as ExtensionOperation<NV, NC, ActionName, ActionResult, NE>;
  };
  
  // Override step to preserve extension action with correct typing
  const originalStep = baseOp.step.bind(baseOp);
  (baseOp as any).step = function<NV>(fn: Parameters<typeof baseOp.step>[0]): ExtensionOperation<NV, Ctx, ActionName, ActionResult, Error> {
    const newOp = originalStep(fn) as Operation<NV, Ctx, Error>;
    return addExtensionAction(newOp);
  };
  
  // Override context to preserve extension action with correct typing
  const originalContext = baseOp.context.bind(baseOp);
  (baseOp as any).context = function<NC>(fn: Parameters<typeof baseOp.context>[0]): ExtensionOperation<V, NC, ActionName, ActionResult, Error> {
    const newOp = originalContext(fn) as Operation<V, NC, Error>;
    return addExtensionAction(newOp);
  };
  
  // Override failsWith to preserve extension action (two overloads) with correct typing
  const originalFailsWith = baseOp.failsWith.bind(baseOp);
  (baseOp as any).failsWith = function<NE extends Error>(
    arg1: ErrorFactory<NE> | string,
    arg2?: string
  ): ExtensionOperation<V, Ctx, ActionName, ActionResult, NE> {
    let newOp: Operation<any, any, any>;
    if (typeof arg1 === 'string') {
      newOp = originalFailsWith(arg1);
    } else {
      newOp = originalFailsWith(arg1, arg2!);
    }
    return addExtensionAction(newOp);
  };
  
  // Add the action method
  addExtensionAction(baseOp);
  
  return baseOp as ExtensionOperation<V, Ctx, ActionName, ActionResult, Error>;
}
