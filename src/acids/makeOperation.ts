import { type Instruction, instruction } from '../instruction.ts';
import { type ErrorFactory } from '../operation.ts';
import { type Result, type AsyncResult } from '../result.ts';

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
 * Extension operation interface - Instruction with a single action method.
 * 
 * Wraps an Instruction and adds an action method. Each chaining method returns
 * a new ExtensionOperation instance (immutable pattern).
 * The action method's return type extracts from the handler when called with V,
 * enabling proper type inference for frameworks using generic return types.
 * 
 * Note: The handler receives the initial context (IC), not the transformed context (C).
 * This is by design for consistency with the original implementation.
 * 
 * @param IV - Initial Value type (from Instruction)
 * @param IC - Initial Context type (from Instruction) - used by handler
 * @param V - Current Value type (from Instruction)
 * @param C - Current Context type (from Instruction) - for internal pipeline use
 * @param ActionName - Name of the action method
 * @param ActionResult - Return type of the action handler
 * @param Handler - Action handler type (expects IC, not C)
 * @param E - Error type (from Instruction)
 */
export type ExtensionOperation<IV, IC, V, C, ActionName extends string, ActionResult, Handler, E extends Error = Error> = {
  step<NV, SE extends Error = Error>(
    fn: Parameters<Instruction<IV, IC, V, C, E>['step']>[0]
  ): ExtensionOperation<IV, IC, NV, C, ActionName, ActionResult, Handler, E>;
  context<NC>(
    fn: Parameters<Instruction<IV, IC, V, C, E>['context']>[0]
  ): ExtensionOperation<IV, IC, V, NC, ActionName, ActionResult, Handler, E>;
  assert(
    predicate: Parameters<Instruction<IV, IC, V, C, E>['assert']>[0],
    message?: Parameters<Instruction<IV, IC, V, C, E>['assert']>[1]
  ): ExtensionOperation<IV, IC, V, C, ActionName, ActionResult, Handler, E>;
  failsWith<NE extends Error>(
    errorClass: ErrorFactory<NE>,
    message: string
  ): ExtensionOperation<IV, IC, V, C, ActionName, ActionResult, Handler, NE>;
  failsWith(message: string): ExtensionOperation<IV, IC, V, C, ActionName, ActionResult, Handler, Error>;
  run(...args: IV extends undefined ? [] : [IV]): Promise<Result<V, E>>;
  complete(): Promise<Result<V, E>>;
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
  ): (arg: CtxArg) => ExtensionOperation<undefined, Ctx, undefined, Ctx, ActionName, ResultType, ActionHandler<Ctx, ResultType, E>, E>;
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
    ): (arg: CtxArg) => ExtensionOperation<undefined, Ctx, undefined, Ctx, ActionName, ResultType, ActionHandler<Ctx, ResultType, E>, E> {
      return (arg: CtxArg): ExtensionOperation<undefined, Ctx, undefined, Ctx, ActionName, ResultType, ActionHandler<Ctx, ResultType, E>, E> => {
        const ctx = contextFactory(arg);
        return createExtensionOperation(ctx, name, handler);
      };
    }
  };
  
  return builder;
}

/**
 * Create an extension operation with a single action
 * Uses Instruction internally with immutable pattern - each chaining method
 * returns a new ExtensionOperation instance
 */
function createExtensionOperation<IV, IC, V, C, ActionName extends string, ActionResult, Handler extends ActionHandler<IC, ActionResult, any>, E extends Error = Error>(
  initialContext: IC,
  actionName: ActionName,
  handler: Handler
): ExtensionOperation<IV, IC, V, C, ActionName, ActionResult, Handler, E> {
  // Start with a base instruction (initial value is undefined)
  // The instruction starts with IV=undefined, V=undefined, but V will be transformed through steps
  const baseInstr = instruction(initialContext) as unknown as Instruction<IV, IC, V, C, E>;
  
  // Create extension operation wrapper
  const createWrapper = <NIV, NIC, NV, NC, NE extends Error = E>(
    instr: Instruction<NIV, NIC, NV, NC, NE>
  ): ExtensionOperation<NIV, NIC, NV, NC, ActionName, ActionResult, Handler, NE> => {
    // Create action method that runs the instruction and calls handler
    const actionMethod = async () => {
      // Run instruction without arguments (IV is undefined, so parameter is optional)
      // Type assertion needed because TypeScript can't infer that NIV extends undefined
      const result = await (instr.run as () => AsyncResult<NV, NE>)();
      // Handler is generic over V, so TypeScript infers V=NV from Result<NV, E>
      // This enables correct type inference for framework-specific return types
      // Handler receives initial context (IC), not the transformed context (NC)
      // This matches the original behavior and the type signature
      return handler(initialContext, result as unknown as Result<NV, E>);
    };

    // Create failsWith function with proper overloads
    function failsWithImpl<NE2 extends Error>(
      errorClass: ErrorFactory<NE2>,
      message: string
    ): ExtensionOperation<NIV, NIC, NV, NC, ActionName, ActionResult, Handler, NE2>;
    function failsWithImpl(message: string): ExtensionOperation<NIV, NIC, NV, NC, ActionName, ActionResult, Handler, Error>;
    function failsWithImpl<NE2 extends Error>(
      errorClassOrMessage: ErrorFactory<NE2> | string,
      message?: string
    ): ExtensionOperation<NIV, NIC, NV, NC, ActionName, ActionResult, Handler, NE2> | ExtensionOperation<NIV, NIC, NV, NC, ActionName, ActionResult, Handler, Error> {
      const newInstr = typeof errorClassOrMessage === 'string'
        ? instr.failsWith(errorClassOrMessage)
        : instr.failsWith(errorClassOrMessage, message!);
      return createWrapper(newInstr as Instruction<NIV, NIC, NV, NC, NE2>);
    }

    // Create wrapper object with chaining methods and action
    const wrapper = {
      step<NVV, SE extends Error = NE>(
        fn: Parameters<Instruction<NIV, NIC, NV, NC, NE>['step']>[0]
      ): ExtensionOperation<NIV, NIC, NVV, NC, ActionName, ActionResult, Handler, NE> {
        // Type assertion needed because Parameters<> doesn't preserve exact generic types
        // The runtime behavior is correct - the function matches the expected signature
        const newInstr = instr.step<NVV, SE>(fn as any);
        return createWrapper(newInstr as Instruction<NIV, NIC, NVV, NC, NE>);
      },

      context<NCC>(
        fn: Parameters<Instruction<NIV, NIC, NV, NC, NE>['context']>[0]
      ): ExtensionOperation<NIV, NIC, NV, NCC, ActionName, ActionResult, Handler, NE> {
        // Type assertion needed because Parameters<> doesn't preserve exact generic types
        // The runtime behavior is correct - the function matches the expected signature
        const newInstr = instr.context<NCC>(fn as any);
        return createWrapper(newInstr as Instruction<NIV, NIC, NV, NCC, NE>);
      },

      assert(
        predicate: Parameters<Instruction<NIV, NIC, NV, NC, NE>['assert']>[0],
        message?: Parameters<Instruction<NIV, NIC, NV, NC, NE>['assert']>[1]
      ): ExtensionOperation<NIV, NIC, NV, NC, ActionName, ActionResult, Handler, NE> {
        const newInstr = instr.assert(predicate, message);
        return createWrapper(newInstr);
      },

      failsWith: failsWithImpl,

      run: (...args: NIV extends undefined ? [] : [NIV]) => {
        // Type assertion needed for conditional type
        return (instr.run as (...args: NIV extends undefined ? [] : [NIV]) => AsyncResult<NV, NE>)(...args);
      },

      complete: () => {
        // When IV is undefined, run() can be called without arguments
        // Type assertion needed because TypeScript can't infer the conditional type
        return (instr.run as () => AsyncResult<NV, NE>)();
      },

      [actionName]: actionMethod,
    } as ExtensionOperation<NIV, NIC, NV, NC, ActionName, ActionResult, Handler, NE>;

    return wrapper;
  };

  return createWrapper(baseInstr);
}

