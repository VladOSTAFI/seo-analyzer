import { ConfigError } from '../common/errors';
import type { Env } from '../config/env.validation';
import { PasswordService } from './password.service';

/**
 * Minimal Env stub — PasswordService only reads AUTH_BCRYPT_OR_ARGON. Cast keeps
 * the test focused on the one field the service touches.
 */
const envWith = (algo: Env['AUTH_BCRYPT_OR_ARGON']): Env => ({ AUTH_BCRYPT_OR_ARGON: algo }) as Env;

describe('PasswordService (argon2id)', () => {
  const service = new PasswordService(envWith('argon2id'));

  it('verify(hash(p), p) === true', async () => {
    const password = 'correct horse battery staple';
    const hash = await service.hash(password);
    await expect(service.verify(hash, password)).resolves.toBe(true);
  });

  it('returns false for a wrong password', async () => {
    const hash = await service.hash('the-right-password');
    await expect(service.verify(hash, 'the-wrong-password')).resolves.toBe(false);
  });

  it('produces a different hash each time (per-hash salt)', async () => {
    const password = 'same-input-different-salt';
    const a = await service.hash(password);
    const b = await service.hash(password);
    expect(a).not.toBe(b);
    // Both still verify against the original password.
    await expect(service.verify(a, password)).resolves.toBe(true);
    await expect(service.verify(b, password)).resolves.toBe(true);
  });

  it('returns false (does not throw) for a malformed hash', async () => {
    await expect(service.verify('not-a-real-hash', 'whatever')).resolves.toBe(false);
  });

  it('rejects an unsupported algorithm selector at construction', () => {
    expect(() => new PasswordService(envWith('bcrypt'))).toThrow(ConfigError);
  });
});
