import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Request } from 'express';
import { QueryFailedError } from 'typeorm';
import { PG_ERROR, pgErrorCode } from '../utils';

interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();

    const body = this.toBody(exception);

    if (body.statusCode >= 500) {
      const route = (request.route as { path?: string } | undefined)?.path;
      this.logger.error(
        `${request.method} ${route ?? request.path}`,
        exception instanceof Error
          ? exception.stack
          : 'A non-Error value was thrown',
      );
    }

    httpAdapter.reply(
      context.getResponse(),
      { ...body, path: request.path, timestamp: new Date().toISOString() },
      body.statusCode,
    );
  }

  private toBody(exception: unknown): ErrorBody {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();

      if (typeof response === 'string') {
        return { statusCode: status, message: response, error: nameOf(status) };
      }

      return {
        error: nameOf(status),
        ...response,
        statusCode: status,
      } as ErrorBody;
    }

    if (exception instanceof QueryFailedError) {
      switch (pgErrorCode(exception)) {
        case PG_ERROR.UNIQUE_VIOLATION:
          return build(HttpStatus.CONFLICT, 'This record already exists');
        case PG_ERROR.FOREIGN_KEY_VIOLATION:
          return build(
            HttpStatus.CONFLICT,
            'The record is linked to another record that does not exist, or is still in use',
          );
        case PG_ERROR.CHECK_VIOLATION:
        case PG_ERROR.INVALID_TEXT_REPRESENTATION:
        case PG_ERROR.NUMERIC_OUT_OF_RANGE:
          return build(HttpStatus.BAD_REQUEST, 'A value is not valid');
      }
    }

    // Errors of the HTTP layer itself (malformed JSON, body too large ...)
    const httpLike = exception as
      { statusCode?: unknown; status?: unknown; message?: unknown } | undefined;
    const status = httpLike?.statusCode ?? httpLike?.status;
    if (
      typeof status === 'number' &&
      status >= 400 &&
      status < 500 &&
      typeof httpLike?.message === 'string'
    ) {
      return build(status, httpLike.message);
    }

    return build(HttpStatus.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
}

function build(statusCode: number, message: string): ErrorBody {
  return { statusCode, message, error: nameOf(statusCode) };
}

/** 404 -> "Not Found" */
function nameOf(status: number): string {
  const name = HttpStatus[status];
  return name
    ? name
        .toLowerCase()
        .split('_')
        .map((word) => word[0].toUpperCase() + word.slice(1))
        .join(' ')
    : 'Error';
}
