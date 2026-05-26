/**
 * rfiNudge.js — pre-drafted RFI follow-up ("nudge") email.
 *
 * Pure, deterministic generator. It ONLY builds draft text (subject + body) and
 * suggests a recipient when one is obvious. It NEVER sends anything — sending is
 * always an explicit human action through the email-send pipeline. This keeps
 * the AI/automation contract intact: drafts are staged for human review and an
 * explicit send, never auto-dispatched.
 */

import { daysSince, daysUntil } from "@/lib/dateMath";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** Extract email addresses from a free-text field (e.g. distribution_list). */
export function parseEmails(raw) {
  if (!raw) return [];
  const matches = String(raw).match(EMAIL_RE);
  if (!matches) return [];
  // de-dupe, preserve order
  const seen = new Set();
  const out = [];
  for (const m of matches) {
    const e = m.trim();
    const key = e.toLowerCase();
    if (!seen.has(key)) { seen.add(key); out.push(e); }
  }
  return out;
}

function rfiRef(rfi) {
  const num = rfi.rfi_number ? String(rfi.rfi_number).replace(/^RFI[\s#-]*/i, "").trim() : "";
  return num ? `RFI ${num}` : "RFI";
}

/**
 * Build a nudge draft for an RFI.
 *
 * @param {object} rfi
 * @param {{ fromName?: string }} [options]
 * @returns {{ subject: string, body: string, suggestedTo: string[] }}
 */
export function buildRfiNudge(rfi, options = {}) {
  if (!rfi) return { subject: "", body: "", suggestedTo: [] };

  const ref = rfiRef(rfi);
  const title = rfi.title || rfi.subject || "(no subject)";
  const openDays = daysSince(rfi.submitted_date || rfi.created_date || rfi.created_at);
  const bic = (rfi.ball_in_court || "").trim() || "your team";
  const dwg = rfi.drawing_reference ? ` (ref: ${rfi.drawing_reference})` : "";

  let dueLine;
  if (rfi.date_required) {
    const dueIn = daysUntil(rfi.date_required);
    dueLine = dueIn < 0
      ? `This RFI was due ${Math.abs(dueIn)} day(s) ago (${rfi.date_required}) and remains open.`
      : `A response is requested by ${rfi.date_required}.`;
  } else {
    dueLine = `This RFI has been open ${openDays} day(s) and a response is requested.`;
  }

  const subject = `Follow-up: ${ref} — ${title}`;

  const body = [
    "Hello,",
    "",
    `This is a follow-up on ${ref}: "${title}"${dwg}.`,
    dueLine,
    `Ball in court: ${bic}.`,
    rfi.question ? `\nQuestion:\n${rfi.question}` : null,
    "",
    "A timely response keeps downstream detailing, fabrication, and erection on schedule. Please advise on the status.",
    "",
    "Thank you,",
    (options.fromName || "").trim() || "SteelBuild Pro",
  ].filter((line) => line !== null).join("\n");

  return { subject, body, suggestedTo: parseEmails(rfi.distribution_list) };
}
