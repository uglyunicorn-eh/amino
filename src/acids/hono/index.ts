import { makeOperation } from '../makeOperation.ts';
import { type Result } from '../../result.ts';
import type { Context } from 'hono';

/**
 * Hono extension factory - creates operations with Hono context
 * The response action returns a Response with properly typed JSON payload
 * The handler receives the operation's value type V in Result<V, Error>
 */
export const func = makeOperation<Context, { ctx: Context }>(
  (ctx: Context) => ({ ctx })
)
.action<'response', Response, Error>('response', async <V>({ ctx }: { ctx: Context }, result: Result<V, Error>): Promise<Response> => {
  if (result.err) {
    return ctx.json({ error: result.err.message }, 400);
  }
  // Return typed response - Hono's ctx.json preserves the payload type from result.res
  // The type V flows through from the operation's result
  return ctx.json(result.res, 200);
});
