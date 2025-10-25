import { describe, test, expect } from 'bun:test';
import { operation, ok, err, type Result } from '../src';

// Test data and functions for 10-step pipeline
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

describe('Focused Performance Analysis - 10-Step Pipeline', () => {
  test('1. Compiled Operation Overhead vs Traditional', async () => {
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
    
    console.log(`\n=== 1. Compiled Operation Overhead (${iterations} iterations) ===`);
    console.log(`Traditional: ${traditionalTime.toFixed(2)}ms (${(traditionalTime/iterations).toFixed(3)}ms per call)`);
    console.log(`Regular Operation: ${operationTime.toFixed(2)}ms (${(operationTime/iterations).toFixed(3)}ms per call)`);
    console.log(`Overhead: ${overhead.toFixed(1)}%`);
    
    expect(overhead).toBeGreaterThan(0);
  });

  test('2. Compilation Overhead Analysis', async () => {
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

    console.log(`\n=== 2. Compilation Overhead Analysis (${iterations} compilations) ===`);
    console.log(`Average compilation time: ${avgCompilationTime.toFixed(3)}ms`);
    console.log(`Min compilation time: ${minCompilationTime.toFixed(3)}ms`);
    console.log(`Max compilation time: ${maxCompilationTime.toFixed(3)}ms`);
    console.log(`Compilation overhead per call: ${avgCompilationTime.toFixed(3)}ms`);

    expect(avgCompilationTime).toBeGreaterThanOrEqual(0);
  });

  test('3. Performance Without Pre-compiling (Average Call)', async () => {
    const iterations = 1000;
    
    // Warm up
    for (let i = 0; i < 10; i++) {
      await processUserOperation(testUser, testContext);
    }

    // Measure regular operation calls (no pre-compilation)
    const operationTimes: number[] = [];
    
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await processUserOperation(testUser, testContext);
      const callTime = performance.now() - start;
      operationTimes.push(callTime);
    }

    const avgCallTime = operationTimes.reduce((a, b) => a + b, 0) / iterations;
    const minCallTime = Math.min(...operationTimes);
    const maxCallTime = Math.max(...operationTimes);
    const p95CallTime = operationTimes.sort((a, b) => a - b)[Math.floor(iterations * 0.95)];

    console.log(`\n=== 3. Performance Without Pre-compiling (${iterations} calls) ===`);
    console.log(`Average call time: ${avgCallTime.toFixed(3)}ms`);
    console.log(`Min call time: ${minCallTime.toFixed(3)}ms`);
    console.log(`Max call time: ${maxCallTime.toFixed(3)}ms`);
    console.log(`95th percentile: ${p95CallTime.toFixed(3)}ms`);

    expect(avgCallTime).toBeGreaterThan(0);
  });

  test('4. Detailed Overhead Breakdown', async () => {
    const iterations = 500;
    
    // Warm up
    for (let i = 0; i < 5; i++) {
      await processUserTraditional(testUser, testContext);
      await processUserOperation(testUser, testContext);
    }

    // Measure traditional calls
    const traditionalTimes: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await processUserTraditional(testUser, testContext);
      traditionalTimes.push(performance.now() - start);
    }

    // Measure operation calls
    const operationTimes: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await processUserOperation(testUser, testContext);
      operationTimes.push(performance.now() - start);
    }

    const avgTraditional = traditionalTimes.reduce((a, b) => a + b, 0) / iterations;
    const avgOperation = operationTimes.reduce((a, b) => a + b, 0) / iterations;
    const overhead = ((avgOperation - avgTraditional) / avgTraditional) * 100;

    console.log(`\n=== 4. Detailed Overhead Breakdown (${iterations} calls each) ===`);
    console.log(`Traditional average: ${avgTraditional.toFixed(3)}ms`);
    console.log(`Operation average: ${avgOperation.toFixed(3)}ms`);
    console.log(`Overhead: ${overhead.toFixed(1)}%`);
    console.log(`Overhead in microseconds: ${((avgOperation - avgTraditional) * 1000).toFixed(1)}μs`);

    expect(overhead).toBeGreaterThan(0);
  });

  test('5. Memory Allocation Analysis', async () => {
    const iterations = 100;
    
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

    console.log(`\n=== 5. Memory Allocation Analysis (${iterations} calls) ===`);
    console.log(`Memory increase: ${(memoryIncrease / 1024).toFixed(2)}KB`);
    console.log(`Memory per call: ${(memoryPerCall / 1024).toFixed(2)}KB`);
    console.log(`Initial heap: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`Final heap: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);

    expect(memoryIncrease).toBeGreaterThanOrEqual(0);
  });
});
