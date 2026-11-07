import { SetMetadata } from '@nestjs/common';
import { ROLES_KEY } from '../constants';
import { UserType } from '../enums';

export const Roles = (...roles: UserType[]) => SetMetadata(ROLES_KEY, roles);
