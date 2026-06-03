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

  /**
   * Cached dummy argon2id hash for {@link verifyTimingSafeDummy}. Computed lazily
   * on first use (the constructor can't await) and reused thereafter.
   */
  private dummyHash?: Promise<string>;

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

  /**
   * Timing-equalizing decoy verify (Phase A6, §8 — no account enumeration via
   * timing). When login can't find the email, it has no stored hash to check
   * against; skipping the argon2 work would make an unknown email return faster
   * than a wrong password and leak which addresses are registered. So the
   * unknown-email branch calls this instead: it verifies the supplied password
   * against a single cached throwaway hash — burning argon2 CPU equivalent to a
   * real verify — and ALWAYS returns `false`.
   *
   * The dummy hash is computed exactly once (lazily, since the constructor can't
   * await) and reused, so only the first call pays the one-off hash cost.
   */
  async verifyTimingSafeDummy(password: string): Promise<false> {
    if (!this.dummyHash) {
      // A fixed throwaway secret; never a real credential, never matches input.
      this.dummyHash = this.hash('timing-safe-dummy-password');
    }
    await this.verify(await this.dummyHash, password);
    return false;
  }
}
