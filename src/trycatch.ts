import { ok, err, type Result, type AsyncResult } from './result.ts';

/**
 * Wraps a function in a try-catch and returns a Result or AsyncResult
 * - For synchronous functions: returns Result<T>
 * - For async functions: returns AsyncResult<T>
 * @param fn - Function to execute (sync or async)
 * @returns Result or AsyncResult containing the function's return value or error
 */
export function trycatch<T>(
  fn: () => T
): [T] extends [never]
  ? Result<never>
  : [T] extends [PromiseLike<infer U>]
  ? AsyncResult<U>
  : Result<T>;

export function trycatch<T>(fn: () => T): Result<T> | AsyncResult<T> {
  try {
    const result = fn();
    
    // Check if result is a Promise
    if (result instanceof Promise) {
      return result
        .then(value => ok(value))
        .catch(error => {
          if (error instanceof Error) {
            return err(error);
          }
          return err(new Error(String(error)));
        }) as AsyncResult<T>;
    }
    
    return ok(result as T);
  } catch (error) {
    if (error instanceof Error) {
      return err(error);
    }
    return err(new Error(String(error)));
  }
}
