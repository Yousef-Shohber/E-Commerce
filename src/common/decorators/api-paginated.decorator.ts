import { applyDecorators } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { PAGINATION_HEADERS } from '../constants';

/**
 * Documents the pagination headers that `PaginationInterceptor` adds to the
 * response of a list endpoint (the body stays a plain array).
 */
export const ApiPaginated = (description = 'A page of results') =>
  applyDecorators(
    ApiOkResponse({
      description,
      headers: {
        [PAGINATION_HEADERS.total]: {
          description: 'Number of items that match the filters',
          schema: { type: 'integer' },
        },
        [PAGINATION_HEADERS.page]: {
          description: 'Current page',
          schema: { type: 'integer' },
        },
        [PAGINATION_HEADERS.limit]: {
          description: 'Page size',
          schema: { type: 'integer' },
        },
        [PAGINATION_HEADERS.totalPages]: {
          description: 'Number of pages',
          schema: { type: 'integer' },
        },
      },
    }),
  );
