import { Inject, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { ConfigError } from '../common/errors';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env.validation';

/**
 * Password hashing utility (Phase A0). The only crypto entry point for
 * credentials — register/login go through here so the algorithm choice lives in
 * exactly one place (§3.1 / §8).
 *
 * argon2id is the default and the only algorithm implemented in A0. The
 * `AUTH_BCRYPT_OR_ARGON` selector keeps the choice swappable behind this
 * injectable: a future bcrypt branch only changes this file, never callers. We
 * deliberately do not pull in `bcrypt` until it is actually selected, matching
 * the project's "no unnecessary dependencies" posture — choosing `bcrypt`
 * without that work fails fast with an actionable ConfigError.
 *
 * argon2's encoded hash embeds a per-hash random salt and the parameters, so
 * `verify` needs only (hash, password) and two hashes of the same password
 * always differ. The raw password is never stored or logged.
 */
@Injectable()
export class PasswordService {
  private readonly algorithm: Env['AUTH_BCRYPT_OR_ARGON'];

  constructor(@Inject(ENV) env: Env) {
    this.algorithm = env.AUTH_BCRYPT_OR_ARGON;
    if (this.algorithm !== 'argon2id') {
      throw new ConfigError(
        `AUTH_BCRYPT_OR_ARGON='${this.algorithm}' is not supported yet; ` +
          `only 'argon2id' is implemented in this phase. ` +
          `Remove the var or set it to 'argon2id'.`,
      );
    }
  }

  /** Hash a plaintext password. Returns an argon2id encoded string (salt + params embedded). */
  async hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  /**
   * Verify a plaintext password against a stored encoded hash. Returns `false`
   * on mismatch and on a malformed/unknown hash (never throws for a bad
   * password), so callers can treat the result as a boolean credential check.
   */
  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }
}
