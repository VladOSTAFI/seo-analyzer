import type { Locale } from "@/lib/i18n/config";
import { mergeCopy, type DeepPartial } from "@/lib/i18n/merge";

/**
 * Copy for the auth surface: the login/register pages, the shared form, the
 * Server Action error/feedback messages, and the validation messages.
 *
 * `authEn` is the typed English source of truth (and fallback); `authUk`
 * overrides it. `getAuth(locale)` deep-merges UK over EN. Server actions resolve
 * the locale from the request cookie/path; the client form receives its slice
 * as a prop.
 */
export const authEn = {
  meta: {
    loginTitle: "Sign in",
    loginDescription: "Sign in to your seoditly dashboard.",
    registerTitle: "Create account",
    registerDescription: "Create a seoditly account to run technical SEO audits.",
  },

  login: {
    heading: "Welcome back",
    subhead: "Sign in to view your audits and reports.",
    submit: "Sign in",
    submitPending: "Signing in…",
    altPrompt: "Don't have an account?",
    altLabel: "Create one",
  },

  register: {
    heading: "Create your account",
    subhead: "Start running automated technical SEO audits.",
    submit: "Create account",
    submitPending: "Creating account…",
    altPrompt: "Already have an account?",
    altLabel: "Sign in",
  },

  form: {
    emailLabel: "Email",
    emailPlaceholder: "you@company.com",
    passwordLabel: "Password",
    passwordPlaceholderRegister: "At least 8 characters",
    passwordPlaceholderLogin: "Your password",
  },

  /** Server-action (and surfaced) error messages. */
  errors: {
    badCredentials: "Incorrect email or password.",
    duplicateEmail: "An account with this email already exists.",
    tooManyAttempts: "Too many attempts. Please wait a moment and try again.",
    general: "Something went wrong. Please try again.",
    unreachable: "Couldn't reach the server. Please try again shortly.",
  },

  /** Client + server zod validation messages (shared by both forms). */
  validation: {
    emailInvalid: "Please enter a valid email address.",
    emailTooLong: "Email must be 254 characters or fewer.",
    passwordRequired: "Please enter your password.",
    passwordTooShort: "Password must be at least 8 characters.",
    passwordTooLong: "Password must be 200 characters or fewer.",
  },
} as const;

export type Auth = typeof authEn;

const authUk: DeepPartial<Auth> = {
  meta: {
    loginTitle: "Вхід",
    loginDescription: "Увійдіть до свого кабінету seoditly.",
    registerTitle: "Створити обліковий запис",
    registerDescription:
      "Створіть обліковий запис seoditly, щоб проводити технічні SEO-аудити.",
  },

  login: {
    heading: "З поверненням",
    subhead: "Увійдіть, щоб переглянути свої аудити та звіти.",
    submit: "Увійти",
    submitPending: "Вхід…",
    altPrompt: "Немає облікового запису?",
    altLabel: "Створити",
  },

  register: {
    heading: "Створіть обліковий запис",
    subhead: "Почніть проводити автоматизовані технічні SEO-аудити.",
    submit: "Створити обліковий запис",
    submitPending: "Створення…",
    altPrompt: "Уже маєте обліковий запис?",
    altLabel: "Увійти",
  },

  form: {
    emailLabel: "Електронна пошта",
    emailPlaceholder: "you@company.com",
    passwordLabel: "Пароль",
    passwordPlaceholderRegister: "Щонайменше 8 символів",
    passwordPlaceholderLogin: "Ваш пароль",
  },

  errors: {
    badCredentials: "Неправильна електронна пошта або пароль.",
    duplicateEmail: "Обліковий запис із цією поштою вже існує.",
    tooManyAttempts: "Забагато спроб. Зачекайте трохи й спробуйте ще раз.",
    general: "Щось пішло не так. Спробуйте ще раз.",
    unreachable: "Не вдалося зв’язатися із сервером. Спробуйте ще раз трохи згодом.",
  },

  validation: {
    emailInvalid: "Введіть дійсну адресу електронної пошти.",
    emailTooLong: "Пошта має містити не більше ніж 254 символи.",
    passwordRequired: "Введіть пароль.",
    passwordTooShort: "Пароль має містити щонайменше 8 символів.",
    passwordTooLong: "Пароль має містити не більше ніж 200 символів.",
  },
};

const BY_LOCALE: Record<Locale, Auth> = {
  en: authEn,
  uk: mergeCopy(authEn, authUk),
};

export function getAuth(locale: Locale): Auth {
  return BY_LOCALE[locale];
}
