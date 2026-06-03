import { RefreshBody } from './auth.dto';

/**
 * Contract tests for the {@link RefreshBody} Zod schema (Phase A5). The schema is
 * `.strict()` and only guarantees the opaque token's presence — validity is the
 * service's job. These pin: a non-empty token passes, empty/missing is rejected,
 * and any extra field is rejected (so a caller cannot smuggle, e.g., a userId).
 */
describe('RefreshBody', () => {
  it('accepts a non-empty refreshToken', () => {
    const parsed = RefreshBody.parse({ refreshToken: 'opaque-token' });
    expect(parsed).toEqual({ refreshToken: 'opaque-token' });
  });

  it('rejects an empty refreshToken', () => {
    expect(RefreshBody.safeParse({ refreshToken: '' }).success).toBe(false);
  });

  it('rejects a missing refreshToken', () => {
    expect(RefreshBody.safeParse({}).success).toBe(false);
  });

  it('rejects an extra field (strict)', () => {
    expect(RefreshBody.safeParse({ refreshToken: 'opaque-token', userId: 'x' }).success).toBe(false);
  });
});
