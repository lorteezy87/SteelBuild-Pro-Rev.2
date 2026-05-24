/**
 * emailSendService.ts — Client service for sending emails through the
 * email-send Edge Function.
 *
 * Usage:
 *   import { sendEmail, buildReplyDefaults } from '@/services/emailSendService';
 *
 *   // Compose new
 *   await sendEmail({ project_id, to: ['a@b.com'], subject: 'Hello', body_text: '...' });
 *
 *   // Reply
 *   const defaults = buildReplyDefaults(originalMessage, 'reply'); // or 'reply_all'
 *   await sendEmail({ project_id, ...defaults, body_text: userTypedReply });
 */

import { supabase } from "@/lib/supabase";

export interface EmailAttachment {
  filename: string;
  content_type?: string;
  content_base64: string;
  size_bytes?: number;
}

export interface SendEmailParams {
  project_id: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body_text: string;
  body_html?: string;
  reply_to_message_id?: string;
  in_reply_to_external_id?: string | null;
  thread_id?: string | null;
  from_email?: string;
  from_name?: string;
  attachments?: EmailAttachment[];
}

export interface SendEmailResult {
  success: boolean;
  message_id?: string;
  provider_message_id?: string;
  error?: string;
}

export interface ReplyDefaults {
  to: string[];
  cc: string[];
  subject: string;
  in_reply_to_external_id: string | null;
  thread_id: string | null;
  reply_to_message_id: any;
  quoted_body: string;
}

const EDGE_FN_PATH = "/functions/v1/email-send";

/**
 * Send an email through the email-send Edge Function.
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { success: false, error: "Not authenticated" };
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    return { success: false, error: "VITE_SUPABASE_URL not configured" };
  }

  try {
    const resp = await fetch(`${supabaseUrl}${EDGE_FN_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(params),
    });

    const data = await resp.json();

    if (!resp.ok || !data.success) {
      return {
        success: false,
        error: data.error || `Send failed (${resp.status})`,
      };
    }

    return {
      success: true,
      message_id: data.message_id,
      provider_message_id: data.provider_message_id,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Network error sending email",
    };
  }
}

/**
 * Build default field values for a reply to an existing message.
 */
export function buildReplyDefaults(
  originalMessage: Record<string, any>,
  mode: "reply" | "reply_all" = "reply",
  currentUserEmail = "",
): ReplyDefaults {
  const msg = originalMessage;

  // To: reply goes to sender
  const to = msg.sender_email ? [msg.sender_email] : [];

  // CC: for reply_all, include original recipients + CC minus current user and sender
  let cc: string[] = [];
  if (mode === "reply_all") {
    const allRecipients = new Set<string>();

    // Parse recipients
    const recipients = parseEmailList(msg.recipients);
    recipients.forEach((r) => allRecipients.add(r.toLowerCase()));

    // Parse CC
    const ccList = parseEmailList(msg.cc);
    ccList.forEach((r) => allRecipients.add(r.toLowerCase()));

    // Remove sender (already in To) and current user
    const senderLower = (msg.sender_email || "").toLowerCase();
    const currentLower = currentUserEmail.toLowerCase();
    allRecipients.delete(senderLower);
    if (currentLower) allRecipients.delete(currentLower);

    cc = Array.from(allRecipients);
  }

  // Subject: prepend Re: if not already there
  let subject = msg.subject || "";
  if (!/^re:/i.test(subject.trim())) {
    subject = `Re: ${subject}`;
  }

  // Thread ID: reuse existing or create from external_id
  const threadId = msg.thread_id || msg.external_id || null;

  // Quote the original body
  const senderDisplay = msg.sender_name || msg.sender_email || "Unknown";
  const dateStr = msg.received_at
    ? new Date(msg.received_at).toLocaleString("en-US", {
        weekday: "short", month: "short", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit",
      })
    : "";

  const originalBody = (msg.body_text || "").trim();
  const quotedLines = originalBody
    .split("\n")
    .map((line: string) => `> ${line}`)
    .join("\n");

  const quotedBody = `\n\nOn ${dateStr}, ${senderDisplay} wrote:\n${quotedLines}`;

  return {
    to,
    cc,
    subject,
    in_reply_to_external_id: msg.external_id || null,
    thread_id: threadId,
    reply_to_message_id: msg.id,
    quoted_body: quotedBody,
  };
}

/**
 * Parse an email list field from email_messages.
 * Could be a JSON string array, a JSON stringified array, or a comma-separated string.
 */
function parseEmailList(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    // Try JSON parse first
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Fall through to comma split
    }
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}
