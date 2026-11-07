import { UserType } from '../enums';

export type JwtPayloadType = {
  id: number;
  userType: UserType;
};

export type AccessTokenType = {
  accessToken: string;
};
