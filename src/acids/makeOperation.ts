import { type Operation, type ErrorFactory, operation } from '../operation.ts';
import { type Result } from '../result.ts';

/**
 * Action handler signature - called when an action method is invoked
 * Generic over the operation's value type so it receives the correct Result type
 * @param context - Final context from the pipeline
 * @param result - The final result from the pipeline (type comes from operation)
 * @returns Action-specific result (can depend on V)
 */
export type ActionHandler<C, R, E extends Error = Error> = <V>(context: C, result: Result<V, E>) => R | Promise<R>;


/**
 * Type reconstruction placeholder for ActionResult.
 * 
 * Note: Currently a pass-through - actual type inference comes from the handler's
 * implementation when called with Result<V, E>. The handler returns correctly typed
 * values (e.g., ctx.json<V>() returns TypedResponse<JSONParsed<V>, ...>) which
 * TypeScript infers correctly at usage sites, including Hono's hc<typeof app> client.
 * 
 * This type exists as a placeholder for potential future type reconstruction logic.
 * Framework-specific types (like Hono's TypedResponse) would need to be imported to
 * perform actual reconstruction, which we avoid to keep makeOperation generic.
 */
export type ExtractActionResult<V, ActionResult> = ActionResult;

/**
 * Extracts the return type from ActionHandler when instantiated with V.
 * 
 * Extracts the registered ActionResult type from the handler signature.
 * The actual type inference comes from the handler's implementation when called
 * with Result<V, E> - TypeScript infers V from the result type and the handler's
 * generic signature returns correctly typed values (e.g., ctx.json<V>()).
 */
type ExtractHandlerReturn<V, Handler> = 
  Handler extends ActionHandler<any, infer R, any>
    ? ExtractActionResult<V, R extends Promise<infer PR> ? PR : R>
    : never;

/**
 * Extension operation interface - Operation with a single action method.
 * 
 * Overrides step, context, assert, and failsWith to preserve the extension action.
 * The action method's return type extracts from the handler when called with V,
 * enabling proper type inference for frameworks using generic return types.
 */
export type ExtensionOperation<V, Ctx, ActionName extends string, ActionResult, Handler, E extends Error = Error> = 
  Omit<Operation<V, Ctx, E>, 'step' | 'context' | 'assert' | 'failsWith'> & {
    step<NV>(fn: Parameters<Operation<V, Ctx, E>['step']>[0]): ExtensionOperation<NV, Ctx, ActionName, ActionResult, Handler, E>;
    context<NC>(fn: Parameters<Operation<V, Ctx, E>['context']>[0]): ExtensionOperation<V, NC, ActionName, ActionResult, Handler, E>;
    assert(predicate: Parameters<Operation<V, Ctx, E>['assert']>[0], message?: Parameters<Operation<V, Ctx, E>['assert']>[1]): ExtensionOperation<V, Ctx, ActionName, ActionResult, Handler, E>;
    failsWith<NE extends Error>(errorClass: ErrorFactory<NE>, message: string): ExtensionOperation<V, Ctx, ActionName, ActionResult, Handler, NE>;
    failsWith(message: string): ExtensionOperation<V, Ctx, ActionName, ActionResult, Handler, Error>;
  } & {
    [K in ActionName]: () => Promise<ExtractHandlerReturn<V, Handler>>;
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
  ): (arg: CtxArg) => ExtensionOperation<any, Ctx, ActionName, ResultType, ActionHandler<Ctx, ResultType, E>, E>;
}

/**
 * Factory function for creating extensions with a single action
 * @param contextFactory - Function that creates context from arguments (must be synchronous)
 * @returns Builder that allows registering one action
 */
export function makeOperation<CtxArg, Ctx>(
  contextFactory: (arg: CtxArg) => Ctx
): ExtensionBuilder<CtxArg, Ctx> {
  const builder: ExtensionBuilder<CtxArg, Ctx> = {
    action<ActionName extends string, ResultType, E extends Error = Error>(
      name: ActionName,
      handler: ActionHandler<Ctx, ResultType, E>
    ): (arg: CtxArg) => ExtensionOperation<any, Ctx, ActionName, ResultType, ActionHandler<Ctx, ResultType, E>, E> {
      return (arg: CtxArg): ExtensionOperation<any, Ctx, ActionName, ResultType, ActionHandler<Ctx, ResultType, E>, E> => {
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
function createExtensionOperation<V, Ctx, ActionName extends string, ActionResult, Handler extends ActionHandler<Ctx, ActionResult, any>, E extends Error = Error>(
  initialContext: Ctx,
  actionName: ActionName,
  handler: Handler
): ExtensionOperation<V, Ctx, ActionName, ActionResult, Handler, E> {
  const baseOp = operation<V, Ctx>(initialContext, undefined);
  
  const addExtensionAction = <NV, NC, NE extends Error = E>(
    op: Operation<NV, NC, NE>
  ): ExtensionOperation<NV, NC, ActionName, ActionResult, Handler, NE> => {
    if (!(actionName in op)) {
      Object.defineProperty(op, actionName, {
        value: async function() {
          const result = await (op as Operation<NV, NC, NE>).complete();
          // Handler is generic over V, so TypeScript infers V=NV from Result<NV, E>
          // This enables correct type inference for framework-specific return types
          return handler(initialContext, result as unknown as Result<NV, E>);
        },
        writable: false,
        enumerable: true,
        configurable: true
      });
    }
    return op as ExtensionOperation<NV, NC, ActionName, ActionResult, Handler, NE>;
  };

  // Override chaining methods to preserve extension action
  const originalStep = baseOp.step.bind(baseOp);
  (baseOp as any).step = function<NV, SE extends Error = Error>(fn: Parameters<typeof baseOp.step>[0]): ExtensionOperation<NV, Ctx, ActionName, ActionResult, Handler, E> {
    const newOp = originalStep(fn) as Operation<NV, Ctx, E>;
    return addExtensionAction(newOp);
  };

  const originalContext = baseOp.context.bind(baseOp);
  (baseOp as any).context = function<NC>(fn: Parameters<typeof baseOp.context>[0]): ExtensionOperation<V, NC, ActionName, ActionResult, Handler, E> {
    const newOp = originalContext(fn) as Operation<V, NC, E>;
    return addExtensionAction(newOp);
  };

  const originalAssert = baseOp.assert.bind(baseOp);
  (baseOp as any).assert = function(
    predicate: Parameters<typeof baseOp.assert>[0],
    message?: Parameters<typeof baseOp.assert>[1]
  ): ExtensionOperation<V, Ctx, ActionName, ActionResult, Handler, E> {
    const newOp = originalAssert(predicate, message) as Operation<V, Ctx, E>;
    return addExtensionAction(newOp);
  };

  const originalFailsWith = baseOp.failsWith.bind(baseOp);
  (baseOp as any).failsWith = function<NE extends Error>(
    arg1: ErrorFactory<NE> | string,
    arg2?: string
  ): ExtensionOperation<V, Ctx, ActionName, ActionResult, Handler, NE> {
    let newOp: Operation<any, any, any>;
    if (typeof arg1 === 'string') {
      newOp = originalFailsWith(arg1);
    } else {
      newOp = originalFailsWith(arg1, arg2!);
    }
    return addExtensionAction(newOp);
  };

  addExtensionAction(baseOp);

  return baseOp as ExtensionOperation<V, Ctx, ActionName, ActionResult, Handler, E>;
}

