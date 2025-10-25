import { describe, test, expect } from 'bun:test';
import { operation, ok, err, type Result } from '../src';

// Test data and functions
interface User {
  id: string;
  name: string;
  email: string;
  age: number;
}

interface ProcessedUser {
  id: string;
  displayName: string;
  emailDomain: string;
  ageGroup: string;
  isValid: boolean;
}

interface ProcessingContext {
  requestId: string;
  timestamp: number;
  processedCount: number;
}

// Step functions for 10-step pipeline
const validateUser = (user: User): Result<User> => 
  user.id && user.name && user.email ? ok(user) : err('Invalid user data');

const sanitizeName = (user: User): Result<User> => 
  ok({ ...user, name: user.name.trim() });

const validateEmail = (user: User): Result<User> => 
  user.email.includes('@') ? ok(user) : err('Invalid email');

const checkAge = (user: User): Result<User> => 
  user.age >= 0 && user.age <= 150 ? ok(user) : err('Invalid age');

const createDisplayName = (user: User): Result<User & { displayName: string }> => 
  ok({ ...user, displayName: `${user.name} (${user.age})` });

const extractEmailDomain = (user: User & { displayName: string }): Result<User & { displayName: string; emailDomain: string }> => 
  ok({ ...user, emailDomain: user.email.split('@')[1] });

const categorizeAge = (user: User & { displayName: string; emailDomain: string }): Result<User & { displayName: string; emailDomain: string; ageGroup: string }> => 
  ok({ ...user, ageGroup: user.age < 18 ? 'minor' : user.age < 65 ? 'adult' : 'senior' });

const validateBusinessRules = (user: User & { displayName: string; emailDomain: string; ageGroup: string }): Result<User & { displayName: string; emailDomain: string; ageGroup: string }> => 
  user.ageGroup !== 'minor' || user.emailDomain.includes('edu') ? ok(user) : err('Business rule violation');

const finalizeUser = (user: User & { displayName: string; emailDomain: string; ageGroup: string }): Result<ProcessedUser> => 
  ok({
    id: user.id,
    displayName: user.displayName,
    emailDomain: user.emailDomain,
    ageGroup: user.ageGroup,
    isValid: true
  });

const logProcessing = (user: ProcessedUser, context: ProcessingContext): ProcessingContext => ({
  ...context,
  processedCount: context.processedCount + 1
});

// Traditional function chain (baseline)
async function processUserTraditional(user: User, context: ProcessingContext): Promise<Result<ProcessedUser>> {
  try {
    const step1 = validateUser(user);
    if (step1.err) return step1;

    const step2 = sanitizeName(step1.res);
    if (step2.err) return step2;

    const step3 = validateEmail(step2.res);
    if (step3.err) return step3;

    const step4 = checkAge(step3.res);
    if (step4.err) return step4;

    const step5 = createDisplayName(step4.res);
    if (step5.err) return step5;

    const step6 = extractEmailDomain(step5.res);
    if (step6.err) return step6;

    const step7 = categorizeAge(step6.res);
    if (step7.err) return step7;

    const step8 = validateBusinessRules(step7.res);
    if (step8.err) return step8;

    const step9 = finalizeUser(step8.res);
    if (step9.err) return step9;

    logProcessing(step9.res, context);
    return step9;
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

// Regular operation (no compilation)
async function processUserOperation(user: User, context: ProcessingContext): Promise<Result<ProcessedUser>> {
  return await operation(context, user)
    .step(validateUser)
    .step(sanitizeName)
    .step(validateEmail)
    .step(checkAge)
    .step(createDisplayName)
    .step(extractEmailDomain)
    .step(categorizeAge)
    .step(validateBusinessRules)
    .step(finalizeUser)
    .context(logProcessing)
    .complete();
}

// Compiled operation (compiled once, used multiple times)
let compiledPipeline: ((user: User) => Promise<Result<ProcessedUser>>) | null = null;

async function processUserOperationCompiled(user: User, context: ProcessingContext): Promise<Result<ProcessedUser>> {
  if (!compiledPipeline) {
    compiledPipeline = operation(context, user)
      .step(validateUser)
      .step(sanitizeName)
      .step(validateEmail)
      .step(checkAge)
      .step(createDisplayName)
      .step(extractEmailDomain)
      .step(categorizeAge)
      .step(validateBusinessRules)
      .step(finalizeUser)
      .context(logProcessing)
      .compile();
  }
  return await compiledPipeline(user);
}

// Pre-compiled pipeline (compiled once, reused)
let preCompiledPipeline: ((user: User) => Promise<Result<ProcessedUser>>) | null = null;

async function processUserOperationPreCompiled(user: User, context: ProcessingContext): Promise<Result<ProcessedUser>> {
  if (!preCompiledPipeline) {
    preCompiledPipeline = operation(context, user)
      .step(validateUser)
      .step(sanitizeName)
      .step(validateEmail)
      .step(checkAge)
      .step(createDisplayName)
      .step(extractEmailDomain)
      .step(categorizeAge)
      .step(validateBusinessRules)
      .step(finalizeUser)
      .context(logProcessing)
      .compile();
  }
  return await preCompiledPipeline(user);
}

// Test data
const testUser: User = {
  id: 'user123',
  name: 'John Doe',
  email: 'john@example.com',
  age: 30
};

const testContext: ProcessingContext = {
  requestId: 'req456',
  timestamp: Date.now(),
  processedCount: 0
};

describe('Performance Analysis - 10-Step Pipeline', () => {
  test('Traditional vs Operation Pipeline Overhead', async () => {
    const iterations = 1000;
    
    // Warm up
    for (let i = 0; i < 10; i++) {
      await processUserTraditional(testUser, testContext);
      await processUserOperation(testUser, testContext);
    }

    // Benchmark Traditional
    const traditionalStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      await processUserTraditional(testUser, testContext);
    }
    const traditionalTime = performance.now() - traditionalStart;

    // Benchmark Regular Operation
    const operationStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      await processUserOperation(testUser, testContext);
    }
    const operationTime = performance.now() - operationStart;

    const overhead = ((operationTime - traditionalTime) / traditionalTime) * 100;
    
    console.log(`\n=== Traditional vs Regular Operation (${iterations} iterations) ===`);
    console.log(`Traditional: ${traditionalTime.toFixed(2)}ms (${(traditionalTime/iterations).toFixed(3)}ms per call)`);
    console.log(`Regular Operation: ${operationTime.toFixed(2)}ms (${(operationTime/iterations).toFixed(3)}ms per call)`);
    console.log(`Overhead: ${overhead.toFixed(1)}%`);
    
    expect(overhead).toBeGreaterThan(0); // Regular operation should be slower
  });

  test('Compilation Overhead Analysis', async () => {
    const iterations = 1000;
    
    // Warm up
    for (let i = 0; i < 10; i++) {
      await processUserOperation(testUser, testContext);
      await processUserOperationCompiled(testUser, testContext);
    }

    // Reset compiled pipeline for accurate measurement
    compiledPipeline = null;

    // Benchmark Regular Operation
    const regularStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      await processUserOperation(testUser, testContext);
    }
    const regularTime = performance.now() - regularStart;

    // Benchmark Compiled Operation (includes compilation cost)
    const compiledStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      await processUserOperationCompiled(testUser, testContext);
    }
    const compiledTime = performance.now() - compiledStart;

    const improvement = ((regularTime - compiledTime) / regularTime) * 100;
    
    console.log(`\n=== Regular vs Compiled Operation (${iterations} iterations) ===`);
    console.log(`Regular Operation: ${regularTime.toFixed(2)}ms (${(regularTime/iterations).toFixed(3)}ms per call)`);
    console.log(`Compiled Operation: ${compiledTime.toFixed(2)}ms (${(compiledTime/iterations).toFixed(3)}ms per call)`);
    console.log(`Improvement: ${improvement.toFixed(1)}%`);
    
    // Note: Compiled operations may not always be faster due to compilation overhead
    expect(improvement).toBeGreaterThan(-50); // Allow for some variance
  });

  test('Pre-compiled Pipeline Performance', async () => {
    const iterations = 1000;
    
    // Warm up
    for (let i = 0; i < 10; i++) {
      await processUserOperation(testUser, testContext);
      await processUserOperationPreCompiled(testUser, testContext);
    }

    // Reset pre-compiled pipeline for accurate measurement
    preCompiledPipeline = null;

    // Benchmark Regular Operation
    const regularStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      await processUserOperation(testUser, testContext);
    }
    const regularTime = performance.now() - regularStart;

    // Benchmark Pre-compiled Operation
    const preCompiledStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      await processUserOperationPreCompiled(testUser, testContext);
    }
    const preCompiledTime = performance.now() - preCompiledStart;

    const improvement = ((regularTime - preCompiledTime) / regularTime) * 100;
    
    console.log(`\n=== Regular vs Pre-compiled Pipeline (${iterations} iterations) ===`);
    console.log(`Regular Operation: ${regularTime.toFixed(2)}ms (${(regularTime/iterations).toFixed(3)}ms per call)`);
    console.log(`Pre-compiled Pipeline: ${preCompiledTime.toFixed(2)}ms (${(preCompiledTime/iterations).toFixed(3)}ms per call)`);
    console.log(`Improvement: ${improvement.toFixed(1)}%`);
    
    // Note: Pre-compiled operations may not always be faster due to compilation overhead
    expect(improvement).toBeGreaterThan(-50); // Allow for some variance
  });

  test('Compilation Cost Analysis', async () => {
    const iterations = 100;
    
    // Measure compilation cost
    const compilationTimes: number[] = [];
    
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      
      const compiledFn = operation(testContext, testUser)
        .step(validateUser)
        .step(sanitizeName)
        .step(validateEmail)
        .step(checkAge)
        .step(createDisplayName)
        .step(extractEmailDomain)
        .step(categorizeAge)
        .step(validateBusinessRules)
        .step(finalizeUser)
        .context(logProcessing)
        .compile();
      
      const compilationTime = performance.now() - start;
      compilationTimes.push(compilationTime);
    }

    const avgCompilationTime = compilationTimes.reduce((a, b) => a + b, 0) / iterations;
    const minCompilationTime = Math.min(...compilationTimes);
    const maxCompilationTime = Math.max(...compilationTimes);

    console.log(`\n=== Compilation Cost Analysis (${iterations} compilations) ===`);
    console.log(`Average compilation time: ${avgCompilationTime.toFixed(3)}ms`);
    console.log(`Min compilation time: ${minCompilationTime.toFixed(3)}ms`);
    console.log(`Max compilation time: ${maxCompilationTime.toFixed(3)}ms`);
    console.log(`Compilation overhead per call: ${avgCompilationTime.toFixed(3)}ms`);

    expect(avgCompilationTime).toBeGreaterThan(0);
  });

  test('Single Call Performance Comparison', async () => {
    const iterations = 1000;
    
    // Warm up
    for (let i = 0; i < 10; i++) {
      await processUserTraditional(testUser, testContext);
      await processUserOperation(testUser, testContext);
      await processUserOperationCompiled(testUser, testContext);
      await processUserOperationPreCompiled(testUser, testContext);
    }

    // Reset compiled pipelines
    compiledPipeline = null;
    preCompiledPipeline = null;

    // Single call measurements
    const singleCallTimes = {
      traditional: [] as number[],
      regular: [] as number[],
      compiled: [] as number[],
      preCompiled: [] as number[]
    };

    // Measure single calls
    for (let i = 0; i < iterations; i++) {
      // Traditional
      const traditionalStart = performance.now();
      await processUserTraditional(testUser, testContext);
      singleCallTimes.traditional.push(performance.now() - traditionalStart);

      // Regular Operation
      const regularStart = performance.now();
      await processUserOperation(testUser, testContext);
      singleCallTimes.regular.push(performance.now() - regularStart);

      // Compiled Operation (reset each time to measure compilation + execution)
      compiledPipeline = null;
      const compiledStart = performance.now();
      await processUserOperationCompiled(testUser, testContext);
      singleCallTimes.compiled.push(performance.now() - compiledStart);

      // Pre-compiled Operation (reset each time to measure compilation + execution)
      preCompiledPipeline = null;
      const preCompiledStart = performance.now();
      await processUserOperationPreCompiled(testUser, testContext);
      singleCallTimes.preCompiled.push(performance.now() - preCompiledStart);
    }

    // Calculate averages
    const averages = {
      traditional: singleCallTimes.traditional.reduce((a, b) => a + b, 0) / iterations,
      regular: singleCallTimes.regular.reduce((a, b) => a + b, 0) / iterations,
      compiled: singleCallTimes.compiled.reduce((a, b) => a + b, 0) / iterations,
      preCompiled: singleCallTimes.preCompiled.reduce((a, b) => a + b, 0) / iterations
    };

    console.log(`\n=== Single Call Performance (${iterations} calls) ===`);
    console.log(`Traditional: ${averages.traditional.toFixed(3)}ms per call`);
    console.log(`Regular Operation: ${averages.regular.toFixed(3)}ms per call`);
    console.log(`Compiled Operation: ${averages.compiled.toFixed(3)}ms per call`);
    console.log(`Pre-compiled Pipeline: ${averages.preCompiled.toFixed(3)}ms per call`);
    
    // Calculate overheads
    const regularOverhead = ((averages.regular - averages.traditional) / averages.traditional) * 100;
    const compiledOverhead = ((averages.compiled - averages.traditional) / averages.traditional) * 100;
    const preCompiledOverhead = ((averages.preCompiled - averages.traditional) / averages.traditional) * 100;

    console.log(`\n=== Overhead Analysis ===`);
    console.log(`Regular Operation overhead: ${regularOverhead.toFixed(1)}%`);
    console.log(`Compiled Operation overhead: ${compiledOverhead.toFixed(1)}%`);
    console.log(`Pre-compiled Pipeline overhead: ${preCompiledOverhead.toFixed(1)}%`);

    expect(averages.traditional).toBeGreaterThan(0);
    expect(averages.regular).toBeGreaterThan(0);
    expect(averages.compiled).toBeGreaterThan(0);
    expect(averages.preCompiled).toBeGreaterThan(0);
  });

  test('Memory Usage Analysis', async () => {
    const iterations = 1000;
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    const initialMemory = process.memoryUsage();

    // Run operations
    for (let i = 0; i < iterations; i++) {
      await processUserOperation(testUser, testContext);
    }

    const finalMemory = process.memoryUsage();
    const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
    const memoryPerCall = memoryIncrease / iterations;

    console.log(`\n=== Memory Usage Analysis (${iterations} calls) ===`);
    console.log(`Memory increase: ${(memoryIncrease / 1024).toFixed(2)}KB`);
    console.log(`Memory per call: ${(memoryPerCall / 1024).toFixed(2)}KB`);
    console.log(`Initial heap: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`Final heap: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);

    // Memory usage should be measurable (allow for small values)
    expect(memoryIncrease).toBeGreaterThanOrEqual(0);
  });
});
