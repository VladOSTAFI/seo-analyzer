import { getCurrentUser } from "@/lib/auth/current-user";
import { SIGN_IN_HREF } from "@/lib/constants";
import { CTAButton } from "@/components/primitives/cta-button";
import { NavShell } from "@/components/layout/nav-shell";
import { UserMenu } from "@/components/layout/user-menu";

/**
 * Top navigation (server component): resolves the session, then renders the
 * client {@link NavShell} with the appropriate auth controls injected as props.
 *
 * The mobile-menu open/close state lives entirely in `NavShell` (a client
 * component); this server wrapper only decides WHAT goes in the right-hand slot
 * — a "Dashboard" + user menu when a session exists, the "Sign in" CTA
 * otherwise. Tokens are never read here beyond the decode in `getCurrentUser`,
 * and nothing token-related crosses into client code.
 */
export async function Nav() {
  const user = await getCurrentUser();

  const authSlot = (fullWidth: boolean) =>
    user ? (
      <UserMenu email={user.email} fullWidth={fullWidth} />
    ) : (
      <CTAButton
        href={SIGN_IN_HREF}
        variant="primary"
        className={fullWidth ? "w-full" : undefined}
      >
        Sign in
      </CTAButton>
    );

  return (
    <NavShell desktopAuth={authSlot(false)} mobileAuth={authSlot(true)} />
  );
}
