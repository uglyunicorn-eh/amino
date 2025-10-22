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
const result = await operation(input, initialContext)
  .step((value, ctx) => processValue(value))
  .context((ctx, value) => updateContext(ctx, value))
  .step((value, ctx) => anotherProcess(value))
  .complete();

// With mixed sync/async steps
const result = await operation(input, context)
  .step((value, ctx) => validateInput(value))     // Sync
  .step(async (value, ctx) => fetchData(value))    // Async
  .step((value, ctx) => transformData(value))      // Sync
  .step(async (value, ctx) => saveData(value))     // Async
  .complete();
```

## Implementation Plan

### Phase 1: Core Foundation (Types & Entry Point)

#### Step 1: Define Core Types
- `Operation<V, C>` - Main operation interface (V=value, C=context)
- `StepFunction<V, NV, C>` - Function signature for steps (value first, context second)
- `ContextFunction<V, C, NC>` - Function signature for context updates (context first, value second)
- Internal step representation as linked list

#### Step 2: Implement Entry Point
- `operation<V, C>(value: V, context: C)` - Creates initial operation
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

#### Step 5: Implement .complete() Method
- Execute entire pipeline sequentially
- Handle mixed sync/async steps
- Return final `AsyncResult<V>`

### Phase 3: Execution Engine

#### Step 6: Build Pipeline Execution
- Sequential step processing
- Automatic async/await handling
- Context threading through steps
- Step result unwrapping

#### Step 7: Implement Error Propagation
- Fail-fast on any `err` result
- Stop pipeline execution immediately
- Propagate error to final result

### Phase 4: Testing & Documentation

#### Step 8: Create Test Suite
- Sync-only pipelines
- Async-only pipelines  
- Mixed sync/async pipelines
- Error handling scenarios
- Context management tests

#### Step 9: Add Documentation
- Usage examples in README
- API documentation
- Common patterns

#### Step 10: Export & Integration
- Export from main index
- Update package exports
- Ensure TypeScript compatibility

## Type Definitions

```typescript
// Step function signatures - value first, context second
type StepFunction<V, NV, C> = (value: V, context: C) => Result<NV> | AsyncResult<NV>;

// Context function signatures - context first, value second
type ContextFunction<V, C, NC> = (context: C, value: V) => Result<NC> | AsyncResult<NC>;

// Operation interface
interface Operation<V, C> {
  step<NV>(fn: StepFunction<V, NV, C>): Operation<NV, C>;
  context<NC>(fn: ContextFunction<V, C, NC>): Operation<V, NC>;
  complete(): AsyncResult<V>; // Always async since steps can be async
}
```

## Implementation Strategy

**Start with:** Core types and entry point (Steps 1-2)
**Build incrementally:** Each method separately (Steps 3-5)  
**Test thoroughly:** After each phase
**Document as we go:** Keep examples updated

## Questions for Refinement

1. **Context initialization**: How do we create the initial context?
2. **Error handling**: Should we provide custom error transformation?
3. **Step naming**: Do steps need names for debugging?
4. **Parallel steps**: Any need for parallel execution?
5. **Step validation**: Should we validate step functions at runtime?
