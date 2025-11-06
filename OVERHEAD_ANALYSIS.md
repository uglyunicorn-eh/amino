# Overhead Analysis: Instruction vs Operation

## Memory Overhead

### Operation
- **Storage**: Mutable array `steps[]` in `OperationState`
- **Per chain operation**: O(1) - array push operation
- **Memory per step**: 1 array element reference
- **Total memory for N steps**: O(N) - single array
- **Branching**: Shares same array (mutates original if not careful)

```typescript
// Memory layout:
OperationImpl {
  state: {
    steps: [fn1, fn2, fn3, ...]  // Direct array, N elements
  }
}
```

### Instruction (Optimized)
- **Storage**: Direct array `steps[]` in `InstructionImpl`
- **Per chain operation**: O(N) - array copy (immutability requirement)
- **Memory per step**: 1 array element reference
- **Total memory for N steps**: O(N) - single array
- **No cache needed**: Array already built and ready
- **Branching**: Each branch has its own array copy (immutable)

```typescript
// Memory layout:
InstructionImpl {
  steps: [fn1, fn2, fn3, ...]  // Direct array, N elements
}
```

### Memory Comparison

| Operation | Memory | Notes |
|-----------|--------|-------|
| **Operation** | O(N) | Single array, shared across branches (if mutated) |
| **Instruction** | O(N) | Single array per instance, no cache needed |

**Key Difference**: 
- Operation: O(N) memory (just the array)
- Instruction: O(N) memory (just the array, same as Operation)
- Both use same memory footprint for single chain
- Instruction branches have separate arrays (immutability)

## Chain Operation Overhead

### Operation
```typescript
step(fn) {
  this.state.steps.push(...)  // O(1) array push
  return this;  // Same instance
}
```
- **Time**: O(1) amortized (array push may resize occasionally)
- **Memory**: No new allocations (reuses instance)
- **Side effect**: Mutates original instance

### Instruction (Optimized)
```typescript
step(fn) {
  const newSteps = [...this.steps, newStep];  // O(N) array copy
  return new InstructionImpl(..., newSteps, ...);  // O(1)
}
```
- **Time**: O(N) - array copy (immutability requirement)
- **Memory**: 1 allocation (InstructionImpl) + array copy
- **Side effect**: None (immutable)

### Chain Operation Comparison

| Metric | Operation | Instruction |
|--------|-----------|-------------|
| **Time Complexity** | O(1) amortized | O(N) array copy |
| **Memory Allocations** | 0 (reuse) | 1 per step + array copy |
| **Instance Creation** | 0 (mutates) | 1 per step |
| **Immutability** | No | Yes |

**Verdict**: Operation is faster for chaining (O(1) vs O(N)), but Instruction maintains immutability at the cost of array copying.

## Compilation/Run Overhead

### Operation
```typescript
compile() {
  // Steps already in array, no work needed
  return async (value) => {
    // Execute directly from state.steps
    for (const step of this.state.steps) { ... }
  };
}
```
- **Compilation time**: O(1) - steps already in array
- **Execution time**: O(N) - iterate through array
- **Memory**: No additional allocations

### Instruction (Optimized)
```typescript
compile() {
  // Steps already in array, no work needed
  return async (value) => {
    // Execute directly from this.steps
    for (const step of this.steps) { ... }
  };
}
```
- **Compilation time**: O(1) - array already ready
- **Execution time**: O(N) - iterate through array
- **Memory**: No additional allocations (array already exists)

### Compilation Comparison

| Metric | Operation | Instruction |
|--------|-----------|-------------|
| **First compile** | O(1) | O(1) |
| **Subsequent compiles** | O(1) | O(1) |
| **Execution** | O(N) | O(N) |
| **Memory overhead** | 0 | 0 |

**Verdict**: Both have zero compilation overhead. Instruction no longer requires O(N) traversal since array is built during chain operations.

## Branching Overhead

### Operation
```typescript
const base = operation(ctx).step(f1).step(f2);
const branch1 = base.step(f3a);  // Mutates base!
const branch2 = base.step(f3b);  // branch2 includes f3a too!
```
- **Problem**: Mutable - branches share same array
- **Memory**: O(N) total (shared array)
- **Correctness**: Dangerous - branches can interfere

### Instruction (Optimized)
```typescript
const base = instruction(ctx).step(f1).step(f2);
const branch1 = base.step(f3a);  // New instance, array copy
const branch2 = base.step(f3b);  // New instance, array copy
```
- **Benefit**: Immutable - each branch is independent
- **Memory**: O(N) per branch (separate arrays)
- **Correctness**: Safe - branches don't interfere

### Branching Comparison

| Scenario | Operation | Instruction |
|----------|-----------|-------------|
| **Memory for 2 branches** | O(N) shared | O(2N) separate |
| **Safety** | Low (mutation risk) | High (immutable) |
| **Correctness** | Requires careful use | Always correct |
| **Branch cost** | O(1) push | O(N) array copy |

**Verdict**: Instruction is safer but uses more memory for branches and requires O(N) array copy per branch. Operation is more memory-efficient but requires careful usage.

## Execution Performance

### Operation
```typescript
for (const step of this.state.steps) {
  const [newContext, result] = await step(currentContext, currentValue);
  // ...
}
```
- **Direct array access**: O(1) per step
- **No overhead**: Steps already in execution order

### Instruction (Optimized)
```typescript
for (const step of this.steps) {  // Direct array access
  const [result, newContext] = await step(currentValue, currentContext);
  // ...
}
```
- **Array access**: O(1) per step (direct access, no compilation needed)
- **Same execution**: Identical performance to Operation

### Execution Comparison

| Metric | Operation | Instruction |
|--------|-----------|-------------|
| **Per-step overhead** | O(1) | O(1) |
| **Execution time** | O(N) | O(N) |
| **Performance** | Identical | Identical |

**Verdict**: Execution performance is identical. Both use direct array access with no overhead.

## Summary Table

| Aspect | Operation | Instruction | Winner |
|--------|-----------|-------------|--------|
| **Chain operation time** | O(1) | O(N) array copy | Operation |
| **Chain operation memory** | 0 allocations | 1 allocation + array copy | Operation |
| **Compilation time** | O(1) | O(1) | Tie |
| **Execution time** | O(N) | O(N) | Tie |
| **Memory (single chain)** | O(N) | O(N) | Tie |
| **Memory (branching)** | O(N) shared | O(N) per branch | Operation |
| **Immutability** | No | Yes | Instruction |
| **Branching safety** | Low | High | Instruction |

## Use Cases

### Use Operation when:
- ✅ Performance is critical (no compilation overhead)
- ✅ Memory is constrained (single array, no branching)
- ✅ You don't need branching
- ✅ You can ensure no mutation issues

### Use Instruction when:
- ✅ You need immutable branching
- ✅ You want safe, predictable behavior
- ✅ You're willing to pay O(N) array copy cost per chain operation
- ✅ Memory usage is acceptable (O(N) per branch)

## Performance Benchmarks (Estimated)

### Chain 100 steps
- **Operation**: ~100 array pushes = ~1ms
- **Instruction**: ~100 array copies = ~10ms (O(N) per step)
- **Overhead**: ~10x slower (but maintains immutability)

### Compile pipeline
- **Operation**: ~0.001ms (no work)
- **Instruction**: ~0.001ms (no work, array already ready)
- **Overhead**: None (optimized)

### Execute pipeline (100 steps)
- **Operation**: ~10ms (depends on step work)
- **Instruction**: ~10ms (same performance)
- **Overhead**: None

### Branch into 10 chains
- **Operation**: ~0.1ms (just array pushes, but unsafe)
- **Instruction**: ~10ms (10 array copies, but safe)
- **Overhead**: ~100x slower, but safe and correct

## Conclusion

**Operation** is optimized for:
- Single-chain pipelines
- Maximum performance
- Minimal memory usage

**Instruction** is optimized for:
- Immutable branching
- Type safety through immutability
- Predictable behavior

The overhead trade-off is:
- **Operation**: Faster chaining (O(1)), zero compilation cost, but mutable and unsafe for branching
- **Instruction**: Slower chaining (O(N) array copy), zero compilation cost (optimized), immutable and safe for branching

**Key Optimization**: Instruction now has O(1) compilation (array is built during chain operations), eliminating the previous O(N) compilation overhead. The trade-off is O(N) array copy per chain operation to maintain immutability.

Choose based on your needs: performance vs. safety.

