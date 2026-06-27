/**
 * emailIntegration.js
 *
 * Service layer for the Email integration. Handles:
 *   - Email parsing (subject, sender, body, attachments)
 *   - Deterministic classification (RFI / Submittal / Action Item / Document)
 *   - Review queue CRUD via base44 entity wrappers
 *   - Record creation from approved queue items
 *
 * Classification is entirely deterministic (keyword + pattern matching).
 * No AI calls — keeps the feature working at zero credits and avoids
 * non-deterministic classification drift.
 */

import { base44 } from "@/api/base44Client";

// ── Classification keywords ────────────────────────────────────────────────

const RFI_KEYWORDS = [
  "rfi", "request for information", "clarification needed",
  "question regarding", "design clarification", "detail question",
];

const SUBMITTAL_KEYWORDS = [
  "submittal", "shop drawing", "material submission", "product data",
  "sample submission", "shop detail", "erection drawing",
  "fabrication drawing", "approval required",
];

const ACTION_ITEM_KEYWORDS = [
  "action required", "action item", "follow up", "follow-up",
  "todo", "to do", "task", "deadline", "due by", "please complete",
  "urgent action", "immediately", "asap",
];

const DOCUMENT_KEYWORDS = [
  "spec", "specification", "drawing set", "plan set", "revision",
  "bulletin", "addendum", "change notice", "transmittal",
  "contract document", "attachment", "enclosed",
];

// ── Classification logic ───────────────────────────────────────────────────

/**
 * Score a text body against a keyword list. Returns a 0–1 confidence score
 * based on the fraction of keywords found and their density. The scoring is
 * intentionally simple and transparent — no ML, no LLM.
 */
function scoreKeywords(text, keywords) {
  if (!text) return 0;
  const lower = text.toLowerCase();
  let hits = 0;
  for (const kw of keywords) {
    if (lower.includes(kw)) hits++;
  }
  if (hits === 0) return 0;
  // Base score: fraction of keyword list matched, weighted so a single
  // strong hit (e.g. "rfi" in subject) still scores ~0.4+
  return Math.min(1, (hits / keywords.length) * 2 + 0.2);
}

/**
 * Classify an email by scanning subject + body against keyword lists.
 * Returns { type, confidence, reason }.
 */
export function classifyEmail({ subject = "", bodyText = "" }) {
  const combinedText = `${subject} ${bodyText}`;

  const scores = [
    { type: "RFI",         score: scoreKeywords(combinedText, RFI_KEYWORDS) },
    { type: "Submittal",   score: scoreKeywords(combinedText, SUBMITTAL_KEYWORDS) },
    { type: "Action Item", score: scoreKeywords(combinedText, ACTION_ITEM_KEYWORDS) },
    { type: "Document",    score: scoreKeywords(combinedText, DOCUMENT_KEYWORDS) },
  ];

  // Subject-line keywords carry extra weight
  const subjectScores = [
    { type: "RFI",         score: scoreKeywords(subject, RFI_KEYWORDS) * 0.3 },
    { type: "Submittal",   score: scoreKeywords(subject, SUBMITTAL_KEYWORDS) * 0.3 },
    { type: "Action Item", score: scoreKeywords(subject, ACTION_ITEM_KEYWORDS) * 0.3 },
    { type: "Document",    score: scoreKeywords(subject, DOCUMENT_KEYWORDS) * 0.3 },
  ];

  // Merge scores
  const merged = scores.map((s, i) => ({
    type: s.type,
    score: Math.min(1, s.score + subjectScores[i].score),
  }));

  // Sort descending
  merged.sort((a, b) => b.score - a.score);

  const best = merged[0];
  if (best.score < 0.2) {
    return { type: "Unknown", confidence: 0, reason: "No strong keyword matches found" };
  }

  const reasons = [];
  if (subject.toLowerCase().includes(best.type.toLowerCase())) {
    reasons.push(`"${best.type}" found in subject line`);
  }
  reasons.push(`Keyword match score: ${(best.score * 100).toFixed(0)}%`);

  return {
    type: best.type,
    confidence: Math.round(best.score * 100) / 100,
    reason: reasons.join(". "),
  };
}

// ── Email parsing ──────────────────────────────────────────────────────────

/**
 * Parse a raw email object (as would arrive from a mailbox API or manual
 * paste) into the normalised shape for the intake queue.
 *
 * This is a deterministic transform — no network calls.
 */
export function parseEmail(raw) {
  const subject = (raw.subject || "").trim();
  const senderAddress = (raw.from?.address || raw.sender_address || raw.from || "").trim();
  const senderName = (raw.from?.name || raw.sender_name || "").trim() || null;
  const bodyText = (raw.body?.text || raw.body_text || raw.text || "").trim();
  const bodyHtml = (raw.body?.html || raw.body_html || raw.html || "").trim();
  const receivedAt = raw.date || raw.received_at || new Date().toISOString();
  const messageId = (raw.messageId || raw.message_id || raw.source_message_id || "").trim();

  // Normalise attachments
  const rawAttachments = raw.attachments || [];
  const attachments = rawAttachments.map((att) => ({
    filename: att.filename || att.name || "unnamed",
    size_bytes: att.size || att.size_bytes || 0,
    content_type: att.contentType || att.content_type || "application/octet-stream",
    storage_path: att.storage_path || null,
    hash: att.hash || att.checksum || null,
  }));

  return {
    subject,
    sender_address: senderAddress,
    sender_name: senderName,
    body_text: bodyText,
    body_html: bodyHtml,
    received_at: receivedAt,
    source_message_id: messageId,
    attachments,
  };
}

// ── Queue operations ───────────────────────────────────────────────────────

/**
 * Stage a parsed email into the review queue. Runs classification and
 * inserts a Pending row.
 */
export async function stageEmail({ projectId, sourceMailbox, rawEmail }) {
  const parsed = parseEmail(rawEmail);
  const classification = classifyEmail({
    subject: parsed.subject,
    bodyText: parsed.body_text,
  });

  return base44.entities.EmailIntakeQueue.create({
    project_id: projectId,
    source_mailbox: sourceMailbox,
    source_message_id: parsed.source_message_id,
    subject: parsed.subject,
    sender_address: parsed.sender_address,
    sender_name: parsed.sender_name,
    received_at: parsed.received_at,
    body_text: parsed.body_text,
    body_html: parsed.body_html,
    detected_type: classification.type,
    confidence: classification.confidence,
    classification_reason: classification.reason,
    attachments: parsed.attachments,
    status: "Pending",
  });
}

/**
 * Approve a queued email — creates the target record and marks the
 * queue item as Approved.
 *
 * @param {string} queueItemId  — the email_intake_queue row id
 * @param {string} recordType   — "RFI" | "Submittal" | "Action Item" | "Document"
 * @param {string} userId       — the reviewing user's id
 * @param {string} [notes]      — optional review notes
 */
export async function approveQueueItem({ queueItemId, recordType, userId, notes }) {
  const item = await base44.entities.EmailIntakeQueue.get(queueItemId);
  if (!item) throw new Error("Queue item not found");

  let createdRecord = null;
  let createdRecordType = recordType;

  const baseFields = {
    project_id: item.project_id,
  };

  if (recordType === "RFI") {
    createdRecord = await base44.entities.RFI.create({
      ...baseFields,
      title: item.subject,
      description: `${item.body_text || ""}\n\n---\nSource: Email from ${item.sender_name || item.sender_address} (${item.sender_address})`,
      status: "Open",
      submitted_by: item.sender_name || item.sender_address,
      source_message_id: item.source_message_id,
    });
  } else if (recordType === "Submittal") {
    createdRecord = await base44.entities.Submittal.create({
      ...baseFields,
      title: item.subject,
      description: `${item.body_text || ""}\n\n---\nSource: Email from ${item.sender_name || item.sender_address}`,
      status: "Open",
      source_message_id: item.source_message_id,
    });
  } else if (recordType === "Action Item") {
    createdRecord = await base44.entities.ActionItem.create({
      ...baseFields,
      title: item.subject,
      description: `${item.body_text || ""}\n\n---\nSource: Email from ${item.sender_name || item.sender_address}`,
      status: "Open",
      priority: "Medium",
      source_message_id: item.source_message_id,
    });
  } else if (recordType === "Document") {
    createdRecord = await base44.entities.Document.create({
      ...baseFields,
      title: item.subject,
      description: `Filed from email. Sender: ${item.sender_name || item.sender_address}`,
      source_message_id: item.source_message_id,
    });
  }

  // Mark queue item as approved
  await base44.entities.EmailIntakeQueue.update(queueItemId, {
    status: "Approved",
    reviewed_by: userId,
    reviewed_at: new Date().toISOString(),
    review_notes: notes || null,
    detected_type: recordType,
    created_record_type: createdRecordType,
    created_record_id: createdRecord?.id || null,
  });

  return { queueItem: item, createdRecord };
}

/**
 * Reject a queued email — marks it as Rejected without creating any record.
 */
export async function rejectQueueItem({ queueItemId, userId, notes }) {
  return base44.entities.EmailIntakeQueue.update(queueItemId, {
    status: "Rejected",
    reviewed_by: userId,
    reviewed_at: new Date().toISOString(),
    review_notes: notes || null,
  });
}

/**
 * Reassign the detected type on a queue item without approving it.
 */
export async function reassignType({ queueItemId, newType }) {
  return base44.entities.EmailIntakeQueue.update(queueItemId, {
    detected_type: newType,
  });
}

// ── Settings operations ────────────────────────────────────────────────────

export async function getProjectEmailSettings(projectId) {
  return base44.entities.EmailIntegrationSetting.filter({ project_id: projectId });
}

export async function upsertEmailSetting({ projectId, mailboxAddress, provider, isActive, autoClassify, defaultType, assignmentRules }) {
  // Check for existing setting with this mailbox
  const existing = await base44.entities.EmailIntegrationSetting.filter({
    project_id: projectId,
    mailbox_address: mailboxAddress,
  });

  const data = {
    project_id: projectId,
    mailbox_address: mailboxAddress,
    provider: provider || "outlook",
    is_active: isActive !== false,
    auto_classify: autoClassify !== false,
    default_type: defaultType || "Unknown",
    assignment_rules: assignmentRules || [],
  };

  if (existing.length > 0) {
    return base44.entities.EmailIntegrationSetting.update(existing[0].id, data);
  }
  return base44.entities.EmailIntegrationSetting.create(data);
}

export async function deleteEmailSetting(settingId) {
  return base44.entities.EmailIntegrationSetting.delete(settingId);
}

// ── Constants ──────────────────────────────────────────────────────────────

export const EMAIL_RECORD_TYPES = ["RFI", "Submittal", "Action Item", "Document", "Unknown"];
export const EMAIL_QUEUE_STATUSES = ["Pending", "Approved", "Rejected", "Processing", "Error"];
export const EMAIL_PROVIDERS = [
  { value: "outlook", label: "Outlook / Exchange" },
  { value: "gmail",   label: "Gmail / Google Workspace" },
  { value: "imap",    label: "IMAP (Generic)" },
];
