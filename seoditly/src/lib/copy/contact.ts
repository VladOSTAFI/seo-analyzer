import { PRODUCT_NAME } from "@/lib/constants";
import type { Locale } from "@/lib/i18n/config";
import { mergeCopy, type DeepPartial } from "@/lib/i18n/merge";

/**
 * Copy for `/contact`. `contactEn` is the typed English source of truth (and
 * fallback); `contactUk` overrides it. `getContact(locale)` deep-merges UK over
 * EN. The client form receives its slice via props; `contact` stays English.
 */
export const contactEn = {
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

export type Contact = typeof contactEn;

const contactUk: DeepPartial<Contact> = {
  meta: {
    title: "Контакти",
    description:
      `Розкажіть ${PRODUCT_NAME} про свій сайт — і ми проведемо безкоштовний ` +
      "технічний SEO-аудит: вкажіть URL, а ми повернемося до вас зі звітом.",
  },

  intro: {
    badge: "Безкоштовний аудит",
    headline: "Розкажіть нам про свій сайт.",
    subhead:
      "Надішліть нам свій URL і кілька слів про те, що вас цікавить. Ми проведемо безкоштовний технічний SEO-аудит і повернемося до вас зі звітом із пріоритетами за критичністю, з яким зможуть працювати ваші розробники.",
  },

  form: {
    fields: {
      name: {
        label: "Ім’я",
        placeholder: "Іван Розробник",
      },
      email: {
        label: "Електронна пошта",
        placeholder: "ivan@company.com",
        help: "Використаємо її лише, щоб надіслати вам аудит.",
      },
      siteUrl: {
        label: "URL сайту",
        optionalLabel: "необов’язково",
        help: "Сайт, який ви хочете перевірити.",
      },
      message: {
        label: "Повідомлення",
        optionalLabel: "необов’язково",
        placeholder: "Що нам варто знати про ваш сайт чи цілі?",
      },
    },
    submit: {
      idle: "Надіслати повідомлення",
      pending: "Надсилання…",
    },
    feedback: {
      successTitle: "Повідомлення надіслано",
      successInline:
        "Дякуємо — ваше повідомлення отримано. Ми перевіримо ваш сайт і відповімо електронною поштою.",
      errorTitle: "Щось пішло не так",
      errorGeneral:
        "Не вдалося надіслати повідомлення. Перевірте форму й спробуйте ще раз.",
      rateLimited:
        "Ви вже надіслали кілька повідомлень. Зачекайте трохи, перш ніж спробувати знову.",
    },
  },

  privacy:
    "Ми використовуємо ваші дані лише для проведення аудиту й відповіді вам. Жодного спаму чи передачі третім сторонам.",
};

const BY_LOCALE: Record<Locale, Contact> = {
  en: contactEn,
  uk: mergeCopy(contactEn, contactUk),
};

export function getContact(locale: Locale): Contact {
  return BY_LOCALE[locale];
}

export const contact = contactEn;
