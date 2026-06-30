// src/common/interceptors/response-transform.interceptor.ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Request } from 'express';
import { map, Observable } from 'rxjs';
import type { PaginationMeta } from '../utils/pagination.util.js';

interface PaginatedData {
  data: unknown[];
  pagination: PaginationMeta;
}

function isPaginated(val: unknown): val is PaginatedData {
  return (
    typeof val === 'object' &&
    val !== null &&
    'data' in val &&
    'pagination' in val &&
    Array.isArray((val as PaginatedData).data)
  );
}

@Injectable()
export class ResponseTransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const requestId: string =
      (req.headers['x-request-id'] as string | undefined) ?? randomUUID();

    return next.handle().pipe(
      map((raw: unknown) => {
        // Skip file download responses (StreamableFile etc.)
        if (raw instanceof Object && 'pipe' in raw) return raw;

        if (isPaginated(raw)) {
          return {
            success: true,
            data: raw.data,
            meta: {
              timestamp: new Date().toISOString(),
              requestId,
              pagination: raw.pagination,
            },
          };
        }

        return {
          success: true,
          data: raw,
          meta: {
            timestamp: new Date().toISOString(),
            requestId,
          },
        };
      }),
    );
  }
}
