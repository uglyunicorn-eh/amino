import { type Operation, type ErrorFactory, operation } from '../operation.ts';
import { type Result } from '../result.ts';

/**
 * Action handler signature - called when an action method is invoked
 * Generic over the operation's value type so it receives the correct Result type
 * @param context - Final context from the pipeline
 * @param result - The final result from the pipeline (type comes from operation)
 * @returns Action-specific result
 */
export type ActionHandler<C, R, E extends Error = Error> = <V>(context: C, result: Result<V, E>) => R | Promise<R>;

/**
 * Extension operation interface - Operation with a single action method
 * Overrides step, context, assert, and failsWith to preserve the extension action
 */
export type ExtensionOperation<V, Ctx, ActionName extends string, ActionResult, E extends Error = Error> = 
  Omit<Operation<V, Ctx, E>, 'step' | 'context' | 'assert' | 'failsWith'> & {
    step<NV>(fn: Parameters<Operation<V, Ctx, E>['step']>[0]): ExtensionOperation<NV, Ctx, ActionName, ActionResult, E>;
    context<NC>(fn: Parameters<Operation<V, Ctx, E>['context']>[0]): ExtensionOperation<V, NC, ActionName, ActionResult, E>;
    assert(predicate: Parameters<Operation<V, Ctx, E>['assert']>[0]): ExtensionOperation<V, Ctx, ActionName, ActionResult, E>;
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
  action<ActionName extends string, ResultType, E extends Error = Error>(
    name: ActionName,
    handler: ActionHandler<Ctx, ResultType, E>
  ): (arg: CtxArg) => ExtensionOperation<any, Ctx, ActionName, ResultType, E>;
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
    action<ActionName extends string, ResultType, E extends Error = Error>(
      name: ActionName,
      handler: ActionHandler<Ctx, ResultType, E>
    ): (arg: CtxArg) => ExtensionOperation<any, Ctx, ActionName, ResultType, E> {
      // Return factory that creates extension operations
      return (arg: CtxArg): ExtensionOperation<any, Ctx, ActionName, ResultType, E> => {
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
function createExtensionOperation<V, Ctx, ActionName extends string, ActionResult, E extends Error = Error>(
  initialContext: Ctx,
  actionName: ActionName,
  handler: ActionHandler<Ctx, ActionResult, E>
): ExtensionOperation<V, Ctx, ActionName, ActionResult, E> {
  // Create base operation
  const baseOp = operation<V, Ctx>(initialContext, undefined);
  
  // Helper to add extension action to any operation
  const addExtensionAction = <NV, NC, NE extends Error = E>(
    op: Operation<NV, NC, NE>
  ): ExtensionOperation<NV, NC, ActionName, ActionResult, NE> => {
    // Check if property already exists (might have been added already)
    if (!(actionName in op)) {
      Object.defineProperty(op, actionName, {
        value: async function() {
          const result = await (op as Operation<NV, NC, NE>).complete();
          // Handler is generic over V, so it will correctly receive Result<NV, E>
          // Use type assertion for error type (E vs NE) since both extend Error
          return handler(initialContext, result as unknown as Result<NV, E>);
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
  (baseOp as any).step = function<NV, SE extends Error = Error>(fn: Parameters<typeof baseOp.step>[0]): ExtensionOperation<NV, Ctx, ActionName, ActionResult, E> {
    const newOp = originalStep(fn) as Operation<NV, Ctx, E>;
    return addExtensionAction(newOp);
  };
  
  // Override context to preserve extension action with correct typing
  const originalContext = baseOp.context.bind(baseOp);
  (baseOp as any).context = function<NC>(fn: Parameters<typeof baseOp.context>[0]): ExtensionOperation<V, NC, ActionName, ActionResult, E> {
    const newOp = originalContext(fn) as Operation<V, NC, E>;
    return addExtensionAction(newOp);
  };
  
  // Override assert to preserve extension action with correct typing
  const originalAssert = baseOp.assert.bind(baseOp);
  (baseOp as any).assert = function(
    predicate: Parameters<typeof baseOp.assert>[0],
    message?: Parameters<typeof baseOp.assert>[1]
  ): ExtensionOperation<V, Ctx, ActionName, ActionResult, E> {
    const newOp = originalAssert(predicate, message) as Operation<V, Ctx, E>;
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
  
  return baseOp as ExtensionOperation<V, Ctx, ActionName, ActionResult, E>;
}

