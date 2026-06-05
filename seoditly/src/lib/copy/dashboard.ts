import type { Locale } from "@/lib/i18n/config";
import { mergeCopy, type DeepPartial } from "@/lib/i18n/merge";

/**
 * All user-facing copy for the gated dashboard + audits + findings surface.
 * `dashboardEn` is the typed English source of truth (and fallback);
 * `dashboardUk` overrides it. `getDashboard(locale)` deep-merges UK over EN.
 *
 * Server pages read it via `getDashboard(await getRequestLocale())`; client
 * components (tables, filters, live detail, forms) receive their slice as a
 * `strings` prop so nothing locale-related has to be threaded through context.
 */
export const dashboardEn = {
  meta: {
    dashboardTitle: "Dashboard",
    dashboardDescription: "Your seoditly audit overview.",
    auditsTitle: "Audits",
    auditsDescription: "Your seoditly audits.",
    auditTitle: "Audit",
    auditDescription: "An audit on seoditly.",
    findingsTitle: "Findings",
    findingsDescription: "Audit findings on seoditly.",
  },

  dashboard: {
    heading: "Dashboard",
    welcomeBack: "Welcome back.",
    signedInAs: "Signed in as",
    adminBadge: "admin",
    startNewAudit: "Start a new audit",
    overviewLabel: "Overview",
    auditsRun: "Audits run",
    auditsRunSub: "Across all your sites.",
    latestStatus: "Latest status",
    latestStatusSub: "Your most recent audit.",
    reports: "Reports",
    reportsSub: "Ready to download (recent).",
    recentAudits: "Recent audits",
    recentAuditsAll: "Recent audits (all users)",
    viewAll: "View all",
    unreachable:
      "Your audits will appear here once the backend is available.",
    noAuditsTitle: "No audits yet",
    noAuditsBody:
      "Start your first audit above. Its status, severity rollups, and report will show up here.",
  },

  audits: {
    heading: "Audits",
    adminBadge: "All audits (admin)",
    introAdmin: "As an admin you can see every audit across all users.",
    introUser: "Every audit you've started, newest first.",
    startSectionLabel: "Start an audit",
    startNewAudit: "Start a new audit",
    startHint:
      "Enter a public website URL (http or https). We'll crawl it, run the checks, and build a developer-ready report.",
    errorUnreachable:
      "Couldn't reach the backend. Your audits will appear here once it's available.",
    errorGeneral: "Couldn't load your audits right now. Please try again shortly.",
    noAuditsTitle: "No audits yet",
    noAuditsBody:
      "Start your first audit above. Its status, severity rollups, and report will show up here.",
  },

  pagination: {
    pageOf: "Page {page} of {totalPages} · {total} total",
    previous: "Previous",
    next: "Next",
    label: "Pagination",
  },

  table: {
    url: "URL",
    status: "Status",
    created: "Created",
    view: "View",
    failedAt: "at",
    viewAuditFor: "View audit for {url}",
  },

  status: {
    created: "created",
    crawling: "crawling",
    enriching: "enriching",
    analyzing: "analyzing",
    reporting: "reporting",
    done: "done",
    failed: "failed",
  },

  detail: {
    allAudits: "← All audits",
    failedAt: "failed at:",
    pipeline: "Pipeline",
    pipelineRunning:
      "Pipeline running — this readout refreshes automatically every few seconds.",
    findings: "Findings",
    findingsAppearWhenRunning: "Findings appear once analysis completes.",
    noFindings: "No findings — this site passed every check.",
    browseFindings: "Browse findings",
    browseTerminal: "Filter the full set by severity and rule.",
    browseRunning: "Findings become available once the audit finishes.",
    viewFindings: "View findings",
    unreachable: "Couldn't reach the backend. Please try again shortly.",
    auditPipelineLabel: "Audit pipeline",
  },

  report: {
    download: "Download report",
    notReadyTitle:
      "The report is generated once the audit reaches the reporting stage.",
  },

  pipelineStages: {
    crawl: "crawl",
    enrich: "enrich",
    analyze: "analyze",
    report: "report",
  },

  findings: {
    backToAudit: "← Back to audit",
    heading: "Findings",
    errorGeneral: "Couldn't load findings right now. Please try again shortly.",
    unreachable: "Couldn't reach the backend. Please try again shortly.",
    severityLabel: "Severity",
    allSeverities: "All severities",
    issueLabel: "Issue",
    allIssues: "All issues",
    noForFilter: "No findings for this filter.",
    pageAffected: "page affected",
    pagesAffected: "pages affected",
    whatWeFound: "What we found",
    whyItMatters: "Why it matters",
    howToFix: "How to fix it",
    affectedPages: "Affected pages",
    affectedScope: "Affected scope",
    siteWide: "— site-wide —",
    ruleIdTitle: "Technical rule id (used by support)",
    showFewer: "Show fewer",
    showAll: "Show all {total} ({more} more)",
    issueOnPage: "issue",
    issuesOnPage: "issues",
    onThisPage: "on this page",
    shownOfTotal: ", {shown} of {total} findings shown",
    showingFirst:
      "Showing the first {shown} of {total} findings. Use the page controls below, or filter by severity or rule, to see the rest.",
  },

  startForm: {
    urlLabel: "URL to audit",
    starting: "Starting…",
    startAudit: "Start audit",
    successTitle: "Audit started",
    successBody: "Tracking progress — this page updates automatically.",
    errorTitle: "Couldn't start the audit",
    actionErrors: {
      unreachable: "Couldn't reach the server. Please try again shortly.",
      sessionEnded: "Your session expired. Please sign in again.",
      general: "Couldn't start the audit. Please try again.",
    },
  },

  notFound: {
    title: "Audit not found",
    body: "This audit doesn't exist, or it isn't one of yours. Check the link, or head back to your audits.",
    back: "Back to audits",
  },
} as const;

export type Dashboard = typeof dashboardEn;

const dashboardUk: DeepPartial<Dashboard> = {
  meta: {
    dashboardTitle: "Кабінет",
    dashboardDescription: "Огляд ваших аудитів у seoditly.",
    auditsTitle: "Аудити",
    auditsDescription: "Ваші аудити в seoditly.",
    auditTitle: "Аудит",
    auditDescription: "Аудит у seoditly.",
    findingsTitle: "Висновки",
    findingsDescription: "Висновки аудиту в seoditly.",
  },

  dashboard: {
    heading: "Кабінет",
    welcomeBack: "З поверненням.",
    signedInAs: "Ви увійшли як",
    adminBadge: "адмін",
    startNewAudit: "Запустити новий аудит",
    overviewLabel: "Огляд",
    auditsRun: "Проведено аудитів",
    auditsRunSub: "По всіх ваших сайтах.",
    latestStatus: "Останній статус",
    latestStatusSub: "Ваш найновіший аудит.",
    reports: "Звіти",
    reportsSub: "Готові до завантаження (нещодавні).",
    recentAudits: "Нещодавні аудити",
    recentAuditsAll: "Нещодавні аудити (усі користувачі)",
    viewAll: "Переглянути всі",
    unreachable:
      "Ваші аудити з’являться тут, щойно бекенд стане доступним.",
    noAuditsTitle: "Аудитів ще немає",
    noAuditsBody:
      "Запустіть свій перший аудит вище. Його статус, зведення за критичністю та звіт з’являться тут.",
  },

  audits: {
    heading: "Аудити",
    adminBadge: "Усі аудити (адмін)",
    introAdmin: "Як адміністратор ви бачите всі аудити всіх користувачів.",
    introUser: "Усі аудити, які ви запустили, найновіші зверху.",
    startSectionLabel: "Запустити аудит",
    startNewAudit: "Запустити новий аудит",
    startHint:
      "Введіть URL публічного сайту (http або https). Ми проскануємо його, виконаємо перевірки й побудуємо звіт для розробників.",
    errorUnreachable:
      "Не вдалося зв’язатися з бекендом. Ваші аудити з’являться тут, щойно він стане доступним.",
    errorGeneral:
      "Не вдалося завантажити ваші аудити зараз. Спробуйте ще раз трохи згодом.",
    noAuditsTitle: "Аудитів ще немає",
    noAuditsBody:
      "Запустіть свій перший аудит вище. Його статус, зведення за критичністю та звіт з’являться тут.",
  },

  pagination: {
    pageOf: "Сторінка {page} з {totalPages} · усього {total}",
    previous: "Назад",
    next: "Далі",
    label: "Пагінація",
  },

  table: {
    url: "URL",
    status: "Статус",
    created: "Створено",
    view: "Переглянути",
    failedAt: "на етапі",
    viewAuditFor: "Переглянути аудит для {url}",
  },

  status: {
    created: "створено",
    crawling: "сканування",
    enriching: "збагачення",
    analyzing: "аналіз",
    reporting: "формування звіту",
    done: "готово",
    failed: "помилка",
  },

  detail: {
    allAudits: "← Усі аудити",
    failedAt: "помилка на етапі:",
    pipeline: "Конвеєр",
    pipelineRunning:
      "Конвеєр працює — ці дані оновлюються автоматично кожні кілька секунд.",
    findings: "Висновки",
    findingsAppearWhenRunning: "Висновки з’являться після завершення аналізу.",
    noFindings: "Жодних проблем — сайт пройшов усі перевірки.",
    browseFindings: "Переглянути висновки",
    browseTerminal: "Фільтруйте весь набір за критичністю та правилом.",
    browseRunning: "Висновки стануть доступні після завершення аудиту.",
    viewFindings: "Переглянути висновки",
    unreachable: "Не вдалося зв’язатися з бекендом. Спробуйте ще раз трохи згодом.",
    auditPipelineLabel: "Конвеєр аудиту",
  },

  report: {
    download: "Завантажити звіт",
    notReadyTitle: "Звіт формується, коли аудит доходить до етапу формування звіту.",
  },

  pipelineStages: {
    crawl: "сканування",
    enrich: "збагачення",
    analyze: "аналіз",
    report: "звіт",
  },

  findings: {
    backToAudit: "← Назад до аудиту",
    heading: "Висновки",
    errorGeneral:
      "Не вдалося завантажити висновки зараз. Спробуйте ще раз трохи згодом.",
    unreachable: "Не вдалося зв’язатися з бекендом. Спробуйте ще раз трохи згодом.",
    severityLabel: "Критичність",
    allSeverities: "Усі рівні",
    issueLabel: "Проблема",
    allIssues: "Усі проблеми",
    noForFilter: "Немає висновків за цим фільтром.",
    pageAffected: "сторінка під впливом",
    pagesAffected: "сторінок під впливом",
    whatWeFound: "Що ми виявили",
    whyItMatters: "Чому це важливо",
    howToFix: "Як виправити",
    affectedPages: "Сторінки під впливом",
    affectedScope: "Зона впливу",
    siteWide: "— на всьому сайті —",
    ruleIdTitle: "Технічний ідентифікатор правила (для підтримки)",
    showFewer: "Згорнути",
    showAll: "Показати всі {total} (ще {more})",
    issueOnPage: "проблема",
    issuesOnPage: "проблем",
    onThisPage: "на цій сторінці",
    shownOfTotal: ", показано {shown} з {total} висновків",
    showingFirst:
      "Показано перші {shown} з {total} висновків. Скористайтеся кнопками сторінок нижче або відфільтруйте за критичністю чи правилом, щоб побачити решту.",
  },

  startForm: {
    urlLabel: "URL для аудиту",
    starting: "Запуск…",
    startAudit: "Запустити аудит",
    successTitle: "Аудит запущено",
    successBody: "Відстежуємо прогрес — сторінка оновлюється автоматично.",
    errorTitle: "Не вдалося запустити аудит",
    actionErrors: {
      unreachable: "Не вдалося зв’язатися із сервером. Спробуйте ще раз трохи згодом.",
      sessionEnded: "Ваш сеанс закінчився. Увійдіть ще раз.",
      general: "Не вдалося запустити аудит. Спробуйте ще раз.",
    },
  },

  notFound: {
    title: "Аудит не знайдено",
    body: "Цього аудиту не існує або він не належить вам. Перевірте посилання або поверніться до своїх аудитів.",
    back: "Повернутися до аудитів",
  },
};

const BY_LOCALE: Record<Locale, Dashboard> = {
  en: dashboardEn,
  uk: mergeCopy(dashboardEn, dashboardUk),
};

export function getDashboard(locale: Locale): Dashboard {
  return BY_LOCALE[locale];
}

/** Simple `{key}` token interpolation for the pluralizable/parameterized strings. */
export function fmt(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    k in values ? String(values[k]) : `{${k}}`,
  );
}
