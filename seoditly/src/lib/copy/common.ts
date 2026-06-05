import { PRODUCT_NAME } from "@/lib/constants";
import type { Locale } from "@/lib/i18n/config";
import { mergeCopy, type DeepPartial } from "@/lib/i18n/merge";

/**
 * Shared copy used across the shell (nav, footer) and any page.
 *
 * Per-page copy lives in sibling files (`home.ts`, `how-it-works.ts`,
 * `contact.ts`). Keep this file limited to strings that appear on every route.
 *
 * i18n: `commonEn` is the typed English source of truth (and the fallback);
 * `commonUk` is a `DeepPartial` override. `getCommon(locale)` deep-merges UK
 * over EN so any untranslated key falls back to English. The bare `common`
 * export stays English for back-compat with non-localized call sites.
 */
export const commonEn = {
  productName: PRODUCT_NAME,

  /** One-line description of what the product does. */
  productBlurb:
    "Automated technical SEO audits, distilled into a developer-ready report.",

  /** Footer tagline under the product name. */
  footerTagline:
    "Technical SEO audits, automated into a report your developers can action.",

  /** Default metadata description for the site shell. */
  metaDescription:
    "Automated technical SEO audits that crawl your site, run ~31 checks, and hand your team a severity-ranked, developer-ready report.",

  /** Shell-wide controls (nav CTAs, language switcher). */
  nav: {
    signIn: "Sign in",
    dashboard: "Dashboard",
    audits: "Audits",
    accountMenu: "Account menu",
    signedInAs: "Signed in as",
    signOut: "Sign out",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    home: "seoditly home",
  },

  language: {
    /** aria-label for the language switcher control. */
    switcherLabel: "Change language",
    /** Group heading inside the switcher menu. */
    heading: "Language",
  },

  footer: {
    rightsReserved: "All rights reserved.",
    footerNavLabel: "Footer",
  },

  /** Items shown in the nav + footer (labels here; hrefs are locale-agnostic). */
  navItems: {
    howItWorks: "How it works",
    contact: "Contact",
  },
} as const;

export type Common = typeof commonEn;

const commonUk: DeepPartial<Common> = {
  productBlurb:
    "Автоматизований технічний SEO-аудит, зведений у звіт, готовий для розробників.",
  footerTagline:
    "Технічний SEO-аудит, автоматично зведений у звіт, з яким працюватимуть ваші розробники.",
  metaDescription:
    "Автоматизований технічний SEO-аудит: ми скануємо ваш сайт, виконуємо ~31 перевірку й передаємо команді звіт із пріоритетами за критичністю, готовий для розробників.",
  nav: {
    signIn: "Увійти",
    dashboard: "Кабінет",
    audits: "Аудити",
    accountMenu: "Меню облікового запису",
    signedInAs: "Ви увійшли як",
    signOut: "Вийти",
    openMenu: "Відкрити меню",
    closeMenu: "Закрити меню",
    home: "На головну seoditly",
  },
  language: {
    switcherLabel: "Змінити мову",
    heading: "Мова",
  },
  footer: {
    rightsReserved: "Усі права захищено.",
    footerNavLabel: "Підвал сайту",
  },
  navItems: {
    howItWorks: "Як це працює",
    contact: "Контакти",
  },
};

const BY_LOCALE: Record<Locale, Common> = {
  en: commonEn,
  uk: mergeCopy(commonEn, commonUk),
};

export function getCommon(locale: Locale): Common {
  return BY_LOCALE[locale];
}

/** English copy — kept for back-compat / non-localized imports. */
export const common = commonEn;
