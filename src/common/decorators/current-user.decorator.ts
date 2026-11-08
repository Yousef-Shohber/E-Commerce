import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { User } from '../../users/users.entity';
import type { AuthenticatedRequest } from '../types';

/** The logged-in user, loaded by `JwtAuthGuard` */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): User =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
