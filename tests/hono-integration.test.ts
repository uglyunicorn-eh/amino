import { describe, test, expect } from 'bun:test';
import { makeOperation, ok, err, type Result } from '../src';

// Mock Hono types for demonstration
interface HonoContext {
  req: {
    param: (key: string) => string | undefined;
    query: (key: string) => string | undefined;
    json: () => Promise<any>;
  };
  json: (data: any, status?: number) => Response;
  text: (text: string, status?: number) => Response;
  status: (code: number) => HonoContext;
}

interface User {
  id: string;
  name: string;
  email: string;
}

interface CreateUserRequest {
  name: string;
  email: string;
}

interface UserResponse {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

// Custom operation factory for Hono handlers
const honoOperation = makeOperation(
  (result: Result<any>, context: { honoCtx: HonoContext }) => {
    if (result.err !== undefined) {
      return context.honoCtx.json(
        { 
          error: result.err.message,
          code: 'OPERATION_ERROR'
        }, 
        400
      );
    }
    return context.honoCtx.json(result.res);
  }
);

// Business logic functions
const validateUserId = (userId: string): Result<string> => {
  if (!userId || userId.length < 1) {
    return err('Invalid user ID');
  }
  return ok(userId);
};

const fetchUser = async (userId: string): Promise<Result<User>> => {
  // Simulate database fetch
  if (userId === 'notfound') {
    return err('User not found');
  }
  return ok({
    id: userId,
    name: 'John Doe',
    email: 'john@example.com'
  });
};

const validateCreateUserRequest = (data: any): Result<CreateUserRequest> => {
  if (!data.name || !data.email) {
    return err('Name and email are required');
  }
  if (!data.email.includes('@')) {
    return err('Invalid email format');
  }
  return ok(data as CreateUserRequest);
};

const createUser = async (request: CreateUserRequest): Promise<Result<UserResponse>> => {
  // Simulate user creation
  return ok({
    id: 'user123',
    name: request.name,
    email: request.email,
    createdAt: new Date().toISOString()
  });
};

const enrichUserData = (user: User): Result<UserResponse> => {
  return ok({
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: new Date().toISOString()
  });
};

const logRequest = (data: any, context: { honoCtx: HonoContext }) => {
  console.log(`Processing request: ${JSON.stringify(data)}`);
  return context;
};

describe('Custom Operations for Hono Handlers', () => {
  test('GET /users/:id - Success case', async () => {
    const mockHonoCtx: HonoContext = {
      req: {
        param: (key: string) => key === 'id' ? 'user123' : undefined,
        query: () => undefined,
        json: async () => ({})
      },
      json: (data: any, status?: number) => {
        expect(data).toEqual({
          id: 'user123',
          name: 'John Doe',
          email: 'john@example.com',
          createdAt: expect.any(String)
        });
        expect(status).toBeUndefined();
        return new Response(JSON.stringify(data));
      },
      text: () => new Response(''),
      status: () => mockHonoCtx
    };

    const response = await honoOperation({ honoCtx: mockHonoCtx }, undefined)
      .step(() => validateUserId(mockHonoCtx.req.param('id')!))
      .step((userId: string) => fetchUser(userId))
      .step((user: User) => enrichUserData(user))
      .complete();

    expect(response).toBeInstanceOf(Response);
  });

  test('GET /users/:id - User not found', async () => {
    const mockHonoCtx: HonoContext = {
      req: {
        param: (key: string) => key === 'id' ? 'notfound' : undefined,
        query: () => undefined,
        json: async () => ({})
      },
      json: (data: any, status?: number) => {
        expect(data).toEqual({
          error: 'User not found',
          code: 'OPERATION_ERROR'
        });
        expect(status).toBe(400);
        return new Response(JSON.stringify(data), { status: 400 });
      },
      text: () => new Response(''),
      status: () => mockHonoCtx
    };

    const response = await honoOperation({ honoCtx: mockHonoCtx }, undefined)
      .step(() => validateUserId(mockHonoCtx.req.param('id')!))
      .step((userId: string) => fetchUser(userId))
      .step((user: User) => enrichUserData(user))
      .complete();

    expect(response).toBeInstanceOf(Response);
  });

  test('POST /users - Create user success', async () => {
    const mockHonoCtx: HonoContext = {
      req: {
        param: () => undefined,
        query: () => undefined,
        json: async () => ({ name: 'Jane Doe', email: 'jane@example.com' })
      },
      json: (data: any, status?: number) => {
        expect(data).toEqual({
          id: 'user123',
          name: 'Jane Doe',
          email: 'jane@example.com',
          createdAt: expect.any(String)
        });
        expect(status).toBeUndefined();
        return new Response(JSON.stringify(data));
      },
      text: () => new Response(''),
      status: () => mockHonoCtx
    };

    const response = await honoOperation({ honoCtx: mockHonoCtx }, undefined)
      .step(async () => {
        const body = await mockHonoCtx.req.json();
        return validateCreateUserRequest(body);
      })
      .step((request: CreateUserRequest) => createUser(request))
      .complete();

    expect(response).toBeInstanceOf(Response);
  });

  test('POST /users - Validation error', async () => {
    const mockHonoCtx: HonoContext = {
      req: {
        param: () => undefined,
        query: () => undefined,
        json: async () => ({ name: 'Jane Doe' }) // Missing email
      },
      json: (data: any, status?: number) => {
        expect(data).toEqual({
          error: 'Name and email are required',
          code: 'OPERATION_ERROR'
        });
        expect(status).toBe(400);
        return new Response(JSON.stringify(data), { status: 400 });
      },
      text: () => new Response(''),
      status: () => mockHonoCtx
    };

    const response = await honoOperation({ honoCtx: mockHonoCtx }, undefined)
      .step(async () => {
        const body = await mockHonoCtx.req.json();
        return validateCreateUserRequest(body);
      })
      .step((request: CreateUserRequest) => createUser(request))
      .complete();

    expect(response).toBeInstanceOf(Response);
  });

  test('Custom error handling with specific error types', async () => {
    class ValidationError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'ValidationError';
      }
    }

    const honoOperationWithCustomError = makeOperation(
      (result: Result<any>, context: { honoCtx: HonoContext }) => {
        if (result.err !== undefined) {
          const statusCode = result.err instanceof ValidationError ? 422 : 400;
          return context.honoCtx.json(
            { 
              error: result.err.message,
              type: result.err.name,
              code: 'OPERATION_ERROR'
            }, 
            statusCode
          );
        }
        return context.honoCtx.json(result.res);
      }
    );

    const mockHonoCtx: HonoContext = {
      req: {
        param: () => undefined,
        query: () => undefined,
        json: async () => ({ name: 'Jane Doe' })
      },
      json: (data: any, status?: number) => {
        expect(data).toEqual({
          error: 'Validation failed',
          type: 'ValidationError',
          code: 'OPERATION_ERROR'
        });
        expect(status).toBe(422);
        return new Response(JSON.stringify(data), { status: 422 });
      },
      text: () => new Response(''),
      status: () => mockHonoCtx
    };

    const response = await honoOperationWithCustomError({ honoCtx: mockHonoCtx }, undefined)
      .failsWith(ValidationError, 'Validation failed')
      .step(async () => {
        const body = await mockHonoCtx.req.json();
        const result = validateCreateUserRequest(body);
        if (result.err) {
          return err(new ValidationError(result.err.message));
        }
        return ok(result.res);
      })
      .step((request: CreateUserRequest) => createUser(request))
      .complete();

    expect(response).toBeInstanceOf(Response);
  });
});
