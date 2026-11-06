import { UserService } from './../users.service';
import { Reflector } from '@nestjs/core';
import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { TokenExpiredError } from 'jsonwebtoken';
import { JwtPayloadType } from '../../utils/types';
import { CURRENT_USER_KEY } from '../../utils/constants';
import { UserType } from '../../utils/enums';
import { User } from '../users.entity';

@Injectable()
export class AuthRoleGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
    private readonly userService: UserService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roles: UserType[] = this.reflector.getAllAndOverride<UserType[]>(
      'roles',
      [context.getHandler(), context.getClass()],
    );

    if (!roles || roles.length === 0) {
      throw new BadRequestException('No Roles Provided');
    }

    const request: Request = context.switchToHttp().getRequest();
    const [type, token] = request.headers.authorization?.split(' ') ?? [];

    if (!token || type !== 'Bearer') {
      throw new UnauthorizedException('Access Denied, No Token Provided');
    }

    let payload: JwtPayloadType;

    try {
      payload = await this.jwtService.verifyAsync(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        throw new UnauthorizedException('Token has expired');
      }

      throw new UnauthorizedException('Access Denied, Invalid Token');
    }

    let user: User;
    try {
      user = await this.userService.getCurrentUser(payload.id);
    } catch {
      throw new UnauthorizedException('Access Denied, User no longer exists');
    }

    if (!roles.includes(user.userType)) {
      throw new ForbiddenException('Access Denied, Not Allowed');
    }

    request[CURRENT_USER_KEY] = { id: user.id, userType: user.userType };
    return true;
  }
}
