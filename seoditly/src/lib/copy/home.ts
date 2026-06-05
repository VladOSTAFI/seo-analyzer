import { PRODUCT_NAME } from "@/lib/constants";

/**
 * All user-facing copy for the home page lives here so wording can be
 * iterated without touching JSX. Mirrors the shape of {@link common}:
 * a typed `const ... as const` object, imported by `components/home/*`.
 *
 * Expected media assets (drop into `public/media/` to swap the
 * `MediaFrame` placeholders with zero code change):
 *   - `public/media/dashboard.png` — 1280×720 product dashboard screenshot.
 *   - `public/media/report.png`    — screenshot of the Excel report tables.
 */
export const home = {
  /** Page-level metadata (composed with the layout's title template). */
  meta: {
    title: "Automated technical SEO audits",
    description:
      `${PRODUCT_NAME} crawls your site, runs ~31 technical checks, and hands ` +
      "your developers a severity-ranked Excel report they can action.",
  },

  hero: {
    badge: "Early access · launching soon",
    headline:
      "Technical SEO audits, automated into a developer-ready report.",
    subhead:
      "Point us at your site. We crawl every page, run ~31 technical checks, and return a single severity-ranked spec your developers can ship against.",
    primaryCta: { label: "Get a free audit", href: "/contact" },
    secondaryCta: { label: "How it works", href: "/how-it-works" },
  },

  stats: {
    eyebrow: "Proof",
    items: [
      {
        value: "48 → 805",
        label: "Pages in, findings out",
        sub: "From a single covecta.io crawl.",
      },
      {
        value: "~31",
        label: "Automated checks",
        sub: "Metadata, canonicals, links, images, performance, i18n.",
      },
      {
        value: "1",
        label: "Excel report",
        sub: "Severity-ranked and developer-ready.",
      },
    ],
  },

  platform: {
    eyebrow: "The platform",
    heading: "Every issue, mapped and ranked in one place.",
    /** Accessible description for the dashboard MediaFrame placeholder. */
    mediaAlt: "Product dashboard — crawl coverage, findings by severity, and report status",
  },

  report: {
    eyebrow: "The deliverable",
    heading: "The report is the product.",
    body: "You do not get a wall of raw data. You get a styled Excel spec — the same ТЗ format your developers already work from — with every issue categorized, ranked, and ready to action.",
    bullets: [
      "Categorized fix tables, grouped by issue type.",
      "Severity ranking so the highest-impact work surfaces first.",
      "Developer-ready: each row maps to a concrete, shippable change.",
    ],
    /** Accessible description for the report MediaFrame placeholder. */
    mediaAlt: "Excel report screenshot — categorized fix tables ranked by severity",
  },

  pipeline: {
    eyebrow: "How it works",
    heading: "Five stages, fully automated.",
    cta: { label: "See the full process", href: "/how-it-works" },
    steps: [
      {
        key: "crawl",
        title: "Crawl",
        description: "We fetch every page, link, image, and meta tag on your site.",
      },
      {
        key: "enrich",
        title: "Enrich",
        description: "We map the link graph, redirects, and canonical relationships.",
      },
      {
        key: "analyze",
        title: "Analyze",
        description: "~31 checks flag issues and rank them by severity.",
      },
      {
        key: "performance",
        title: "Performance",
        description: "Core Web Vitals pulled via Google PageSpeed.",
      },
      {
        key: "report",
        title: "Report",
        description: "A styled Excel spec your developers can action.",
      },
    ],
  },

  ctaBand: {
    headline: "Get a free audit of your site.",
    body: "See exactly what is holding your technical SEO back — and hand your team a report they can act on.",
    cta: { label: "Get a free audit", href: "/contact" },
  },
} as const;

export type Home = typeof home;
