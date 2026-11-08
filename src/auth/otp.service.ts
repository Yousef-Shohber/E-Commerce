import { createHmac, randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../common/redis';
import {
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_SECONDS,
} from './constants/otp.constants';
import { OtpPurpose } from './enums/otp-purpose.enum';

// Runs atomically inside Redis: a correct code is consumed (single use), a
// wrong one counts as an attempt, and the code is destroyed after too many.
const VERIFY_SCRIPT = `
local data = redis.call('HMGET', KEYS[1], 'hash', 'attempts')
if not data[1] then return 'MISSING' end
if data[1] == ARGV[1] then
  redis.call('DEL', KEYS[1])
  return 'OK'
end
local attempts = redis.call('HINCRBY', KEYS[1], 'attempts', 1)
if attempts >= tonumber(ARGV[2]) then
  redis.call('DEL', KEYS[1])
  return 'LOCKED'
end
return 'INVALID'
`;

@Injectable()
export class OtpService {
  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Generates and stores a new OTP for the specified purpose and email.
   * Only a keyed hash of the code is stored, never the code itself.
   * @param purpose What the code is for (email verification, password reset)
   * @param email The email address the code belongs to
   * @returns The code, or `null` if the resend cooldown is still running
   */
  async issue(purpose: OtpPurpose, email: string): Promise<string | null> {
    const client = this.redis.client;

    const cooldown = await client.set(
      this.cooldownKey(purpose, email),
      '1',
      'EX',
      OTP_RESEND_COOLDOWN_SECONDS,
      'NX',
    );

    if (cooldown !== 'OK') return null;

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const key = this.key(purpose, email);

    await client
      .multi()
      .del(key)
      .hset(key, { hash: this.hash(purpose, email, code), attempts: 0 })
      .expire(key, OTP_TTL_SECONDS)
      .exec();

    return code;
  }

  /**
   * Verifies an OTP (and consumes it when it is correct).
   * @returns `true` only when the code is correct, unexpired and unused
   */
  async verify(
    purpose: OtpPurpose,
    email: string,
    code: string,
  ): Promise<boolean> {
    const result = await this.redis.client.eval(
      VERIFY_SCRIPT,
      1,
      this.key(purpose, email),
      this.hash(purpose, email, code),
      OTP_MAX_ATTEMPTS,
    );

    return result === 'OK';
  }

  private hash(purpose: OtpPurpose, email: string, code: string): string {
    return createHmac('sha256', this.config.getOrThrow<string>('OTP_SECRET'))
      .update(`${purpose}:${email}:${code}`)
      .digest('hex');
  }

  private key(purpose: OtpPurpose, email: string): string {
    return `otp:${purpose}:${email}`;
  }

  private cooldownKey(purpose: OtpPurpose, email: string): string {
    return `otp:cooldown:${purpose}:${email}`;
  }
}
