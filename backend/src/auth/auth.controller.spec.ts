import type { AuthUser } from './auth.types';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';

/**
 * Light unit tests for {@link AuthController} (Phase A2 additions). register/login
 * are already covered by the service specs and exercise no controller logic
 * beyond delegation; here we pin the two new authenticated routes: `me` echoes the
 * guard-supplied principal, `logout` is a no-op ack (A5 owns revocation).
 */
const PRINCIPAL: AuthUser = {
  id: '11111111-2222-3333-4444-555555555555',
  email: 'user@example.com',
  role: 'user',
  tokenVersion: 0,
};

describe('AuthController', () => {
  const controller = new AuthController({} as AuthService);

  it('GET /auth/me returns the injected principal unchanged', () => {
    expect(controller.me(PRINCIPAL)).toBe(PRINCIPAL);
  });

  it('POST /auth/logout acknowledges without throwing (A2 no-op)', () => {
    expect(controller.logout()).toBeUndefined();
  });
});
