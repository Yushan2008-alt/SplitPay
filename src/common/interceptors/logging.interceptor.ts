// src/common/interceptors/logging.interceptor.ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { tap, Observable } from 'rxjs';

// Fields to mask in log output — NEVER log these verbatim
const SENSITIVE_FIELDS = [
  'password',
  'token',
  'otp',
  'secret',
  'refreshToken',
  'accessToken',
];

function maskSensitive(obj: unknown): unknown {
  if (typeof obj !== 'object' || obj === null) return obj;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    result[key] = SENSITIVE_FIELDS.some((f) => key.toLowerCase().includes(f))
      ? '[REDACTED]'
      : maskSensitive(value);
  }
  return result;
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const method = req.method;
    const url = req.url;
    const body: unknown = req.body;
    const start = Date.now();

    if (
      process.env.NODE_ENV !== 'production' &&
      body &&
      typeof body === 'object' &&
      Object.keys(body).length
    ) {
      this.logger.debug(
        `→ ${method} ${url} ${JSON.stringify(maskSensitive(body))}`,
      );
    }

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse<Response>();
          const ms = Date.now() - start;
          this.logger.log(`${method} ${url} ${res.statusCode} — ${ms}ms`);
        },
        error: (err: unknown) => {
          const ms = Date.now() - start;
          this.logger.warn(`${method} ${url} ERROR — ${ms}ms — ${String(err)}`);
        },
      }),
    );
  }
}
