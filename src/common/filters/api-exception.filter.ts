import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { getOrCreateRequestId } from '../observability/request-id';
import { isRecord } from '../error-utils';

const STATUS_CODES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
};

export interface ApiErrorBody {
  status_code: number;
  code: string;
  message: string | string[];
  reference_id: string;
  path: string;
  timestamp: string;
}

export function errorCodeForStatus(status: number): string {
  return STATUS_CODES[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED');
}

const SENSITIVE_QUERY_KEYS = new Set(['token', 'line_id_token', 'lineIdToken', 'access_token', 'id_token']);

export function sanitizeRequestPath(originalUrl: string): string {
  try {
    const parsed = new URL(originalUrl, 'http://local');
    for (const key of SENSITIVE_QUERY_KEYS) {
      if (parsed.searchParams.has(key)) parsed.searchParams.set(key, '[REDACTED]');
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return originalUrl.split('?')[0];
  }
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    const safePath = sanitizeRequestPath(request.originalUrl);
    const responseRequestId = response.getHeader('X-Request-ID');
    const reference_id = typeof responseRequestId === 'string'
      ? responseRequestId
      : getOrCreateRequestId(request.headers['x-request-id']);
    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const detail = isHttp ? exception.getResponse() : null;

    let message: string | string[] = 'ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง';
    let code = errorCodeForStatus(status);
    if (typeof detail === 'string') {
      message = detail;
    } else if (isRecord(detail)) {
      const bodyMessage = detail.message;
      const bodyCode = detail.code;
      if (typeof bodyMessage === 'string' || (Array.isArray(bodyMessage) && bodyMessage.every((item) => typeof item === 'string'))) {
        message = bodyMessage;
      }
      if (typeof bodyCode === 'string') code = bodyCode;
    }

    if (status >= 500) {
      this.logger.error(
        `[${reference_id}] ${request.method} ${safePath}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.setHeader('X-Error-Reference', reference_id);
    response.status(status).json({
      status_code: status,
      code,
      message,
      reference_id,
      path: safePath,
      timestamp: new Date().toISOString(),
    } satisfies ApiErrorBody);
  }
}
