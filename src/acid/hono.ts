import { makeOperation } from '../acid-factory.ts';
import { type Result, ok } from '../result.ts';

/**
 * Hono Context type (users must install @hono/node-server or similar)
 */
export interface Context {
  json(obj: any, status?: number): any;
  [key: string]: any;
}

/**
 * Operation context for Hono acid - wraps Hono's Context
 */
export interface HonoOperationContext {
  ctx: Context;
}

/**
 * Create Hono acid factory function
 * Usage:
 * ```ts
 * import { func } from '@uglyunicorn/amino/acid/hono'
 * 
 * new Hono()
 *   .post('/', async (c: Context) => await func(c)
 *     .step(() => ok({ hello: "world" }))
 *     .response())
 * ```
 */
export const func = makeOperation<Context, HonoOperationContext>(
  (ctx: Context) => ({ ctx })
)
  .action('response', async ({ ctx }: HonoOperationContext, { res, err }: Result<any>) => {
    if (err) {
      return ctx.json({ status: 'error', error: err.message }, 400);
    }
    return ctx.json({ status: 'ok', response: res }, 200);
  });

