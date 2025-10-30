import { makeOperation } from '../makeOperation.ts';
import { type Result } from '../../result.ts';
import type { Context } from 'hono';

export const func = makeOperation<Context, { ctx: Context }>(
  (ctx: Context) => ({ ctx })
)
.action('response', async ({ ctx }, { res, err }: Result<unknown>) => {
  if (err) {
    return ctx.json({ error: err.message }, 400);
  }
  return ctx.json(res, 200);
});
