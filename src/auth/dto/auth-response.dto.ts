import { ApiProperty } from '@nestjs/swagger';

export class AccessTokenDto {
  @ApiProperty({
    description: 'JWT to send as "Authorization: Bearer <token>"',
  })
  accessToken: string;
}
