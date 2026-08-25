import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { getOrCreateRequestId } from '../observability/request-id';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const request_id = getOrCreateRequestId(request.headers['x-request-id']);
    response.locals.request_id = request_id;
    response.setHeader('X-Request-ID', request_id);
    next();
  }
}
