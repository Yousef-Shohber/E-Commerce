import { applyDecorators } from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiSecurity,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserType } from '../enums';
import { Roles } from './roles.decorator';

/**
 *   @Auth()                  any logged-in user
 *   @Auth(UserType.ADMIN)    admins only
 */
export const Auth = (...roles: UserType[]) =>
  applyDecorators(
    ...(roles.length > 0
      ? [Roles(...roles), ApiForbiddenResponse({ description: 'Not allowed' })]
      : []),
    ApiSecurity('bearer'),
    ApiUnauthorizedResponse({ description: 'Missing or invalid token' }),
  );
