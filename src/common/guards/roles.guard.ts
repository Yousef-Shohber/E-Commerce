import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CURRENT_USER_KEY, ROLES_KEY } from '../constants';
import { UserType } from '../enums';
import { JwtPayloadType } from '../types';
import type { Request } from 'express';

/**
 * Global guard, runs after `JwtAuthGuard`: when a route has @Roles() (or
 * @Auth(...roles)) the logged-in user must have one of these roles.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserType[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles?.length) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const user = request[CURRENT_USER_KEY] as JwtPayloadType | undefined;

    if (!user || !roles.includes(user.userType)) {
      throw new ForbiddenException('Access Denied, Not Allowed');
    }

    return true;
  }
}
