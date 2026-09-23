// Pure sending-identity and send-quota policy for email-send (SEC-N1).
// No Deno-specific imports, so the decisions are exercised by Vitest.
//
// The rule: the SERVER decides which address a request may send as. A tenant
// controls email_accounts (who can be chosen for a project) but not
// email_verified_senders (which addresses the platform has verified for that
// org) and not EMAIL_SEND_ALLOWED_DOMAINS (which domains the platform's
// provider account may send for). All three must agree.

import { isValidEmail } from "./recipients.ts";

export interface SenderAccount {
  email_address?: string | null;
  display_name?: string | null;
}

export type SenderDecision =
  | { ok: true; email: string; name: string }
  | { ok: false; status: 400 | 403 | 503; error: string };

export interface ResolveSenderInput {
  /** Caller-supplied from address (untrusted). */
  requestedFrom?: string | null;
  /** Caller-supplied display name (untrusted). */
  requestedName?: string | null;
  /** The project's ACTIVE email_accounts rows, in a stable order. */
  activeAccounts: SenderAccount[];
  /** Addresses in email_verified_senders for the project's org (not revoked). */
  verifiedAddresses: Iterable<string>;
  /** Parsed EMAIL_SEND_ALLOWED_DOMAINS. Empty = sending not configured. */
  allowedDomains: ReadonlySet<string>;
}

const DEFAULT_SEND_HOURLY_LIMIT = 100;

const NOT_VERIFIED =
  "This address has not been verified for sending. A workspace admin must ask SteelBuild Pro support to verify it.";

function key(address: unknown): string {
  return typeof address === "string" ? address.trim().toLowerCase() : "";
}

/** Lower-cased domain of a well-formed address, or null. */
export function emailDomain(address: unknown): string | null {
  if (!isValidEmail(address)) return null;
  const trimmed = (address as string).trim();
  const at = trimmed.indexOf("@");
  if (at <= 0 || at !== trimmed.lastIndexOf("@")) return null;
  const domain = trimmed.slice(at + 1).toLowerCase();
  return domain || null;
}

/** "a.com, B.com ,@c.com" -> {"a.com","b.com","c.com"}. Unset/blank -> empty. */
export function parseAllowedDomains(raw: string | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const part of (raw ?? "").split(",")) {
    const domain = part.trim().replace(/^@/, "").toLowerCase();
    if (domain) out.add(domain);
  }
  return out;
}

/**
 * Build a From header that cannot carry a second address. The display name is
 * tenant-controlled; a name like `x <ceo@verified-domain>` would otherwise put
 * two angle-addresses in one header and leave the provider to pick one.
 */
export function formatFromHeader(name: string, email: string): string {
  const clean = (name ?? "")
    .replace(/[\u0000-\u001f\u007f<>"\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return clean ? `"${clean}" <${email}>` : email;
}

export function resolveSender(input: ResolveSenderInput): SenderDecision {
  if (input.allowedDomains.size === 0) {
    return { ok: false, status: 503, error: "Outbound email is not configured for this environment." };
  }

  const verified = new Set<string>();
  for (const address of input.verifiedAddresses) {
    const k = key(address);
    if (k) verified.add(k);
  }

  const accounts = input.activeAccounts.filter((a) => isValidEmail(a?.email_address));
  const sendable = (a: SenderAccount): boolean => {
    const domain = emailDomain(a.email_address);
    return !!domain && input.allowedDomains.has(domain) && verified.has(key(a.email_address));
  };

  const requested = key(input.requestedFrom);
  let chosen: SenderAccount | undefined;

  if (requested) {
    chosen = accounts.find((a) => key(a.email_address) === requested);
    if (!chosen) {
      return { ok: false, status: 403, error: "from_email is not an active sending account for this project" };
    }
    if (!verified.has(requested)) return { ok: false, status: 403, error: NOT_VERIFIED };
    const domain = emailDomain(chosen.email_address);
    if (!domain || !input.allowedDomains.has(domain)) {
      return { ok: false, status: 403, error: "This address's domain is not enabled for sending on this platform." };
    }
  } else {
    if (accounts.length === 0) {
      return {
        ok: false,
        status: 400,
        error: "No from_email provided and no active email account configured for this project",
      };
    }
    chosen = accounts.find(sendable);
    if (!chosen) {
      return {
        ok: false,
        status: 403,
        error: "None of this project's email accounts has been verified for sending. A workspace admin must ask SteelBuild Pro support to verify one.",
      };
    }
  }

  const email = (chosen.email_address as string).trim();
  const requestedName = typeof input.requestedName === "string" ? input.requestedName.trim() : "";
  return { ok: true, email, name: requestedName || (chosen.display_name ?? "").trim() };
}

/**
 * EMAIL_SEND_HOURLY_LIMIT: unset/blank -> default; "0" -> disabled; a positive
 * integer -> that cap. Anything else (a typo) keeps the default instead of
 * silently disabling the cap.
 */
export function parseHourlyLimit(raw: string | null | undefined): number {
  if (raw === undefined || raw === null || raw.trim() === "") return DEFAULT_SEND_HOURLY_LIMIT;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return DEFAULT_SEND_HOURLY_LIMIT;
  return Number(trimmed);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ReservationDecision =
  | { ok: true; eventId: string }
  | { ok: false; status: 429 | 503; error: string; retryAfterSeconds: number };

/**
 * Interpret the body of POST /rest/v1/rpc/email_send_reserve. Fails closed on
 * anything unreadable. The configured cap is never echoed to the caller, so it
 * cannot be read off the response and paced just under.
 */
export function interpretReservation(payload: unknown): ReservationDecision {
  const row = Array.isArray(payload) ? payload[0] : payload;
  const unavailable: ReservationDecision = {
    ok: false,
    status: 503,
    error: "Send limits can't be verified right now. Please retry shortly.",
    retryAfterSeconds: 30,
  };
  if (!row || typeof row !== "object") return unavailable;
  const { allowed, event_id: eventId } = row as { allowed?: unknown; event_id?: unknown };
  if (allowed === false) {
    return { ok: false, status: 429, error: "Hourly send limit reached. Please try again later.", retryAfterSeconds: 900 };
  }
  if (allowed === true && typeof eventId === "string" && UUID_RE.test(eventId)) {
    return { ok: true, eventId };
  }
  return unavailable;
}
