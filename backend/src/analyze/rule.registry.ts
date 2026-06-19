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
import { linksAnchorQualityRule } from './rules/links/anchor-quality.rule';
import { linksInternalNofollowRule } from './rules/links/internal-nofollow.rule';
import { linksExternalRedirectRule } from './rules/links/external-redirect.rule';

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
import { metaOpengraphRule } from './rules/meta/opengraph.rule';

// schema.*
import { schemaMissingRule } from './rules/schema/missing.rule';
import { schemaInvalidRule } from './rules/schema/invalid.rule';
import { schemaIncompleteRule } from './rules/schema/incomplete.rule';
import { schemaLocalBusinessRule } from './rules/schema/localbusiness.rule';

// dupe.*
import { dupeContentRule } from './rules/dupe/content.rule';
import { dupeNearContentRule } from './rules/dupe/near-content.rule';

// index.*
import { indexCanonicalRule } from './rules/index/canonical.rule';
import { indexRobotsRule } from './rules/index/robots.rule';
import { indexUrlHeuristicsRule } from './rules/index/url-heuristics.rule';
import { indexOrphanPageRule } from './rules/index/orphan-page.rule';
import { indexClickDepthRule } from './rules/index/click-depth.rule';
import { indexSignalConflictRule } from './rules/index/signal-conflict.rule';
import { indexSoft404Rule } from './rules/index/soft-404.rule';
import { indexLangViewportRule } from './rules/index/lang-viewport.rule';

// pagination.*
import { paginationRelRule } from './rules/pagination/rel.rule';

// i18n.*
import { i18nHreflangRule } from './rules/i18n/hreflang.rule';

// image.*
import { imageAltTitleRule } from './rules/image/alt-title.rule';
import { imageAltQualityRule } from './rules/image/alt-quality.rule';
import { imageBrokenRule } from './rules/image/broken.rule';
import { imageOversizedRule } from './rules/image/oversized.rule';
import { imageLegacyFormatRule } from './rules/image/legacy-format.rule';
import { imageNoDimensionsRule } from './rules/image/no-dimensions.rule';
import { imageResponsiveRule } from './rules/image/responsive.rule';
import { imageLazyLoadingRule } from './rules/image/lazy-loading.rule';

// perf.*
import { perfLcpRule } from './rules/perf/lcp.rule';
import { perfClsInpRule } from './rules/perf/cls-inp.rule';
import { perfPsiUsabilityRule } from './rules/perf/psi-usability.rule';
import { perfLabScoreRule } from './rules/perf/lab-score.rule';

// robots.*
import { robotsBlocksImportantRule } from './rules/robots/blocks-important.rule';

// sitemap.*
import { sitemapInvalidRule } from './rules/sitemap/invalid.rule';
import { sitemapUrlNot200Rule } from './rules/sitemap/url-not-200.rule';
import { sitemapNoindexUrlRule } from './rules/sitemap/noindex-url.rule';

// content.*
import { contentHeadingsHierarchyRule } from './rules/content/headings-hierarchy.rule';
import { contentThinRule } from './rules/content/thin.rule';

// security.*
import { securityMixedContentRule } from './rules/security/mixed-content.rule';
import { securityHttpsRule } from './rules/security/https.rule';
import { securityHstsRule } from './rules/security/hsts.rule';
import { securityHeadersRule } from './rules/security/headers.rule';
import { securityCertRule } from './rules/security/cert.rule';

// mobile.*
import { mobileViewportRule } from './rules/mobile/viewport.rule';
import { mobileUsabilityRule } from './rules/mobile/usability.rule';

// page.*
import { pageWeightRule } from './rules/page/weight.rule';

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
  linksAnchorQualityRule,
  linksInternalNofollowRule,
  linksExternalRedirectRule,

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
  metaOpengraphRule,

  // schema.*
  schemaMissingRule,
  schemaInvalidRule,
  schemaIncompleteRule,
  schemaLocalBusinessRule,

  // dupe.*
  dupeContentRule,
  dupeNearContentRule,

  // index.*
  indexCanonicalRule,
  indexRobotsRule,
  indexUrlHeuristicsRule,
  indexOrphanPageRule,
  indexClickDepthRule,
  indexSignalConflictRule,
  indexSoft404Rule,
  indexLangViewportRule,

  // content.*
  contentHeadingsHierarchyRule,
  contentThinRule,

  // pagination.*
  paginationRelRule,

  // i18n.*
  i18nHreflangRule,

  // image.*
  imageAltTitleRule,
  imageAltQualityRule,
  imageBrokenRule,
  imageOversizedRule,
  imageLegacyFormatRule,
  imageNoDimensionsRule,
  imageResponsiveRule,
  imageLazyLoadingRule,

  // perf.*
  perfLcpRule,
  perfClsInpRule,
  perfPsiUsabilityRule,
  perfLabScoreRule,

  // robots.*
  robotsBlocksImportantRule,

  // sitemap.*
  sitemapInvalidRule,
  sitemapUrlNot200Rule,
  sitemapNoindexUrlRule,

  // security.*
  securityMixedContentRule,
  securityHttpsRule,
  securityHstsRule,
  securityHeadersRule,
  securityCertRule,

  // mobile.*
  mobileViewportRule,
  mobileUsabilityRule,

  // page.*
  pageWeightRule,
];
