import { makeOperation } from '../makeOperation.ts';
import { type Result } from '../../result.ts';
import type { Context } from 'hono';
import type { TypedResponse } from 'hono/types';
import type { JSONParsed } from 'hono/utils/types';

/**
 * Type for Hono response action return type.
 * Preserves the payload type V through TypedResponse for client type inference.
 */
type HonoActionResult<V> = 
  | (Response & TypedResponse<JSONParsed<V>, 200, 'json'>)
  | (Response & TypedResponse<{ error: string }, 400, 'json'>);

/**
 * Hono extension factory - creates operations with Hono context.
 * The response action returns a Response with properly typed JSON payload.
 */
export const func = makeOperation<Context, { ctx: Context }>(
  (ctx: Context) => ({ ctx })
)
.action<'response', HonoActionResult<any>, Error>('response', async <V>({ ctx }: { ctx: Context }, result: Result<V, Error>) => {
  if (result.err) {
    return ctx.json({ error: result.err.message }, 400);
  }
  // ctx.json<V>() preserves the payload type for proper type inference with hc<typeof app>
  return ctx.json<V, 200>(result.res, 200);
});

