import { PRODUCT_NAME } from "@/lib/constants";

/**
 * All user-facing copy for the `/contact` page. Same pattern as {@link home}
 * and {@link howItWorks}: a typed `const ... as const` object imported by
 * `app/contact/page.tsx` and `components/contact/contact-form.tsx`, so wording
 * iterates without touching JSX. Product name via {@link PRODUCT_NAME}.
 */
export const contact = {
  /** Page-level metadata (composed with the layout's `%s · seoditly` template). */
  meta: {
    title: "Contact",
    description:
      `Tell ${PRODUCT_NAME} about your site and we'll run a free technical SEO ` +
      "audit — point us at a URL and we'll get back to you with the report.",
  },

  intro: {
    badge: "Get a free audit",
    headline: "Tell us about your site.",
    subhead:
      "Send us your URL and a line about what you're after. We'll run a free technical SEO audit and get back to you with a severity-ranked report your developers can action.",
  },

  form: {
    /** Field labels, placeholders, and per-field helper text. */
    fields: {
      name: {
        label: "Name",
        placeholder: "Jane Developer",
        autoComplete: "name",
      },
      email: {
        label: "Email",
        placeholder: "jane@company.com",
        autoComplete: "email",
        help: "We'll only use this to send you the audit.",
      },
      siteUrl: {
        label: "Site URL",
        optionalLabel: "optional",
        placeholder: "https://example.com",
        autoComplete: "url",
        help: "The site you'd like us to audit.",
      },
      message: {
        label: "Message",
        optionalLabel: "optional",
        placeholder: "Anything we should know about your site or goals?",
      },
    },
    submit: {
      idle: "Send message",
      pending: "Sending…",
    },
    /** Generic messages surfaced in toasts / inline banners. */
    feedback: {
      successTitle: "Message sent",
      successInline:
        "Thanks — your message is in. We'll review your site and get back to you by email.",
      errorTitle: "Something went wrong",
      errorGeneral:
        "We couldn't send your message. Please check the form and try again.",
      rateLimited:
        "You've sent a few messages already. Please wait a little while before trying again.",
    },
  },

  privacy:
    "We only use your details to run your audit and reply to you. No spam, no sharing with third parties.",
} as const;

export type Contact = typeof contact;
