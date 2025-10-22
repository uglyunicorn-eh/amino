/**
 * Success result containing a value
 */
export type Success<T> = {
  res: T;
  err: undefined;
};

/**
 * Failure result containing an error
 */
export type Failure<E = Error> = {
  res: undefined;
  err: E;
};

/**
 * Result type - discriminated union of Success or Failure
 */
export type Result<T, E = Error> = Success<T> | Failure<E>;

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
 * @returns A Failure result with the custom error type
 */
export function err<E extends Error>(error: E): Failure<E>;

/**
 * Creates a failed result with a string message (becomes Error)
 * @param message - The error message string
 * @returns A Failure result with Error type
 */
export function err(message: string): Failure<Error>;

/**
 * Creates a failed result
 * @param error - The error (Error instance or string)
 * @returns A Failure result
 */
export function err<E extends Error>(error: E | string): Failure<E> | Failure<Error> {
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
