// Result types and functions
export { ok, err } from './result.ts';
export type { Result, Success, Failure, AsyncResult } from './result.ts';

// Try-catch utility
export { trycatch } from './trycatch.ts';

// Operation pipeline functions
export { operation } from './operation.ts';
export type { Operation } from './operation.ts';

// Extension system
export { makeOperation } from './acid-factory.ts';
export type { ActionHandler, ExtensionOperation } from './acid-factory.ts';

// Pre-built acids
export * from './acid/index.ts';
