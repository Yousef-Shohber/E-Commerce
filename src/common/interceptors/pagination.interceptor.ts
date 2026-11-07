import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable, map } from 'rxjs';
import { PAGINATION_HEADERS } from '../constants';
import { Paginated } from '../pagination';

@Injectable()
export class PaginationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data: unknown): unknown => {
        if (!(data instanceof Paginated)) return data;

        const response = context.switchToHttp().getResponse<Response>();
        response.setHeader(PAGINATION_HEADERS.total, String(data.total));
        response.setHeader(PAGINATION_HEADERS.page, String(data.page));
        response.setHeader(PAGINATION_HEADERS.limit, String(data.limit));
        response.setHeader(PAGINATION_HEADERS.totalPages,String(data.totalPages));

        return data.items;
      }),
    );
  }
}
