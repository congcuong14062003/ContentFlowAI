import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import type { Request, Response } from 'express';
import { map } from 'rxjs';
import { PinoLogger } from 'nestjs-pino';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<Request>();
    return next.handle().pipe(map((data: unknown) => ({ data: data === undefined ? null : JSON.parse(JSON.stringify(data, (_key, value: unknown) => typeof value === 'bigint' ? value.toString() : value)), requestId: String(request.id) })));
  }
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {}
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const body = exception instanceof HttpException ? exception.getResponse() : undefined;
    const details = typeof body === 'object' && body && 'message' in body ? body.message : undefined;
    const allowed = ['BRAND_LIMIT', 'INSUFFICIENT_CREDITS', 'AI_DISABLED', 'AI_SPEND_CAP', 'AI_RATE_LIMIT', 'AI_CONCURRENCY_LIMIT', 'AI_NOT_CONFIGURED', 'AI_INPUT_LIMIT', 'AI_PENDING_RECONCILIATION'];
    const businessCode = status < 500 && typeof body === 'object' && body && 'code' in body && typeof body.code === 'string' && allowed.includes(body.code) ? body.code : undefined;
    if (status >= 500) this.logger.error({ requestId: request.id, errorType: exception instanceof Error ? exception.name : 'UnknownError' }, 'Request failed');
    response.status(status).json({
      error: {
        code: businessCode ?? (status === 400 ? 'VALIDATION_ERROR' : status === 503 ? 'SERVICE_UNAVAILABLE' : status >= 500 ? 'INTERNAL_ERROR' : `HTTP_${status}`),
        message: status >= 500 ? 'Service temporarily unavailable' : typeof body === 'string' ? body : exception instanceof Error ? exception.message : 'Request failed',
        ...(status === 400 && details ? { details } : {})
      },
      requestId: String(request.id)
    });
  }
}
