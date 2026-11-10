import { applyDecorators } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';

export const ApiPaginated = (description = 'A page of results') =>
  applyDecorators(
    ApiOkResponse({
      description,
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: { type: 'array', items: { type: 'object' } },
          meta: {
            type: 'object',
            properties: {
              page: { type: 'integer', example: 1 },
              limit: { type: 'integer', example: 10 },
              total: { type: 'integer', description: 'Items that match' },
              totalPages: { type: 'integer' },
            },
          },
        },
      },
    }),
  );
