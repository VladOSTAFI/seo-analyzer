import type { AuthUser } from './auth.types';
import { AuthController } from './auth.controller';
import type { AuthService, IssuedTokens } from './auth.service';

/**
 * Light unit tests for {@link AuthController} (Phase A2 + A5 + A6 additions).
 * register/login are covered by the service specs and exercise no controller
 * logic beyond delegation; here we pin: `login` threads the `@Ip()` value into
 * the service (A6 attempt ledger), `me` echoes the guard-supplied principal,
 * `refresh` delegates to the rotating service method, and `logout` revokes the
 * caller's sessions and returns void (204).
 */
const PRINCIPAL: AuthUser = {
  id: '11111111-2222-3333-4444-555555555555',
  email: 'user@example.com',
  role: 'user',
  tokenVersion: 0,
};

describe('AuthController', () => {
  it('POST /auth/login forwards the body credentials AND the @Ip() value to AuthService.login', async () => {
    const pair: IssuedTokens = { accessToken: 'a', refreshToken: 'r' };
    const login = jest.fn().mockResolvedValue(pair);
    const controller = new AuthController({ login } as unknown as AuthService);

    const result = await controller.login(
      { email: 'user@example.com', password: 'pw1234567890' },
      '203.0.113.7',
    );

    expect(login).toHaveBeenCalledWith('user@example.com', 'pw1234567890', '203.0.113.7');
    expect(result).toBe(pair);
  });

  it('GET /auth/me returns the injected principal unchanged', () => {
    const controller = new AuthController({} as AuthService);
    expect(controller.me(PRINCIPAL)).toBe(PRINCIPAL);
  });

  it('POST /auth/refresh delegates the raw token to AuthService.refresh and returns the new pair', async () => {
    const pair: IssuedTokens = { accessToken: 'new.access', refreshToken: 'new-refresh' };
    const refresh = jest.fn().mockResolvedValue(pair);
    const controller = new AuthController({ refresh } as unknown as AuthService);

    const result = await controller.refresh({ refreshToken: 'presented-raw-token' });

    expect(refresh).toHaveBeenCalledWith('presented-raw-token');
    expect(result).toBe(pair);
  });

  it('POST /auth/logout delegates the caller id to AuthService.logout and resolves void (204)', async () => {
    const logout = jest.fn().mockResolvedValue(undefined);
    const controller = new AuthController({ logout } as unknown as AuthService);

    const result = await controller.logout(PRINCIPAL);

    expect(logout).toHaveBeenCalledWith(PRINCIPAL.id);
    expect(result).toBeUndefined();
  });
});
