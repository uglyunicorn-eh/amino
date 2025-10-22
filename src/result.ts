/**
 * Success result containing a value
 */
export type Success<T> = {
  res: T;
  err: undefined;
};

/**
 * Fail result containing an error
 */
export type Fail = {
  res: undefined;
  err: Error;
};

/**
 * Result type - discriminated union of Success or Fail
 */
export type Result<T> = Success<T> | Fail;

/**
 * Async result type - Promise that resolves to a Result
 */
export type AsyncResult<T> = Promise<Result<T>>;

/**
 * Creates a successful result
 * @param value - The success value
 * @returns A Success result
 */
export function ok<T>(value: T): Success<T> {
  return {
    res: value,
    err: undefined,
  };
}

/**
 * Creates a failed result
 * @param error - The error (Error instance or string)
 * @returns A Fail result
 */
export function err(error: Error | string): Fail {
  return {
    res: undefined,
    err: error instanceof Error ? error : new Error(error),
  };
}
