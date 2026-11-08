import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 10;

/**
 * The password is hashed as it is (the DTOs limit it to 72 characters, the
 * most bcrypt reads), so the hashes already stored in the database keep
 * working.
 */
@Injectable()
export class PasswordService {
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await bcrypt.compare(password, passwordHash);
    } catch {
      return false;
    }
  }

  /** Same work as `verify`, for emails that do not exist (hides the timing) */
  async verifyDummy(password: string): Promise<void> {
    this.dummyHash ??= this.hash(randomBytes(16).toString('hex'));
    await this.verify(await this.dummyHash, password);
  }
}
