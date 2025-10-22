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
export type Fail<E = Error> = {
  res: undefined;
  err: E;
};

/**
 * Result type - discriminated union of Success or Fail
 */
export type Result<T, E = Error> = Success<T> | Fail<E>;

/**
 * Async result type - Promise that resolves to a Result
 */
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

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
 * Creates a failed result with a custom error type
 * @param error - The error instance
 * @returns A Fail result with the custom error type
 */
export function err<E extends Error>(error: E): Fail<E>;

/**
 * Creates a failed result with a string message (becomes Error)
 * @param message - The error message string
 * @returns A Fail result with Error type
 */
export function err(message: string): Fail<Error>;

/**
 * Creates a failed result
 * @param error - The error (Error instance or string)
 * @returns A Fail result
 */
export function err<E extends Error>(error: E | string): Fail<E> | Fail<Error> {
  if (error instanceof Error) {
    return {
      res: undefined,
      err: error,
    };
  }
  
  // At this point, error must be a string
  return {
    res: undefined,
    err: new Error(error),
  };
}
