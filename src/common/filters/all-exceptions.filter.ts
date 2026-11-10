import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { ErrorCode } from '../errors';

interface NormalizedError {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}

// Postgres error codes -> HTTP answer. Services never look at these codes:
// they just save/insert, and a database error ends up here.
const PG_ERRORS: Record<
  string,
  { statusCode: number; code: ErrorCode; message: string }
> = {
  '23505': {
    statusCode: HttpStatus.CONFLICT,
    code: ErrorCode.UNIQUE_VIOLATION,
    message: 'A record with the same unique value already exists',
  },
  '23503': {
    statusCode: HttpStatus.CONFLICT,
    code: ErrorCode.REFERENCED_RECORD,
    message: 'Related record does not exist or is still referenced',
  },
  '23514': {
    statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    code: ErrorCode.CHECK_VIOLATION,
    message: 'The provided data violates a validation rule',
  },
  '23502': {
    statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    code: ErrorCode.NOT_NULL_VIOLATION,
    message: 'A required value is missing',
  },
  '22001': {
    statusCode: HttpStatus.BAD_REQUEST,
    code: ErrorCode.VALUE_TOO_LONG,
    message: 'A value is too long for its field',
  },
  '22003': {
    statusCode: HttpStatus.BAD_REQUEST,
    code: ErrorCode.NUMERIC_OUT_OF_RANGE,
    message: 'A numeric value is out of range',
  },
  '22P02': {
    statusCode: HttpStatus.BAD_REQUEST,
    code: ErrorCode.INVALID_IDENTIFIER,
    message: 'Invalid identifier format',
  },
  '22007': {
    statusCode: HttpStatus.BAD_REQUEST,
    code: ErrorCode.INVALID_DATE,
    message: 'Invalid date value',
  },
  '22008': {
    statusCode: HttpStatus.BAD_REQUEST,
    code: ErrorCode.INVALID_DATE,
    message: 'Invalid date value',
  },
};

const PG_CONSTRAINTS: Record<
  string,
  { statusCode?: number; code: ErrorCode; message: string }
> = {
  // users.email
  UQ_97672ac88f789774dd47f7c8be3: {
    code: ErrorCode.EMAIL_ALREADY_REGISTERED,
    message: 'Email is already registered',
  },
  // categories.name
  UQ_8b0be371d28245da6e4f4b61878: {
    code: ErrorCode.CATEGORY_NAME_TAKEN,
    message: 'Category name already exists',
  },
  // coupons.code
  UQ_e025109230e82925843f2a14c48: {
    code: ErrorCode.COUPON_CODE_TAKEN,
    message: 'Coupon code already exists',
  },
  // reviews (userId, productId)
  UQ_9007ffba411fd471dfe233dabfb: {
    code: ErrorCode.REVIEW_ALREADY_EXISTS,
    message: 'You already reviewed this product',
  },
  // cart_items.productId -> products.id
  FK_72679d98b31c737937b8932ebe6: {
    statusCode: HttpStatus.NOT_FOUND,
    code: ErrorCode.PRODUCT_NOT_FOUND,
    message: 'Product not found',
  },
  // wishlist_items.productId -> products.id
  FK_485ece8ab9b569d1c560144aa25: {
    statusCode: HttpStatus.NOT_FOUND,
    code: ErrorCode.PRODUCT_NOT_FOUND,
    message: 'Product not found',
  },
  // cart_items.quantity BETWEEN 1 AND 99
  CHK_cbbfec63b98ecbda400308d364: {
    statusCode: HttpStatus.BAD_REQUEST,
    code: ErrorCode.CART_QUANTITY_LIMIT,
    message: 'Maximum quantity per product is 99',
  },
};

const genericCode = (statusCode: number): string =>
  HttpStatus[statusCode] ?? 'ERROR';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  constructor(private readonly config: ConfigService) {}

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'string') {
        return { statusCode, code: genericCode(statusCode), message: body };
      }

      const { message, code, details } = body as {
        message?: string | string[];
        code?: string;
        details?: unknown;
      };

      if (Array.isArray(message)) {
        return {
          statusCode,
          code: code ?? ErrorCode.VALIDATION_FAILED,
          message: 'Validation failed',
          details: message,
        };
      }

      return {
        statusCode,
        code: code ?? genericCode(statusCode),
        message: message ?? exception.message,
        ...(details !== undefined && { details }),
      };
    }

    if (exception instanceof QueryFailedError) {
      const driverError = exception.driverError as
        { code?: string; constraint?: string } | undefined;
      const mapped = driverError?.code
        ? PG_ERRORS[driverError.code]
        : undefined;

      if (mapped) {
        const specific = driverError?.constraint
          ? PG_CONSTRAINTS[driverError.constraint]
          : undefined;

        return { ...mapped, ...specific };
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
      return {
        statusCode: status,
        code: genericCode(status),
        message: httpLike.message,
      };
    }

    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_SERVER_ERROR,
      message:
        !isProd && exception instanceof Error
          ? exception.message
          : 'Internal server error',
    };
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req: Request = http.getRequest();
    const res: Response = http.getResponse();

    const { statusCode, code, message, details } = this.normalize(exception);

    if (statusCode >= 500) {
      this.logger.error(
        `${req.method} ${req.originalUrl} -> ${statusCode}`,
        exception instanceof Error
          ? exception.stack
          : 'A non-Error value was thrown',
      );
    } else {
      this.logger.warn(
        `${req.method} ${req.originalUrl} -> ${statusCode} ${code} ${message}`,
      );
    }

    res.status(statusCode).json({
      success: false,
      statusCode,
      error: HttpStatus[statusCode] ?? 'ERROR',
      code,
      message,
      ...(details !== undefined && { details }),
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
    });
  }
}
