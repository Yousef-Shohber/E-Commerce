import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http' || process.env.NODE_ENV === 'test') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const startedAt = Date.now();

    const log = (status: number) => {
      const route = (request.route as { path?: string } | undefined)?.path;
      const line = `${request.method} ${route ?? request.path} ${status} +${Date.now() - startedAt}ms`;

      if (status >= 500) this.logger.error(line);
      else if (status >= 400) this.logger.warn(line);
      else this.logger.log(line);
    };

    return next.handle().pipe(
      tap({
        next: () => log(response.statusCode),
        error: (error: unknown) =>
          log(error instanceof HttpException ? error.getStatus() : 500),
      }),
    );
  }
}
