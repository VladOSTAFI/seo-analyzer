import { z } from "zod";

/**
 * SSRF-safe validation for the "Start audit" target URL (Phase 5).
 *
 * Why this lives here, not on the backend:
 *   The NestJS `POST /audits` endpoint does NOT validate the target host (see
 *   the backend-gaps table in IMPLEMENTATION_PLAN.md). Since the backend's
 *   crawler will fetch whatever URL it's handed, an attacker could point it at
 *   internal/cloud-metadata endpoints (a classic SSRF). seoditly applies this
 *   check as DEFENCE IN DEPTH, server-side, BEFORE the request ever reaches the
 *   backend — both in the client form (fast feedback) and, authoritatively, in
 *   the start-audit Server Action.
 *
 * What we reject (best-effort, syntactic — DNS is not resolved here):
 *   - Anything that isn't a parseable `http(s)://` URL.
 *   - `localhost`, `*.localhost`, and any `*.local` host.
 *   - IPv4 literals in the private / loopback / link-local / reserved ranges:
 *       127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16,
 *       169.254.0.0/16 (incl. cloud metadata 169.254.169.254),
 *       0.0.0.0/8, 100.64.0.0/10 (CGNAT).
 *   - IPv6 loopback `::1`, unspecified `::`, unique-local `fc00::/7`
 *     (fc00–fdff), link-local `fe80::/10`, and IPv4-mapped forms wrapping a
 *     private IPv4 — in BOTH the dotted (`::ffff:127.0.0.1`) and the
 *     URL-normalised hex (`::ffff:7f00:1`) representations.
 *
 * Limitations (documented honestly): this is a SYNTACTIC guard. A public
 * hostname whose DNS resolves to a private IP (DNS rebinding) is not caught
 * here — that would require resolving + re-checking at fetch time on whatever
 * actually performs the request (the backend). This raises the bar
 * meaningfully without a network round-trip and is the right layer for a
 * front-end defence-in-depth check.
 */

/** Max URL length we accept (defensive cap, well under common limits). */
const MAX_URL_LENGTH = 2048;

/** Hostnames that always denote the local machine. */
const BLOCKED_HOSTNAMES = new Set(["localhost"]);

/** Parse an IPv4 literal into its four octets, or `null` if it isn't one. */
function parseIpv4(host: string): [number, number, number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const octets = m.slice(1).map((s) => Number(s));
  if (octets.some((o) => o < 0 || o > 255)) return null;
  return octets as [number, number, number, number];
}

/** True if an IPv4 literal falls in a private / loopback / reserved range. */
function isPrivateIpv4(host: string): boolean {
  const octets = parseIpv4(host);
  if (!octets) return false;
  const [a, b] = octets;

  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (+ metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  return false;
}

/**
 * Decode the trailing two hextets of an IPv4-mapped IPv6 address (the form the
 * URL parser normalises `::ffff:127.0.0.1` into: `::ffff:7f00:1`) into dotted
 * IPv4, or `null` if it isn't that shape.
 */
function ipv4MappedHexToDotted(host: string): string | null {
  // Expect ...:ffff:HHHH:HHHH at the tail (HHHH may be shortened).
  const m = /:ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
  if (!m) return null;
  const hi = parseInt(m[1], 16);
  const lo = parseInt(m[2], 16);
  if (Number.isNaN(hi) || Number.isNaN(lo)) return null;
  return [
    (hi >> 8) & 0xff,
    hi & 0xff,
    (lo >> 8) & 0xff,
    lo & 0xff,
  ].join(".");
}

/**
 * True if an IPv6 host (as URL parses it, WITHOUT surrounding brackets) is
 * loopback / unspecified / unique-local / link-local, or an IPv4-mapped form
 * wrapping a private IPv4.
 */
function isPrivateIpv6(rawHost: string): boolean {
  // `URL.hostname` keeps the brackets for IPv6; strip them for inspection.
  const host = rawHost.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
  if (!host.includes(":")) return false; // not IPv6

  if (host === "::1" || host === "::") return true; // loopback / unspecified

  // IPv4-mapped, dotted form: trailing dotted-quad (e.g. ::ffff:127.0.0.1).
  const lastColon = host.lastIndexOf(":");
  const tail = host.slice(lastColon + 1);
  if (tail.includes(".") && isPrivateIpv4(tail)) return true;

  // IPv4-mapped, hex form the URL parser produces (e.g. ::ffff:7f00:1).
  const mapped = ipv4MappedHexToDotted(host);
  if (mapped && isPrivateIpv4(mapped)) return true;

  // Unique-local fc00::/7 (first byte fc or fd) and link-local fe80::/10.
  const firstHextet = host.split(":")[0];
  if (firstHextet.startsWith("fc") || firstHextet.startsWith("fd")) return true;
  if (firstHextet.startsWith("fe8") || firstHextet.startsWith("fe9")) return true;
  if (firstHextet.startsWith("fea") || firstHextet.startsWith("feb")) return true;

  return false;
}

/** Locale-keyed reasons a URL is rejected (surfaced verbatim to the form). */
import type { Locale } from "@/lib/i18n/config";

interface AuditUrlMessages {
  required: string;
  tooLong: string;
  format: string;
  protocol: string;
  private: string;
}

const MESSAGES: Record<Locale, AuditUrlMessages> = {
  en: {
    required: "Enter a URL to audit.",
    tooLong: `URL must be ${MAX_URL_LENGTH} characters or fewer.`,
    format: "Enter a valid URL starting with http:// or https://.",
    protocol: "Only http:// and https:// URLs are allowed.",
    private:
      "That host isn't allowed. Enter a public website (no localhost or private IPs).",
  },
  uk: {
    required: "Введіть URL для аудиту.",
    tooLong: `URL має містити не більше ніж ${MAX_URL_LENGTH} символів.`,
    format: "Введіть дійсний URL, що починається з http:// або https://.",
    protocol: "Дозволено лише URL з http:// та https://.",
    private:
      "Цей хост не дозволено. Введіть публічний сайт (без localhost чи приватних IP).",
  },
};

const ERR_FORMAT = MESSAGES.en.format;
const ERR_PROTOCOL = MESSAGES.en.protocol;
const ERR_PRIVATE = MESSAGES.en.private;

/**
 * Core check shared by the zod schema and any direct caller. Returns `null`
 * when the URL is an acceptable public http(s) target, or an error message.
 * Localized via `messages` (defaults to English).
 */
export function rejectUnsafeAuditUrl(
  value: string,
  messages: AuditUrlMessages = MESSAGES.en,
): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return messages.format;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return messages.protocol;
  }

  const host = url.hostname.toLowerCase();
  if (!host) return messages.format;

  if (BLOCKED_HOSTNAMES.has(host)) return messages.private;
  if (host.endsWith(".local") || host.endsWith(".localhost")) return messages.private;
  if (isPrivateIpv4(host)) return messages.private;
  if (isPrivateIpv6(url.hostname)) return messages.private;

  return null;
}

// Reference the English aliases so they aren't considered unused by lint.
void ERR_FORMAT;
void ERR_PROTOCOL;
void ERR_PRIVATE;

/** Build a start-audit schema with localized messages. */
export function makeStartAuditSchema(messages: AuditUrlMessages) {
  return z.object({
    url: z
      .string()
      .trim()
      .min(1, messages.required)
      .max(MAX_URL_LENGTH, messages.tooLong)
      .superRefine((value, ctx) => {
        const reason = rejectUnsafeAuditUrl(value, messages);
        if (reason) {
          ctx.addIssue({ code: "custom", message: reason });
        }
      }),
  });
}

/** Localized start-audit schema for a given locale (English fallback). */
export function getStartAuditSchema(locale: Locale) {
  return makeStartAuditSchema(MESSAGES[locale] ?? MESSAGES.en);
}

/**
 * Shared (English) zod schema for the start-audit form. The client component
 * and the Server Action use the LOCALIZED variants; this stays as the fallback.
 */
export const startAuditSchema = makeStartAuditSchema(MESSAGES.en);

/** Validated start-audit payload (`{ url }`). */
export type StartAuditValues = z.infer<typeof startAuditSchema>;

/** Per-field error map returned to the start-audit form. */
export type StartAuditFieldErrors = Partial<
  Record<keyof StartAuditValues, string[]>
>;
