// src/common/common.spec.ts
// Unit tests — Step 3 Common Module
// Covers: decorators, guards, filter, interceptor, pipe, crypto, pagination

import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';

// ── Import subjects ────────────────────────────────────────────────────────
import { IS_PUBLIC_KEY } from './decorators/public.decorator';
import { ROLES_KEY } from './decorators/roles.decorator';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { ResponseTransformInterceptor } from './interceptors/response-transform.interceptor';
import { ParseUUIDPipe } from './pipes/parse-uuid.pipe';
import {
  generateOTP,
  generateSignedToken,
  validateSignedToken,
} from './utils/crypto.util';
import {
  buildPaginationMeta,
  buildPaginationQuery,
} from './utils/pagination.util';
import { MemberRole } from '../database/entities/enums';
import { ErrorCode } from './constants/error-codes';

// ── Helpers ────────────────────────────────────────────────────────────────

function mockExecutionContext(overrides: {
  user?: Record<string, unknown>;
  handlerMeta?: Record<string, unknown>;
  classMeta?: Record<string, unknown>;
}): ExecutionContext {
  const getRequest = jest
    .fn()
    .mockReturnValue({ user: overrides.user ?? null, headers: {} });
  return {
    switchToHttp: () => ({
      getRequest,
      getResponse: jest.fn().mockReturnValue({ statusCode: 200 }),
    }),
    getHandler: jest.fn().mockReturnValue(() => {}),
    getClass: jest.fn().mockReturnValue(class {}),
  } as unknown as ExecutionContext;
}

function mockReflector(key: string, value: unknown): Reflector {
  return {
    getAllAndOverride: jest
      .fn()
      .mockImplementation((k: string) => (k === key ? value : undefined)),
  } as unknown as Reflector;
}

// ── 1. Public Decorator ────────────────────────────────────────────────────

describe('Public Decorator', () => {
  it('should set IS_PUBLIC_KEY metadata to true', () => {
    const target = class {};
    Reflect.defineMetadata(IS_PUBLIC_KEY, true, target);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, target)).toBe(true);
  });
});

// ── 2. Roles Decorator ─────────────────────────────────────────────────────

describe('Roles Decorator', () => {
  it('should set ROLES_KEY metadata with provided roles', () => {
    const target = class {};
    Reflect.defineMetadata(ROLES_KEY, [MemberRole.HOST], target);
    expect(Reflect.getMetadata(ROLES_KEY, target)).toEqual([MemberRole.HOST]);
  });
});

// ── 3. JwtAuthGuard ────────────────────────────────────────────────────────

describe('JwtAuthGuard', () => {
  it('should allow access when @Public() is set', () => {
    const reflector = mockReflector(IS_PUBLIC_KEY, true);
    const guard = new JwtAuthGuard(reflector);
    const ctx = mockExecutionContext({});
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('handleRequest should throw 401 when no user', () => {
    const reflector = mockReflector(IS_PUBLIC_KEY, false);
    const guard = new JwtAuthGuard(reflector);
    expect(() => guard.handleRequest(null, null)).toThrow(
      UnauthorizedException,
    );
  });

  it('handleRequest should throw 401 when error present', () => {
    const reflector = mockReflector(IS_PUBLIC_KEY, false);
    const guard = new JwtAuthGuard(reflector);
    expect(() => guard.handleRequest(new Error('fail'), null)).toThrow(
      UnauthorizedException,
    );
  });

  it('handleRequest should return user when valid', () => {
    const reflector = mockReflector(IS_PUBLIC_KEY, false);
    const guard = new JwtAuthGuard(reflector);
    const user = { sub: 'uuid', email: 'a@b.com', role: 'host' };
    expect(guard.handleRequest(null, user)).toBe(user);
  });
});

// ── 4. RolesGuard ─────────────────────────────────────────────────────────

describe('RolesGuard', () => {
  it('should allow when no roles required', () => {
    const reflector = mockReflector(ROLES_KEY, undefined);
    const guard = new RolesGuard(reflector);
    const ctx = mockExecutionContext({ user: { role: MemberRole.PAYER } });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow HOST when HOST required', () => {
    const reflector = mockReflector(ROLES_KEY, [MemberRole.HOST]);
    const guard = new RolesGuard(reflector);
    const ctx = mockExecutionContext({ user: { role: MemberRole.HOST } });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should throw 403 when PAYER tries HOST-only route', () => {
    const reflector = mockReflector(ROLES_KEY, [MemberRole.HOST]);
    const guard = new RolesGuard(reflector);
    const ctx = mockExecutionContext({ user: { role: MemberRole.PAYER } });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should throw 403 when no user on protected route', () => {
    const reflector = mockReflector(ROLES_KEY, [MemberRole.HOST]);
    const guard = new RolesGuard(reflector);
    const ctx = mockExecutionContext({ user: undefined });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});

// ── 5. HttpExceptionFilter ────────────────────────────────────────────────

describe('HttpExceptionFilter', () => {
  const makeHostMock = () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const getResponse = jest.fn(() => ({ status }));
    const getRequest = jest.fn(() => ({
      headers: {},
      method: 'GET',
      url: '/test',
    }));
    return {
      host: {
        switchToHttp: () => ({
          getResponse,
          getRequest,
        }),
      } as unknown as import('@nestjs/common').ArgumentsHost,
      json,
      status,
    };
  };

  it('should return error envelope for HttpException', () => {
    const filter = new HttpExceptionFilter();
    const { host, json, status } = makeHostMock();
    filter.catch(new HttpException('Not found', 404), host);
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    );
  });

  it('should return 500 for unhandled exception', () => {
    const filter = new HttpExceptionFilter();
    const { host, status } = makeHostMock();
    filter.catch(new Error('unknown'), host);
    expect(status).toHaveBeenCalledWith(500);
  });

  it('should use custom code from exception body', () => {
    const filter = new HttpExceptionFilter();
    const { host, json } = makeHostMock();
    filter.catch(
      new BadRequestException({
        code: ErrorCode.INVALID_OTP,
        message: 'OTP salah',
      }),
      host,
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const call: Record<string, unknown> = json.mock.calls[0][0];
    expect((call.error as Record<string, unknown>).code).toBe(
      ErrorCode.INVALID_OTP,
    );
  });

  it('should strip details in production', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const filter = new HttpExceptionFilter();
    const { host, json } = makeHostMock();
    filter.catch(
      new BadRequestException({ code: 'X', message: 'bad', details: 'secret' }),
      host,
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const call: Record<string, unknown> = json.mock.calls[0][0];
    expect((call.error as Record<string, unknown>).details).toBeUndefined();
    process.env.NODE_ENV = original;
  });
});

// ── 6. ResponseTransformInterceptor ──────────────────────────────────────

describe('ResponseTransformInterceptor', () => {
  const ctx = {
    switchToHttp: () => ({
      getRequest: () => ({ headers: {} }),
    }),
  } as unknown as ExecutionContext;

  it('should wrap plain data in success envelope', (done) => {
    const interceptor = new ResponseTransformInterceptor();
    const handler = { handle: () => of({ id: 1 }) };
    interceptor.intercept(ctx, handler).subscribe((res) => {
      const r = res as { success: boolean; data: unknown };
      expect(r.success).toBe(true);
      expect(r.data).toEqual({ id: 1 });
      done();
    });
  });

  it('should extract pagination when data has pagination property', (done) => {
    const interceptor = new ResponseTransformInterceptor();
    const paginatedPayload = {
      data: [1, 2],
      pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
    };
    const handler = { handle: () => of(paginatedPayload) };
    interceptor.intercept(ctx, handler).subscribe((res) => {
      const r = res as { meta: { pagination: unknown } };
      expect(r.meta.pagination).toBeDefined();
      done();
    });
  });
});

// ── 7. ParseUUIDPipe ─────────────────────────────────────────────────────

describe('ParseUUIDPipe', () => {
  const pipe = new ParseUUIDPipe();

  it('should pass valid UUID v4', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(pipe.transform(uuid)).toBe(uuid);
  });

  it('should throw BadRequestException for invalid UUID', () => {
    expect(() => pipe.transform('not-a-uuid')).toThrow(BadRequestException);
  });

  it('should throw for UUID v1', () => {
    expect(() =>
      pipe.transform('6ba7b810-9dad-11d1-80b4-00c04fd430c8'),
    ).toThrow(BadRequestException);
  });
});

// ── 8. Crypto Util ───────────────────────────────────────────────────────

describe('CryptoUtil', () => {
  const SECRET = 'test-secret-must-be-long-enough-for-hmac-sha256-operation';

  describe('generateOTP', () => {
    it('should return 6-digit string by default', () => {
      const otp = generateOTP();
      expect(otp).toMatch(/^\d{6}$/);
    });

    it('should return N-digit string', () => {
      const otp = generateOTP(4);
      expect(otp).toMatch(/^\d{4}$/);
    });
  });

  describe('generateSignedToken + validateSignedToken', () => {
    it('should generate and validate a token', () => {
      const payload = { userId: 'abc123', groupId: 'gid' };
      const token = generateSignedToken(payload, SECRET, 300);
      const result = validateSignedToken(token, SECRET);
      expect(result).not.toBeNull();
      expect(result!.userId).toBe('abc123');
    });

    it('should reject tampered token', () => {
      const token = generateSignedToken({ id: '1' }, SECRET, 300);
      const tampered = token.slice(0, -3) + 'xxx';
      expect(validateSignedToken(tampered, SECRET)).toBeNull();
    });

    it('should reject expired token', () => {
      const token = generateSignedToken({ id: '1' }, SECRET, -1); // already expired
      expect(validateSignedToken(token, SECRET)).toBeNull();
    });

    it('should reject with wrong secret', () => {
      const token = generateSignedToken({ id: '1' }, SECRET, 300);
      expect(validateSignedToken(token, 'wrong-secret')).toBeNull();
    });

    it('should reject malformed token (no dot)', () => {
      expect(validateSignedToken('nodothere', SECRET)).toBeNull();
    });
  });
});

// ── 9. Pagination Util ───────────────────────────────────────────────────

describe('PaginationUtil', () => {
  describe('buildPaginationQuery', () => {
    it('should default to page=1, limit=20', () => {
      const result = buildPaginationQuery({});
      expect(result).toEqual({ skip: 0, take: 20 });
    });

    it('should compute skip correctly', () => {
      const result = buildPaginationQuery({ page: 3, limit: 10 });
      expect(result).toEqual({ skip: 20, take: 10 });
    });

    it('should cap limit at 100', () => {
      const result = buildPaginationQuery({ limit: 999 });
      expect(result.take).toBe(100);
    });

    it('should floor page to 1 when 0 passed', () => {
      const result = buildPaginationQuery({ page: 0 });
      expect(result.skip).toBe(0);
    });
  });

  describe('buildPaginationMeta', () => {
    it('should compute totalPages correctly', () => {
      const meta = buildPaginationMeta({ page: 1, limit: 10 }, 95);
      expect(meta).toEqual({ page: 1, limit: 10, total: 95, totalPages: 10 });
    });

    it('should handle exact division', () => {
      const meta = buildPaginationMeta({ page: 1, limit: 20 }, 40);
      expect(meta.totalPages).toBe(2);
    });

    it('should handle zero total', () => {
      const meta = buildPaginationMeta({ page: 1, limit: 20 }, 0);
      expect(meta.totalPages).toBe(0);
    });
  });
});
