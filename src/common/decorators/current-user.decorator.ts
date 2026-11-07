import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { JwtPayloadType } from '../types';
import { CURRENT_USER_KEY } from '../constants';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): JwtPayloadType => {
    const request = context.switchToHttp().getRequest<Request>();
    return request[CURRENT_USER_KEY] as JwtPayloadType;
  },
);
