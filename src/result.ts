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
 * Union type representing either a synchronous Result or an asynchronous AsyncResult
 */
export type AnyResult<T, E = Error> = Result<T, E> | AsyncResult<T, E>;

/**
 * Factory function that receives an error and returns an Error instance
 */
export type ErrorFactory<E extends Error = Error> = (error: E) => Error;

/**
 * Optional parameter for ensure function - either a custom error message string or a factory function
 */
export type EnsureErrorOption<E extends Error = Error> = string | ErrorFactory<E> | undefined;

/**
 * Creates a successful result without a value
 * @returns A Success result with undefined value
 */
export function ok(): Success<undefined>;

/**
 * Creates a successful result
 * @param value - The success value
 * @returns A Success result
 */
export function ok<T>(value: T): Success<T>;

/**
 * Creates a successful result
 * @param value - The success value (optional)
 * @returns A Success result
 */
export function ok<T>(value?: T): Success<T> | Success<undefined> {
  if (value === undefined && arguments.length === 0) {
    return {
      res: undefined,
      err: undefined,
    } as Success<undefined>;
  }
  return {
    res: value as T,
    err: undefined,
  } as Success<T>;
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

/**
 * Unwraps a synchronous Result, throwing an error if the result is a failure
 * Cannot be used with Result<undefined> - use type-level protection to prevent undefined returns
 * @param result - The Result to unwrap (must not be Result<undefined>)
 * @returns The value if successful (never undefined)
 * @throws Error if the result is a failure
 */
export function ensure<T, E extends Error = Error>(result: Result<T, E>): Exclude<T, undefined>;

/**
 * Unwraps a synchronous Result with custom error handling, throwing an error if the result is a failure
 * Cannot be used with Result<undefined> - use type-level protection to prevent undefined returns
 * @param result - The Result to unwrap (must not be Result<undefined>)
 * @param errorOption - Optional error message string or factory function that receives the error and returns an Error instance
 * @returns The value if successful (never undefined)
 * @throws Error if the result is a failure
 */
export function ensure<T, E extends Error = Error>(result: Result<T, E>, errorOption: EnsureErrorOption<E>): Exclude<T, undefined>;

/**
 * Unwraps an asynchronous AsyncResult, returning a Promise that resolves to the value or rejects if the result is a failure
 * Cannot be used with AsyncResult<undefined> - use type-level protection to prevent undefined returns
 * @param result - The AsyncResult to unwrap (must not be AsyncResult<undefined>)
 * @returns A Promise that resolves to the value if successful (never undefined)
 * @throws Error if the result is a failure
 */
export function ensure<T, E extends Error = Error>(result: AsyncResult<T, E>): Promise<Exclude<T, undefined>>;

/**
 * Unwraps an asynchronous AsyncResult with custom error handling, returning a Promise that resolves to the value or rejects if the result is a failure
 * Cannot be used with AsyncResult<undefined> - use type-level protection to prevent undefined returns
 * @param result - The AsyncResult to unwrap (must not be AsyncResult<undefined>)
 * @param errorOption - Optional error message string or factory function that receives the error and returns an Error instance
 * @returns A Promise that resolves to the value if successful (never undefined)
 * @throws Error if the result is a failure
 */
export function ensure<T, E extends Error = Error>(result: AsyncResult<T, E>, errorOption: EnsureErrorOption<E>): Promise<Exclude<T, undefined>>;

/**
 * Unwraps a Result or AsyncResult, throwing an error if the result is a failure
 * Cannot be used with Result<undefined> or AsyncResult<undefined> - use type-level protection to prevent undefined returns
 * @param result - The Result or AsyncResult to unwrap (must not be Result<undefined> or AsyncResult<undefined>)
 * @returns The value (or Promise that resolves to the value) if successful (never undefined)
 * @throws Error if the result is a failure
 */
export function ensure<T, E extends Error = Error>(result: Result<T, E> | AsyncResult<T, E>): Exclude<T, undefined> | Promise<Exclude<T, undefined>>;

/**
 * Unwraps a Result or AsyncResult with custom error handling, throwing an error if the result is a failure
 * Cannot be used with Result<undefined> or AsyncResult<undefined> - use type-level protection to prevent undefined returns
 * @param result - The Result or AsyncResult to unwrap (must not be Result<undefined> or AsyncResult<undefined>)
 * @param errorOption - Optional error message string or factory function that receives the error and returns an Error instance
 * @returns The value (or Promise that resolves to the value) if successful (never undefined)
 * @throws Error if the result is a failure
 */
export function ensure<T, E extends Error = Error>(result: Result<T, E> | AsyncResult<T, E>, errorOption?: EnsureErrorOption<E>): Exclude<T, undefined> | Promise<Exclude<T, undefined>> {
  const unwrap = (r: Result<T, E>): Exclude<T, undefined> => {
    if (r.err !== undefined) {
      if (errorOption === undefined) {
        throw new Error('Ensure violation error', { cause: r.err });
      } else if (typeof errorOption === 'string') {
        throw new Error(errorOption, { cause: r.err });
      } else {
        // errorOption is a factory function
        throw errorOption(r.err);
      }
    }
    return r.res as Exclude<T, undefined>;
  };

  return result instanceof Promise ? result.then(unwrap) : unwrap(result);
}
