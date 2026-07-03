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

function jsonLog(level: string, context: string, message: string, extra: Record<string, unknown> = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    context,
    message,
    ...extra,
  };
  if (process.env.NODE_ENV === 'production') {
    process.stdout.write(JSON.stringify(entry) + '\n');
  }
  return entry;
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const method = req.method;
    const url = req.url;
    const body: unknown = req.body;
    const requestId = (req as any).requestId;
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
          const msg = `${method} ${url} ${res.statusCode} — ${ms}ms`;
          if (process.env.NODE_ENV === 'production') {
            jsonLog('info', 'HTTP', msg, { method, url, statusCode: res.statusCode, durationMs: ms, requestId });
          } else {
            this.logger.log(msg);
          }
        },
        error: (err: unknown) => {
          const ms = Date.now() - start;
          const msg = `${method} ${url} ERROR — ${ms}ms — ${String(err)}`;
          if (process.env.NODE_ENV === 'production') {
            jsonLog('warn', 'HTTP', msg, { method, url, durationMs: ms, error: String(err), requestId });
          } else {
            this.logger.warn(msg);
          }
        },
      }),
    );
  }
}
