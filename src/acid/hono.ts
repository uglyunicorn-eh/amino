import { makeOperation } from '../acid-factory.ts';
import { type Result } from '../result.ts';

/**
 * Hono Context type (users must install @hono/node-server or similar)
 */
export interface Context {
  json(obj: any, status?: number): any;
  [key: string]: any;
}

/**
 * Create Hono extension factory
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
export const func = makeOperation<Context, { ctx: Context }>(
  (ctx: Context) => ({ ctx })
)
  .action('response', async ({ ctx }, { res, err }: Result<any>) => {
    if (err) {
      return ctx.json({ status: 'error', error: err.message }, 400);
    }
    return ctx.json({ status: 'ok', response: res }, 200);
  });

