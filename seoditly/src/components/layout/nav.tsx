import { getCurrentUser } from "@/lib/auth/current-user";
import { SIGN_IN_HREF } from "@/lib/constants";
import { getRequestLocale } from "@/lib/i18n/server";
import { localeHref } from "@/lib/i18n/config";
import { getCommon } from "@/lib/copy/common";
import { CTAButton } from "@/components/primitives/cta-button";
import { NavShell } from "@/components/layout/nav-shell";
import { UserMenu } from "@/components/layout/user-menu";

/**
 * Top navigation (server component): resolves the session + active locale, then
 * renders the client {@link NavShell} with locale-aware links and the
 * appropriate auth controls injected as props.
 *
 * Locale: every href is prefixed for the active locale via `localeHref` (so
 * `/how-it-works` → `/uk/how-it-works` under uk). The labels come from the
 * localized `common` copy. Tokens are never read here beyond `getCurrentUser`.
 */
export async function Nav() {
  const locale = await getRequestLocale();
  const common = getCommon(locale);
  const [user] = await Promise.all([getCurrentUser()]);

  const navItems = [
    { label: common.navItems.howItWorks, href: localeHref("/how-it-works", locale) },
    { label: common.navItems.contact, href: localeHref("/contact", locale) },
  ];

  const authSlot = (fullWidth: boolean) =>
    user ? (
      <UserMenu
        email={user.email}
        fullWidth={fullWidth}
        locale={locale}
        labels={{
          dashboard: common.nav.dashboard,
          audits: common.nav.audits,
          accountMenu: common.nav.accountMenu,
          signedInAs: common.nav.signedInAs,
          signOut: common.nav.signOut,
        }}
      />
    ) : (
      <CTAButton
        href={localeHref(SIGN_IN_HREF, locale)}
        variant="primary"
        className={fullWidth ? "w-full" : undefined}
      >
        {common.nav.signIn}
      </CTAButton>
    );

  return (
    <NavShell
      homeHref={localeHref("/", locale)}
      homeLabel={common.nav.home}
      navItems={navItems}
      openMenuLabel={common.nav.openMenu}
      closeMenuLabel={common.nav.closeMenu}
      languageSwitcherLabel={common.language.switcherLabel}
      languageHeading={common.language.heading}
      desktopAuth={authSlot(false)}
      mobileAuth={authSlot(true)}
    />
  );
}
