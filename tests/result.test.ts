import { describe, test, expect } from 'bun:test';
import { ok, err, ensure, type Result, type AsyncResult } from '../src/index.ts';

describe('Result Pattern', () => {
  describe('ok() - Success results', () => {
    test('creates success result without arguments', () => {
      const result = ok();
      
      expect(result.res).toBeUndefined();
      expect(result.err).toBeUndefined();
    });

    test('creates success result', () => {
      const result = ok('hello');
      
      expect(result.res).toBe('hello');
      expect(result.err).toBeUndefined();
    });

    test('creates success result with complex object', () => {
      const obj = { name: 'test', value: 123 };
      const result = ok(obj);
      
      expect(result.res).toEqual(obj);
      expect(result.err).toBeUndefined();
    });
  });

  describe('err() - Fail results', () => {
    test('creates fail result with Error instance', () => {
      const error = new Error('Something went wrong');
      const result = err(error);
      
      expect(result.res).toBeUndefined();
      expect(result.err).toBe(error);
      expect(result.err.message).toBe('Something went wrong');
    });

    test('creates fail result with string (auto-wrapped)', () => {
      const result = err('Something failed');
      
      expect(result.res).toBeUndefined();
      expect(result.err).toBeInstanceOf(Error);
      expect(result.err.message).toBe('Something failed');
    });
  });

  describe('Type narrowing', () => {
    test('narrows to Success type when err is undefined', () => {
      const result: Result<string> = ok('success');
      
      if (result.err === undefined) {
        const value: string = result.res;
        expect(value).toBe('success');
      }
    });

    test('narrows to Fail type when err is defined', () => {
      const result: Result<string> = err('failure');
      
      if (result.err !== undefined) {
        const error: Error = result.err;
        expect(error.message).toBe('failure');
        expect(result.res).toBeUndefined();
      }
    });
  });

  describe('Practical usage', () => {
    test('function returning Result', () => {
      function divide(a: number, b: number): Result<number> {
        if (b === 0) {
          return err('Division by zero');
        }
        return ok(a / b);
      }

      const success = divide(10, 2);
      if (success.err === undefined) {
        expect(success.res).toBe(5);
      }

      const failure = divide(10, 0);
      if (failure.err !== undefined) {
        expect(failure.err.message).toBe('Division by zero');
      }
    });
  });

  describe('ensure() - Unwrap Result', () => {
    describe('Synchronous Result', () => {
      test('unwraps successful result', () => {
        expect(ensure(ok(42))).toBe(42);
        expect(ensure(ok('hello'))).toBe('hello');
        expect(ensure(ok(null))).toBeNull();
        // ensure(ok()) should cause a TypeScript error - ensure cannot return undefined
      });

      test('unwraps successful result with object', () => {
        const obj = { name: 'test', value: 123 };
        const value = ensure(ok(obj));
        
        expect(value).toEqual(obj);
        expect(value.name).toBe('test');
      });

      test('throws error when result is a failure', () => {
        expect(() => ensure(err('error'))).toThrow('Ensure violation error');
        expect(() => ensure(err(new Error('error')))).toThrow('Ensure violation error');
      });

      test('includes original error as cause', () => {
        const originalError = new Error('original error');
        try {
          ensure(err(originalError));
          expect(true).toBe(false);
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toBe('Ensure violation error');
          expect((error as Error & { cause?: Error }).cause).toBe(originalError);
        }
      });

      test('type narrowing works correctly', () => {
        const result: Result<string> = ok('success');
        const value: string = ensure(result);
        
        expect(value).toBe('success');
      });

      test('return type excludes undefined', () => {
        const numResult: Result<number> = ok(42);
        const numValue: number = ensure(numResult);
        expect(numValue).toBe(42);
        
        const nullResult: Result<null> = ok(null);
        const nullValue: null = ensure(nullResult);
        expect(nullValue).toBeNull();
        
        // Type-level test: ensure(ok()) should cause TypeScript error
        // This is verified by the fact that the following would not compile:
        // const undefinedValue = ensure(ok()); // TypeScript error: Argument of type 'Result<undefined>' is not assignable
      });
    });

    describe('Asynchronous AsyncResult', () => {
      test('unwraps successful async result', async () => {
        expect(await ensure(Promise.resolve(ok(42)))).toBe(42);
        expect(await ensure(Promise.resolve(ok('hello')))).toBe('hello');
        expect(await ensure(Promise.resolve(ok(null)))).toBeNull();
        // ensure(Promise.resolve(ok())) should cause a TypeScript error - ensure cannot return undefined
      });

      test('throws error when async result is a failure', async () => {
        await expect(ensure(Promise.resolve(err('error')))).rejects.toThrow('Ensure violation error');
        await expect(ensure(Promise.resolve(err(new Error('error'))))).rejects.toThrow('Ensure violation error');
      });

      test('includes original error as cause in async result', async () => {
        const originalError = new Error('original error');
        try {
          await ensure(Promise.resolve(err(originalError)));
          expect(true).toBe(false);
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toBe('Ensure violation error');
          expect((error as Error & { cause?: Error }).cause).toBe(originalError);
        }
      });

      test('properly awaits promise', async () => {
        let resolved = false;
        const result: AsyncResult<number> = new Promise((resolve) => {
          setTimeout(() => {
            resolved = true;
            resolve(ok(42));
          }, 10);
        });
        
        expect(await ensure(result)).toBe(42);
        expect(resolved).toBe(true);
      });

      test('type narrowing works correctly for async result', async () => {
        const result: AsyncResult<string> = Promise.resolve(ok('success'));
        const value: string = await ensure(result);
        
        expect(value).toBe('success');
      });

      test('return type excludes undefined for async result', async () => {
        const numResult: AsyncResult<number> = Promise.resolve(ok(42));
        const numValue: number = await ensure(numResult);
        expect(numValue).toBe(42);
        
        const nullResult: AsyncResult<null> = Promise.resolve(ok(null));
        const nullValue: null = await ensure(nullResult);
        expect(nullValue).toBeNull();
        
        // Type-level test: ensure(Promise.resolve(ok())) should cause TypeScript error
        // This is verified by the fact that the following would not compile:
        // const undefinedValue = await ensure(Promise.resolve(ok())); // TypeScript error
      });
    });

    describe('ensure() with custom error message (string parameter)', () => {
      describe('Synchronous Result', () => {
        test('throws error with custom message when result is a failure', () => {
          expect(() => ensure(err('error'), 'Custom error message')).toThrow('Custom error message');
          expect(() => ensure(err(new Error('error')), 'Another custom message')).toThrow('Another custom message');
        });

        test('preserves original error as cause when using custom message', () => {
          const originalError = new Error('original error');
          try {
            ensure(err(originalError), 'Custom error message');
            expect(true).toBe(false);
          } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toBe('Custom error message');
            expect((error as Error & { cause?: Error }).cause).toBe(originalError);
          }
        });

        test('unwraps successful result normally with custom message parameter', () => {
          expect(ensure(ok(42), 'Custom message')).toBe(42);
          expect(ensure(ok('hello'), 'Custom message')).toBe('hello');
        });
      });

      describe('Asynchronous AsyncResult', () => {
        test('throws error with custom message when async result is a failure', async () => {
          await expect(ensure(Promise.resolve(err('error')), 'Custom error message')).rejects.toThrow('Custom error message');
          await expect(ensure(Promise.resolve(err(new Error('error'))), 'Another custom message')).rejects.toThrow('Another custom message');
        });

        test('preserves original error as cause when using custom message in async result', async () => {
          const originalError = new Error('original error');
          try {
            await ensure(Promise.resolve(err(originalError)), 'Custom error message');
            expect(true).toBe(false);
          } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toBe('Custom error message');
            expect((error as Error & { cause?: Error }).cause).toBe(originalError);
          }
        });

        test('unwraps successful async result normally with custom message parameter', async () => {
          expect(await ensure(Promise.resolve(ok(42)), 'Custom message')).toBe(42);
          expect(await ensure(Promise.resolve(ok('hello')), 'Custom message')).toBe('hello');
        });
      });
    });

    describe('ensure() with error factory function', () => {
      describe('Synchronous Result', () => {
        test('throws error from factory function when result is a failure', () => {
          const factory = (error: Error) => new Error(`Wrapped: ${error.message}`);
          expect(() => ensure(err('error'), factory)).toThrow('Wrapped: error');
        });

        test('factory function receives correct error', () => {
          const originalError = new Error('original error');
          const factory = (error: Error) => {
            expect(error).toBe(originalError);
            return new Error(`Factory error: ${error.message}`);
          };
          
          try {
            ensure(err(originalError), factory);
            expect(true).toBe(false);
          } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toBe('Factory error: original error');
          }
        });

        test('factory function can return custom Error types', () => {
          class CustomError extends Error {
            constructor(message: string, public code: number) {
              super(message);
              this.name = 'CustomError';
            }
          }

          const factory = (error: Error) => new CustomError(`Custom: ${error.message}`, 500);
          
          try {
            ensure(err('error'), factory);
            expect(true).toBe(false);
          } catch (error) {
            expect(error).toBeInstanceOf(CustomError);
            expect((error as CustomError).message).toBe('Custom: error');
            expect((error as CustomError).code).toBe(500);
          }
        });

        test('unwraps successful result normally with factory parameter', () => {
          const factory = (error: Error) => new Error('Should not be called');
          expect(ensure(ok(42), factory)).toBe(42);
          expect(ensure(ok('hello'), factory)).toBe('hello');
        });
      });

      describe('Asynchronous AsyncResult', () => {
        test('throws error from factory function when async result is a failure', async () => {
          const factory = (error: Error) => new Error(`Wrapped: ${error.message}`);
          await expect(ensure(Promise.resolve(err('error')), factory)).rejects.toThrow('Wrapped: error');
        });

        test('factory function receives correct error in async result', async () => {
          const originalError = new Error('original error');
          const factory = (error: Error) => {
            expect(error).toBe(originalError);
            return new Error(`Factory error: ${error.message}`);
          };
          
          try {
            await ensure(Promise.resolve(err(originalError)), factory);
            expect(true).toBe(false);
          } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toBe('Factory error: original error');
          }
        });

        test('factory function can return custom Error types in async result', async () => {
          class CustomError extends Error {
            constructor(message: string, public code: number) {
              super(message);
              this.name = 'CustomError';
            }
          }

          const factory = (error: Error) => new CustomError(`Custom: ${error.message}`, 500);
          
          try {
            await ensure(Promise.resolve(err('error')), factory);
            expect(true).toBe(false);
          } catch (error) {
            expect(error).toBeInstanceOf(CustomError);
            expect((error as CustomError).message).toBe('Custom: error');
            expect((error as CustomError).code).toBe(500);
          }
        });

        test('unwraps successful async result normally with factory parameter', async () => {
          const factory = (error: Error) => new Error('Should not be called');
          expect(await ensure(Promise.resolve(ok(42)), factory)).toBe(42);
          expect(await ensure(Promise.resolve(ok('hello')), factory)).toBe('hello');
        });
      });
    });
  });
});
