import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { TokenExpiredError } from 'jsonwebtoken';
import { DataSource } from 'typeorm';
import { User } from '../../users/users.entity';
import { CURRENT_USER_KEY, IS_PUBLIC_KEY } from '../constants';
import { JwtPayloadType } from '../types';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) return true;

    const request: Request = context.switchToHttp().getRequest();
    const [type, token] = request.headers.authorization?.split(' ') ?? [];

    if (!token || type !== 'Bearer') {
      throw new UnauthorizedException('Access Denied, No Token Provided');
    }

    let payload: JwtPayloadType;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayloadType>(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        throw new UnauthorizedException('Token has expired');
      }
      throw new UnauthorizedException('Access Denied, Invalid Token');
    }

    const user = await this.dataSource.getRepository(User).findOne({
      where: { id: payload.id },
      select: { id: true, userType: true },
    });

    if (!user) {
      throw new UnauthorizedException('Access Denied, User no longer exists');
    }

    request[CURRENT_USER_KEY] = {
      id: user.id,
      userType: user.userType,
    } satisfies JwtPayloadType;

    return true;
  }
}
