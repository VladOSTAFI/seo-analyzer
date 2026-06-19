import type { Rule } from './rule.types';

// mirror.*
import { mirrorMainMirrorRule } from './rules/mirror/main-mirror.rule';
import { mirrorTrailingSlashRule } from './rules/mirror/trailing-slash.rule';

// links.*
import { linksInternalRedirectRule } from './rules/links/internal-redirect.rule';
import { linksRedirectChainRule } from './rules/links/redirect-chain.rule';
import { linksBrokenInternalRule } from './rules/links/broken-internal.rule';
import { linksBrokenExternalRule } from './rules/links/broken-external.rule';
import { linksExternalFlagRule } from './rules/links/external-flag.rule';

// meta.*
import { metaTitleMissingRule } from './rules/meta/title-missing.rule';
import { metaTitleDuplicateRule } from './rules/meta/title-duplicate.rule';
import { metaTitleMultipleRule } from './rules/meta/title-multiple.rule';
import { metaDescriptionMissingRule } from './rules/meta/description-missing.rule';
import { metaDescriptionDuplicateRule } from './rules/meta/description-duplicate.rule';
import { metaDescriptionMultipleRule } from './rules/meta/description-multiple.rule';
import { metaH1MissingRule } from './rules/meta/h1-missing.rule';
import { metaH1DuplicateRule } from './rules/meta/h1-duplicate.rule';
import { metaH1MultipleRule } from './rules/meta/h1-multiple.rule';
import { metaTitleTemplateRule } from './rules/meta/title-template.rule';
import { metaDescriptionTemplateRule } from './rules/meta/description-template.rule';
import { metaH1TemplateRule } from './rules/meta/h1-template.rule';

// dupe.*
import { dupeContentRule } from './rules/dupe/content.rule';

// index.*
import { indexCanonicalRule } from './rules/index/canonical.rule';
import { indexRobotsRule } from './rules/index/robots.rule';
import { indexUrlHeuristicsRule } from './rules/index/url-heuristics.rule';

// pagination.*
import { paginationRelRule } from './rules/pagination/rel.rule';

// i18n.*
import { i18nHreflangRule } from './rules/i18n/hreflang.rule';

// image.*
import { imageAltTitleRule } from './rules/image/alt-title.rule';
import { imageBrokenRule } from './rules/image/broken.rule';

// perf.*
import { perfLcpRule } from './rules/perf/lcp.rule';
import { perfClsInpRule } from './rules/perf/cls-inp.rule';
import { perfPsiUsabilityRule } from './rules/perf/psi-usability.rule';
import { perfLabScoreRule } from './rules/perf/lab-score.rule';

// Item 6: `links.external-flag` is opt-in (very noisy at low severity).
// Enable by setting RULE_EXTERNAL_FLAG_ENABLED=true|1|yes|on (case-insensitive).
const _externalFlagRaw = (process.env.RULE_EXTERNAL_FLAG_ENABLED ?? '').toLowerCase().trim();
const externalFlagEnabled =
  _externalFlagRaw === 'true' ||
  _externalFlagRaw === '1' ||
  _externalFlagRaw === 'yes' ||
  _externalFlagRaw === 'on';

/**
 * The complete, ordered set of audit rules run by {@link import('./analyze.service').AnalyzeService}.
 *
 * Explicit static array — NO runtime glob/auto-import (the plan forbids magic
 * that defeats tree-shaking and static typing). Adding a check = one rule file +
 * one line here. Rules are grouped by family (the part of `ruleId` before the
 * first dot) for readability; the engine runs them in this declared order.
 *
 * Every `id` MUST be unique (it is the stable `findings.ruleId` key and the
 * report sheet key); a duplicate-id guard test enforces that invariant.
 *
 * Conditional rules:
 *   - `links.external-flag` — only included when `RULE_EXTERNAL_FLAG_ENABLED`
 *     is truthy (default OFF). See Item 6.
 */
export const RULES: Rule[] = [
  // mirror.*
  mirrorMainMirrorRule,
  mirrorTrailingSlashRule,

  // links.*
  linksInternalRedirectRule,
  linksRedirectChainRule,
  linksBrokenInternalRule,
  linksBrokenExternalRule,
  ...(externalFlagEnabled ? [linksExternalFlagRule] : []),

  // meta.*
  metaTitleMissingRule,
  metaTitleDuplicateRule,
  metaTitleMultipleRule,
  metaDescriptionMissingRule,
  metaDescriptionDuplicateRule,
  metaDescriptionMultipleRule,
  metaH1MissingRule,
  metaH1DuplicateRule,
  metaH1MultipleRule,
  metaTitleTemplateRule,
  metaDescriptionTemplateRule,
  metaH1TemplateRule,

  // dupe.*
  dupeContentRule,

  // index.*
  indexCanonicalRule,
  indexRobotsRule,
  indexUrlHeuristicsRule,

  // pagination.*
  paginationRelRule,

  // i18n.*
  i18nHreflangRule,

  // image.*
  imageAltTitleRule,
  imageBrokenRule,

  // perf.*
  perfLcpRule,
  perfClsInpRule,
  perfPsiUsabilityRule,
  perfLabScoreRule,
];
