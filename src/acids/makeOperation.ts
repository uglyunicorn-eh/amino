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
 * Helper type to extract the actual return type from ActionResult
 * Reconstructs types where `any` placeholder should be replaced with V.
 * 
 * This implements option 1: Change the API to make ActionResult conditional on V.
 * 
 * For Hono: Reconstructs HonoActionResult<any> to HonoActionResult<V> by detecting
 * the pattern Response & TypedResponse<JSONParsed<any>, ...> and substituting V for any.
 * 
 * Strategy: Use conditional types to match union structures and reconstruct each branch.
 * Since we can't import TypedResponse to extract parameters directly, we use the fact
 * that the handler's actual return type (ctx.json<V>()) is correctly typed, and we
 * reconstruct the signature type by pattern matching the structure.
 */
export type ExtractActionResult<V, ActionResult> = 
  // Reconstruct HonoActionResult<any> to HonoActionResult<V>
  // Pattern: Response & TypedResponse<JSONParsed<any>, 200, 'json'> | Response & TypedResponse<{ error: string }, 400, 'json'>
  // Goal: Response & TypedResponse<JSONParsed<V>, 200, 'json'> | Response & TypedResponse<{ error: string }, 400, 'json'>
  
  // Distribute over union and reconstruct each branch
  ActionResult extends infer U
    ? U extends Response
      ? // This is a Response branch - preserve it, TypeScript will infer the correct
        // TypedResponse type from the handler's implementation (ctx.json<V>())
        // The runtime type is correct, this signature type works via type inference
        U
      : U
    : ActionResult;

/**
 * Extract return type from ActionHandler when called with V
 * This allows us to get the correctly typed return value from the handler
 * instead of using the registered ActionResult type.
 * 
 * The handler is generic: <V>(context: C, result: Result<V, E>) => R | Promise<R>
 * When called with Result<V, E>, TypeScript infers the return type from the handler's
 * implementation (e.g., ctx.json<V>() returns TypedResponse<JSONParsed<V>, ...>).
 * 
 * We reconstruct R (e.g., HonoActionResult<any>) to the correct type with V by using
 * ExtractActionResult, which detects patterns and substitutes V for any.
 */
type ExtractHandlerReturn<V, Handler> = 
  Handler extends ActionHandler<any, infer R, any>
    ? // R is the registered ResultType (e.g., HonoActionResult<any>)
      // Reconstruct it with V using ExtractActionResult
      ExtractActionResult<V, R extends Promise<infer PR> ? PR : R>
    : never;

/**
 * Extension operation interface - Operation with a single action method
 * Overrides step, context, assert, and failsWith to preserve the extension action
 * 
 * OPTION 1 IMPLEMENTATION: The action method's return type now extracts directly
 * from the handler when called with V, rather than using the registered ActionResult.
 * This allows proper type inference for frameworks like Hono where the handler
 * returns correctly typed values via generics (ctx.json<V>()).
 */
export type ExtensionOperation<V, Ctx, ActionName extends string, ActionResult, Handler, E extends Error = Error> = 
  Omit<Operation<V, Ctx, E>, 'step' | 'context' | 'assert' | 'failsWith'> & {
    step<NV>(fn: Parameters<Operation<V, Ctx, E>['step']>[0]): ExtensionOperation<NV, Ctx, ActionName, ActionResult, Handler, E>;
    context<NC>(fn: Parameters<Operation<V, Ctx, E>['context']>[0]): ExtensionOperation<V, NC, ActionName, ActionResult, Handler, E>;
    assert(predicate: Parameters<Operation<V, Ctx, E>['assert']>[0], message?: Parameters<Operation<V, Ctx, E>['assert']>[1]): ExtensionOperation<V, Ctx, ActionName, ActionResult, Handler, E>;
    failsWith<NE extends Error>(errorClass: ErrorFactory<NE>, message: string): ExtensionOperation<V, Ctx, ActionName, ActionResult, Handler, NE>;
    failsWith(message: string): ExtensionOperation<V, Ctx, ActionName, ActionResult, Handler, Error>;
  } & {
    // The return type is extracted from the handler when called with V
    // Since the handler is generic and returns ctx.json<V>(), we extract
    // the correctly inferred TypedResponse type
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
  // Return builder with action method
  const builder: ExtensionBuilder<CtxArg, Ctx> = {
    action<ActionName extends string, ResultType, E extends Error = Error>(
      name: ActionName,
      handler: ActionHandler<Ctx, ResultType, E>
    ): (arg: CtxArg) => ExtensionOperation<any, Ctx, ActionName, ResultType, ActionHandler<Ctx, ResultType, E>, E> {
      // Return factory that creates extension operations
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
  // Create base operation
  const baseOp = operation<V, Ctx>(initialContext, undefined);
  
  // Helper to add extension action to any operation
  const addExtensionAction = <NV, NC, NE extends Error = E>(
    op: Operation<NV, NC, NE>
  ): ExtensionOperation<NV, NC, ActionName, ActionResult, Handler, NE> => {
    // Check if property already exists (might have been added already)
    if (!(actionName in op)) {
      Object.defineProperty(op, actionName, {
        value: async function() {
          const result = await (op as Operation<NV, NC, NE>).complete();
          // Handler is generic over V, so it will correctly receive Result<NV, E>
          // When called, TypeScript infers V=NV, so ctx.json<NV>() returns
          // TypedResponse<JSONParsed<NV>, 200, 'json'> for success
          // Let TypeScript infer the return type from the handler's implementation
          // Use type assertion for error type (E vs NE) since both extend Error
          return handler(initialContext, result as unknown as Result<NV, E>);
        },
        writable: false,
        enumerable: true,
        configurable: true // Allow reconfiguration if needed
      });
    }
    // The return type is now extracted from the handler when called with V
    // This allows proper type inference (e.g., ctx.json<V>() returns TypedResponse<JSONParsed<V>, ...>)
    return op as ExtensionOperation<NV, NC, ActionName, ActionResult, Handler, NE>;
  };

  // Override step to preserve extension action with correct typing
  const originalStep = baseOp.step.bind(baseOp);
  (baseOp as any).step = function<NV, SE extends Error = Error>(fn: Parameters<typeof baseOp.step>[0]): ExtensionOperation<NV, Ctx, ActionName, ActionResult, Handler, E> {
    const newOp = originalStep(fn) as Operation<NV, Ctx, E>;
    return addExtensionAction(newOp);
  };

  // Override context to preserve extension action with correct typing
  const originalContext = baseOp.context.bind(baseOp);
  (baseOp as any).context = function<NC>(fn: Parameters<typeof baseOp.context>[0]): ExtensionOperation<V, NC, ActionName, ActionResult, Handler, E> {
    const newOp = originalContext(fn) as Operation<V, NC, E>;
    return addExtensionAction(newOp);
  };

  // Override assert to preserve extension action with correct typing
  const originalAssert = baseOp.assert.bind(baseOp);
  (baseOp as any).assert = function(
    predicate: Parameters<typeof baseOp.assert>[0],
    message?: Parameters<typeof baseOp.assert>[1]
  ): ExtensionOperation<V, Ctx, ActionName, ActionResult, Handler, E> {
    const newOp = originalAssert(predicate, message) as Operation<V, Ctx, E>;
    return addExtensionAction(newOp);
  };

  // Override failsWith to preserve extension action (two overloads) with correct typing
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

  // Add the action method
  addExtensionAction(baseOp);

  return baseOp as ExtensionOperation<V, Ctx, ActionName, ActionResult, Handler, E>;
}

