import { Context, Hono } from 'hono';
import { ok, instruction, type Result } from '@uglyunicorn/amino';

const apiResponse = <V, E>(c: Context) => 
  (res: Result<V, E>) => {
    return res.err 
      ? c.json({ status: 'error' as const, error: res.err }, 400) 
      : c.json({ status: 'ok' as const, data: res.res }, 200);
  }

// Create Hono app
const app = new Hono()
  .get(
    '/', 
    async (c) => 
      await instruction({ input: null })
        .step((_, ctx) => ok({ hello: 'world' }))
        .useResult(apiResponse(c))
  )

export default app;