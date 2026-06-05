import { PRODUCT_NAME } from "@/lib/constants";

/**
 * All user-facing copy for the `/how-it-works` page. Same pattern as
 * {@link home}: a typed `const ... as const` object imported by
 * `components/how-it-works/*`, so wording iterates without touching JSX.
 *
 * Expected assets (drop into `public/media/` to swap placeholders / wire the
 * real download with zero code change):
 *   - `public/media/report.png`          — screenshot of the Excel report tables.
 *   - `public/media/sample-report.xlsx`  — downloadable sample of the deliverable.
 *
 * The sample-report download link points at the path above regardless of
 * whether the binary is present yet; ship the real `.xlsx` from a covecta.io
 * run when convenient and the link starts serving it automatically.
 */
export const howItWorks = {
  /** Page-level metadata (composed with the layout's `%s · seoditly` template). */
  meta: {
    title: "How it works",
    description:
      `See exactly how ${PRODUCT_NAME} audits your site — from crawl to a ` +
      "severity-ranked Excel report — and what your developers walk away with.",
  },

  intro: {
    badge: "How it works",
    headline: "From a single URL to a report your developers can ship against.",
    subhead:
      "An audit crawls your whole site, runs every technical check, scores your Core Web Vitals, and distils it all into one prioritized Excel spec — no dashboards to learn, no raw data to sift.",
  },

  pipeline: {
    eyebrow: "The process",
    heading: "Five stages, fully automated.",
    body: "You point us at a URL. We handle the rest and hand back the result — here is what happens in between.",
    stages: [
      {
        key: "crawl",
        title: "Crawl",
        description:
          "We fetch every page, link, image, and meta tag on your site — following internal links the way a search engine does.",
      },
      {
        key: "enrich",
        title: "Enrich",
        description:
          "We map the link graph, resolve redirects, and connect canonical relationships so every URL is understood in context, not in isolation.",
      },
      {
        key: "analyze",
        title: "Analyze",
        description:
          "Around 31 technical checks run across the crawl, flagging issues and ranking each one by severity so the highest-impact work surfaces first.",
      },
      {
        key: "performance",
        title: "Performance",
        description:
          "We pull real Core Web Vitals — LCP, CLS, and INP — for key pages through Google PageSpeed and fold them into the findings.",
      },
      {
        key: "report",
        title: "Report",
        description:
          "Everything lands in a single styled Excel spec: categorized fix tables, severity ranking, and rows your developers can action directly.",
      },
    ],
  },

  checks: {
    eyebrow: "What we check",
    heading: "~31 technical checks, grouped six ways.",
    body: "Each category maps to a section in your report. Here is the breadth of what every audit covers — without the wall of detail.",
  },

  report: {
    eyebrow: "The deliverable",
    heading: "What the report looks like.",
    body: "You do not get a login and a learning curve. You get a styled Excel spec — the same ТЗ format your developers already work from — with every issue categorized, ranked by severity, and ready to action.",
    bullets: [
      "Categorized fix tables, grouped by issue type.",
      "Severity ranking so the highest-impact work is up top.",
      "Developer-ready rows that map to concrete, shippable changes.",
    ],
    /** Accessible description for the report MediaFrame placeholder. */
    mediaAlt:
      "Excel report screenshot — categorized fix tables ranked by severity",
    download: {
      label: "Download a sample report",
      /** Served from `public/media/`; the binary may land later (see file header). */
      href: "/media/sample-report.xlsx",
      note: "Sample .xlsx · the same format your audit returns",
    },
  },

  expectations: {
    eyebrow: "What to expect",
    heading: "Plain expectations, no surprises.",
    items: [
      {
        key: "turnaround",
        title: "Fast turnaround",
        description:
          "Most audits complete within hours of submitting your URL — larger sites take a little longer.",
      },
      {
        key: "format",
        title: "An Excel file",
        description:
          "The deliverable is a single .xlsx spec — no portal to log into, no proprietary viewer required.",
      },
      {
        key: "severity",
        title: "Prioritized by severity",
        description:
          "Every finding is ranked critical → info, so your team knows exactly what to fix first.",
      },
    ],
  },

  cta: {
    headline: "Ready to see what's holding your SEO back?",
    body: "Send us your URL and we'll run a free audit — you'll get the same severity-ranked report your developers can act on today.",
    primary: { label: "Get a free audit", href: "/contact" },
  },
} as const;

export type HowItWorks = typeof howItWorks;
