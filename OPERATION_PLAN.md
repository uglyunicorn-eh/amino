# 🚀 Operation Pipeline Execution Plan

## Overview

Create a chainable operation system that eliminates repetitive Result checks by providing a pipeline abstraction with context management and fail-fast error handling.

## Core Concepts

### Operation Pipeline
```
Input → Step1 → Step2 → Step3 → Complete
  ↓       ↓       ↓       ↓        ↓
Value1 → Value2 → Value3 → Value4 → Final
Context → Context → Context → Context
```

### Key Behaviors
- ✅ **Chainable**: `.step().context().step().complete()`
- 🛑 **Fail-fast**: Any `err` stops the entire pipeline
- 🔄 **Context preservation**: Context flows through all steps
- ⚡ **Async completion**: `complete()` returns a Promise
- 🔀 **Mixed sync/async**: Steps can be both sync and async

## Proposed API Design

```typescript
// Basic usage
const result = await operation()
  .step((value, ctx) => processValue(value))
  .context((ctx, value) => updateContext(ctx, value))
  .step((value, ctx) => anotherProcess(value))
  .complete();

// With error transformation
const result = await operation()
  .failsWith(CustomError, "Unable to complete operation")
  .step((value, ctx) => riskyOperation(value))
  .step((value, ctx) => anotherRiskyOperation(value))
  .complete();

// With mixed sync/async steps
const result = await operation()
  .step((value, ctx) => validateInput(value))     // Sync
  .step(async (value, ctx) => fetchData(value))    // Async
  .step((value, ctx) => transformData(value))      // Sync
  .step(async (value, ctx) => saveData(value))     // Async
  .complete();
```

## Implementation Plan

### Phase 1: Core Foundation (Types & Entry Point)

#### Step 1: Define Core Types
- `Operation<V, C, E>` - Main operation interface (V=value, C=context, E=error type)
- `StepFunction<V, NV, C>` - Function signature for steps (value first, context second)
- `ContextFunction<V, C, NC>` - Function signature for context updates (context first, value second)
- `ErrorTransformer<E>` - Function signature for error transformation
- Internal step representation as linked list

#### Step 2: Implement Entry Point
- `operation()` - Creates initial operation (no arguments for now)
- Basic operation builder with initial state

### Phase 2: Pipeline Methods

#### Step 3: Implement .step() Method
- Add processing step to pipeline
- Handle both `Result<NV>` and `AsyncResult<NV>` returns
- Type-safe chaining with proper generics

#### Step 4: Implement .context() Method
- Update context while preserving value type
- Allow context transformations
- Maintain operation chainability

#### Step 5: Implement .failsWith() Method
- Set error transformation for the operation
- Accept error class + message or just message
- Transform downstream errors with cause chain
- Update operation error type

#### Step 6: Implement .complete() Method
- Execute entire pipeline sequentially
- Handle mixed sync/async steps
- Apply error transformation if specified
- Return final `AsyncResult<V, E>`

### Phase 3: Execution Engine

#### Step 7: Build Pipeline Execution
- Sequential step processing
- Automatic async/await handling
- Context threading through steps
- Step result unwrapping

#### Step 8: Implement Error Propagation & Transformation
- Fail-fast on any `err` result
- Apply error transformation if specified
- Create new error with original as cause
- Stop pipeline execution immediately

### Phase 4: Testing & Documentation

#### Step 9: Create Test Suite
- Sync-only pipelines
- Async-only pipelines  
- Mixed sync/async pipelines
- Error handling scenarios
- Context management tests
- Error transformation tests

#### Step 10: Add Documentation
- Usage examples in README
- API documentation
- Common patterns
- Error handling patterns

#### Step 11: Export & Integration
- Export from main index
- Update package exports
- Ensure TypeScript compatibility

## Type Definitions

```typescript
// Step function signatures - value first, context second
type StepFunction<V, NV, C> = (value: V, context: C) => Result<NV> | AsyncResult<NV>;

// Context function signatures - context first, value second
type ContextFunction<V, C, NC> = (context: C, value: V) => Result<NC> | AsyncResult<NC>;

// Error transformation signatures
type ErrorTransformer<E> = (originalError: Error) => E;

// Operation interface with error type
interface Operation<V, C, E = Error> {
  step<NV>(fn: StepFunction<V, NV, C>): Operation<NV, C, E>;
  context<NC>(fn: ContextFunction<V, C, NC>): Operation<V, NC, E>;
  failsWith<NE>(errorClass: new (message: string, cause?: Error) => NE, message: string): Operation<V, C, NE>;
  failsWith(message: string): Operation<V, C, Error>;
  complete(): AsyncResult<V, E>;
}
```

## Implementation Strategy

**Start with:** Core types and entry point (Steps 1-2)
**Build incrementally:** Each method separately (Steps 3-5)  
**Test thoroughly:** After each phase
**Document as we go:** Keep examples updated

## Benefits of No-Arguments Design

✅ **Simpler initial implementation** - Focus on core pipeline logic  
✅ **Cleaner API** - Start with minimal surface area  
✅ **Easier to extend later** - Can add parameters when needed  
✅ **Less complexity** - No initial value/context management  

## Error Transformation Examples

```typescript
// Custom error class
class DatabaseError extends Error {
  constructor(message: string, cause?: Error) {
    super(message);
    this.cause = cause;
  }
}

// Transform to custom error
const result = await operation()
  .failsWith(DatabaseError, "Database operation failed")
  .step((value, ctx) => riskyDbOperation(value))
  .complete();
// Result type: AsyncResult<V, DatabaseError>

// Transform to generic error with message
const result = await operation()
  .failsWith("API call failed")
  .step((value, ctx) => riskyApiCall(value))
  .complete();
// Result type: AsyncResult<V, Error>
```

## Questions for Refinement

1. **Initial value/context**: How do we provide initial values? (via first step?)
2. **Result type updates**: Do we need to update Result<T> to Result<T, E> for error types?
3. **Step naming**: Do steps need names for debugging?
4. **Parallel steps**: Any need for parallel execution?
5. **Step validation**: Should we validate step functions at runtime?
