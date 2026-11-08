import type { Request } from 'express';
import type { User } from '../../users/users.entity';

export type AuthenticatedRequest = Request & { user: User };
