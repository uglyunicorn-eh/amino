import { makeOperation } from '../makeOperation.ts';
import { type Result } from '../../result.ts';
import type { Context } from 'hono';
import type { TypedResponse } from 'hono/types';
import type { JSONParsed } from 'hono/utils/types';

/**
 * Type for Hono response action return type
 * Preserves the payload type V through TypedResponse for client type inference
 */
type HonoActionResult<V> = 
  | (Response & TypedResponse<JSONParsed<V>, 200, 'json'>)
  | (Response & TypedResponse<{ error: string }, 400, 'json'>);

/**
 * Hono extension factory - creates operations with Hono context
 * The response action returns a Response with properly typed JSON payload
 * The handler receives the operation's value type V in Result<V, Error>
 */
export const func = makeOperation<Context, { ctx: Context }>(
  (ctx: Context) => ({ ctx })
)
.action<'response', HonoActionResult<any>, Error>('response', async <V>({ ctx }: { ctx: Context }, result: Result<V, Error>) => {
  if (result.err) {
    return ctx.json({ error: result.err.message }, 400);
  }
  // Return typed response - Hono's ctx.json preserves the payload type from result.res
  // The type V flows through from the operation's result, and ctx.json returns TypedResponse<JSONParsed<V>, 200, 'json'>
  return ctx.json(result.res, 200);
});
