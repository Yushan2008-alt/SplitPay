// src/common/filters/http-exception.filter.ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { ErrorCode } from '../constants/error-codes.js';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const isProd = process.env.NODE_ENV === 'production';

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = ErrorCode.INTERNAL_SERVER_ERROR;
    let message = 'Terjadi kesalahan pada server';
    let details: unknown = undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exBody = exception.getResponse();

      if (typeof exBody === 'string') {
        message = exBody;
        code = this.mapStatusToCode(statusCode);
      } else if (typeof exBody === 'object' && exBody !== null) {
        const body = exBody as Record<string, unknown>;
        message = Array.isArray(body.message)
          ? (body.message as string[]).join('; ')
          : ((body.message as string) ?? exception.message);
        code = (body.code as string) ?? this.mapStatusToCode(statusCode);
        if (!isProd && body.details !== undefined) {
          details = body.details;
        }
      }
    } else {
      // Unhandled — log internally, never expose detail to client
      this.logger.error(
        `Unhandled exception on ${req.method} ${req.url}: ${String(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const requestId: string =
      (req.headers['x-request-id'] as string | undefined) ?? randomUUID();

    res.status(statusCode).json({
      success: false,
      error: {
        code,
        message,
        statusCode,
        ...(details !== undefined && !isProd ? { details } : {}),
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId,
      },
    });
  }

  private mapStatusToCode(status: number): string {
    const map: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: ErrorCode.VALIDATION_ERROR,
      [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
      [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
      [HttpStatus.NOT_FOUND]: ErrorCode.PERIOD_NOT_FOUND,
      [HttpStatus.CONFLICT]: ErrorCode.MEMBER_ALREADY_EXISTS,
      [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMIT_EXCEEDED,
      [HttpStatus.INTERNAL_SERVER_ERROR]: ErrorCode.INTERNAL_SERVER_ERROR,
    };
    return map[status] ?? ErrorCode.INTERNAL_SERVER_ERROR;
  }
}
