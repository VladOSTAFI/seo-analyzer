import { PRODUCT_NAME } from "@/lib/constants";

/**
 * Shared copy used across the shell (nav, footer) and any page.
 *
 * Per-page copy lives in sibling files (`home.ts`, `how-it-works.ts`,
 * `contact.ts`) owned by their respective phase. Keep this file limited to
 * strings that appear on every route so branding edits stay in one place.
 */
export const common = {
  productName: PRODUCT_NAME,

  /** One-line description of what the product does. */
  productBlurb:
    "Automated technical SEO audits, distilled into a developer-ready report.",

  /** Footer tagline under the product name. */
  footerTagline: "Technical SEO audits, automated into a report your developers can action.",

  /** Default metadata description for the site shell. */
  metaDescription:
    "Automated technical SEO audits that crawl your site, run ~31 checks, and hand your team a severity-ranked, developer-ready report.",
} as const;

export type Common = typeof common;
