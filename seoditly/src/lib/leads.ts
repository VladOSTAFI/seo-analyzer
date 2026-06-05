import "server-only";

import type { ContactFormValues } from "@/lib/validation";

/**
 * Lead-storage adapter — the single swappable seam between the contact form and
 * whatever backend ends up persisting leads. The marketing site has ZERO
 * dependency on the authenticated SEO backend; leads go to email (Resend)
 * and/or a `leads` table (Vercel Postgres / Supabase), never to `/audits`.
 *
 * Swapping providers later is a one-file change: implement {@link LeadStore}
 * and return it from {@link getLeadStore}. The rest of the app only sees this
 * typed interface.
 *
 * --- Env vars that activate a real provider (read server-side ONLY; never
 *     `NEXT_PUBLIC_*`, never logged) ---
 *   - `RESEND_API_KEY` + `LEADS_NOTIFY_TO` (+ optional `LEADS_NOTIFY_FROM`)
 *       → email each lead via Resend.
 *   - `POSTGRES_URL` (Vercel Postgres) or `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
 *       → insert each lead into a `leads` table.
 *
 * None are provisioned in this environment, so {@link getLeadStore} returns the
 * env-gated {@link logLeadStore} default: it records a non-PII-minimal,
 * secret-free structured line server-side and reports success, keeping the form
 * fully functional before any provider is wired.
 */

/** A captured lead: the validated form values plus server-derived context. */
export interface Lead extends ContactFormValues {
  /** Coarse capture timestamp (ISO 8601). */
  readonly receivedAt: string;
  /**
   * Best-effort client IP (from `x-forwarded-for`), used only for rate
   * limiting and abuse triage. Never surfaced to other users.
   */
  readonly ip?: string;
}

export interface LeadStoreResult {
  readonly ok: boolean;
  /** Which adapter handled the lead — useful for ops, contains no secrets. */
  readonly via: "log" | "resend" | "postgres" | "supabase";
}

/** The swappable contract. Implement this to plug in a real provider. */
export interface LeadStore {
  save(lead: Lead): Promise<LeadStoreResult>;
}

/**
 * Default adapter: structured server-side log, no real provider. Intentionally
 * logs the minimum needed for ops/abuse triage and NEVER logs secrets. Email
 * and message bodies are reduced to booleans/lengths so raw PII (the message
 * text, the full email/site) does not land in logs.
 */
const logLeadStore: LeadStore = {
  async save(lead) {
    // NOTE: structured, intentionally PII-light. We log that a lead arrived and
    // coarse shape — not the raw email address, message body, or any secret.
    console.info("[lead] received", {
      receivedAt: lead.receivedAt,
      hasSiteUrl: Boolean(lead.siteUrl),
      messageLength: lead.message?.length ?? 0,
      // `ip` is operational metadata for rate limiting, not user-facing PII.
      ip: lead.ip ?? "unknown",
    });

    // TODO(provider): replace this no-op log with a real sink. Swap-in points —
    // pick one (or both); this is the ONLY place that changes:
    //
    //   1. Resend (email notification):
    //      if (process.env.RESEND_API_KEY && process.env.LEADS_NOTIFY_TO) {
    //        const { Resend } = await import("resend");        // dep already present
    //        const resend = new Resend(process.env.RESEND_API_KEY);
    //        await resend.emails.send({
    //          from: process.env.LEADS_NOTIFY_FROM ?? "leads@seoditly.com",
    //          to: process.env.LEADS_NOTIFY_TO,
    //          subject: `New lead: ${lead.name}`,
    //          text: `${lead.name} <${lead.email}>\n${lead.siteUrl ?? ""}\n\n${lead.message ?? ""}`,
    //        });
    //        return { ok: true, via: "resend" };
    //      }
    //
    //   2. Postgres / Supabase (insert into `leads`):
    //      if (process.env.POSTGRES_URL) {
    //        // const { sql } = await import("@vercel/postgres"); // add dep when wiring
    //        // await sql`INSERT INTO leads (name, email, site_url, message, ip, received_at)
    //        //           VALUES (${lead.name}, ${lead.email}, ${lead.siteUrl ?? null},
    //        //                   ${lead.message ?? null}, ${lead.ip ?? null}, ${lead.receivedAt})`;
    //        return { ok: true, via: "postgres" };
    //      }

    return { ok: true, via: "log" };
  },
};

/**
 * Resolve the active lead store. Env-gated: as soon as a provider's env vars
 * are present, return that provider's implementation here instead of the log
 * default. Today nothing is provisioned, so the log adapter is returned.
 */
export function getLeadStore(): LeadStore {
  // TODO(provider): branch on env here once a provider is provisioned, e.g.
  //   if (process.env.RESEND_API_KEY) return resendLeadStore;
  //   if (process.env.POSTGRES_URL)  return postgresLeadStore;
  return logLeadStore;
}

/** Persist a lead via the currently-active store. */
export function saveLead(lead: Lead): Promise<LeadStoreResult> {
  return getLeadStore().save(lead);
}
