/**
 * Pure helpers for Email Inbox page (filter, stats, labels, selection).
 */
import { findById } from "@/pages/shared/findById";
import { toggleSelectionId } from "@/pages/shared/selectionHelpers";
import { DEFAULT_LABELS, FOLDERS } from "./constants";
import type { EmailAttachment, EmailMessage } from "./types";

export function groupAttachmentsByMessage(
  attachments: EmailAttachment[],
): Record<string, EmailAttachment[]> {
  const map: Record<string, EmailAttachment[]> = {};
  for (const att of attachments || []) {
    const messageId = att.message_id;
    if (messageId == null) continue;
    const key = String(messageId);
    if (!map[key]) map[key] = [];
    map[key].push(att);
  }
  return map;
}

/** Collect default + message labels, sorted. */
export function collectAllLabels(messages: EmailMessage[]): string[] {
  const labelSet = new Set(DEFAULT_LABELS);
  for (const m of messages || []) {
    const labels = Array.isArray(m.labels) ? m.labels : [];
    labels.forEach((l) => labelSet.add(l));
  }
  return Array.from(labelSet).sort();
}

export function filterMessages(
  messages: EmailMessage[],
  opts: {
    activeFolder: string;
    activeLabelFilter: string | null;
    search: string;
  },
): EmailMessage[] {
  const folder = FOLDERS.find((f) => f.id === opts.activeFolder) || FOLDERS[0];
  let items = (messages || []).filter(folder.filter);

  if (opts.activeLabelFilter) {
    const label = opts.activeLabelFilter;
    items = items.filter((m) => {
      const labels = Array.isArray(m.labels) ? m.labels : [];
      return labels.includes(label);
    });
  }

  if (opts.search.trim()) {
    const q = opts.search.toLowerCase();
    items = items.filter(
      (m) =>
        (m.subject || "").toLowerCase().includes(q)
        || (m.sender_email || "").toLowerCase().includes(q)
        || (m.sender_name || "").toLowerCase().includes(q),
    );
  }
  return items;
}

export function computeEmailStats(messages: EmailMessage[]) {
  const list = messages || [];
  const total = list.filter((m) => m.import_status === "pending" && m.direction !== "outbound").length;
  const unread = list.filter(
    (m) => !m.is_read && m.import_status === "pending" && m.direction !== "outbound",
  ).length;
  const starred = list.filter(
    (m) => m.is_starred && m.import_status !== "archived" && m.import_status !== "rejected",
  ).length;
  const pending = list.filter((m) => m.import_status === "pending" && m.direction !== "outbound").length;
  const sent = list.filter((m) => m.direction === "outbound").length;
  return { total, unread, starred, pending, sent };
}

export function computeFolderCounts(messages: EmailMessage[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of FOLDERS) {
    counts[f.id] = (messages || []).filter(f.filter).length;
  }
  return counts;
}

export function countMessagesWithLabel(messages: EmailMessage[], label: string): number {
  return (messages || []).filter((m) => {
    const labels = Array.isArray(m.labels) ? m.labels : [];
    return labels.includes(label);
  }).length;
}

export function labelsWithAdded(current: unknown, label: string): string[] | null {
  const list = Array.isArray(current) ? (current as string[]) : [];
  if (list.includes(label)) return null;
  return [...list, label];
}

export function labelsWithout(current: unknown, label: string): string[] {
  const list = Array.isArray(current) ? (current as string[]) : [];
  return list.filter((l) => l !== label);
}

export function allFilteredSelected(
  filtered: Array<{ id: string }>,
  selectedIds: Set<string>,
): boolean {
  return filtered.length > 0 && filtered.every((m) => selectedIds.has(m.id));
}

export function nextSelectedIdsForToggleAll(
  filtered: Array<{ id: string }>,
  selectedIds: Set<string>,
): Set<string> {
  if (allFilteredSelected(filtered, selectedIds)) return new Set();
  return new Set(filtered.map((m) => m.id));
}

/** @deprecated Prefer toggleSelectionId from shared selectionHelpers. */
export function nextSelectedIdsForToggle(
  selectedIds: Set<string>,
  id: string,
): Set<string> {
  return toggleSelectionId(selectedIds, id);
}

/** @deprecated Prefer findById from shared. */
export function findMessageById<T extends { id?: string | null }>(
  messages: T[],
  selectedId: string | null | undefined,
): T | null {
  return findById(messages, selectedId);
}

/**
 * Link-to-existing modal search: match subject/title/description/question,
 * cap at `limit` (default 20). Empty query → first `limit` records.
 */
export function filterLinkSearchRecords<
  T extends {
    subject?: string | null;
    title?: string | null;
    description?: string | null;
    question?: string | null;
  },
>(records: T[] | null | undefined, searchQuery: string, limit = 20): T[] {
  const list = records || [];
  if (!searchQuery.trim()) return list.slice(0, limit);
  const q = searchQuery.toLowerCase();
  return list
    .filter(
      (r) =>
        (r.subject || r.title || "").toLowerCase().includes(q)
        || (r.description || r.question || "").toLowerCase().includes(q),
    )
    .slice(0, limit);
}

/** Safe JSON parse for string metadata blobs. */
export function parseJsonSafe(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** Outbound list-row label: first recipient (+N) or sender for inbound. */
export function outboundDisplayName(message: {
  direction?: string | null;
  recipients?: unknown;
  sender_name?: string | null;
  sender_email?: string | null;
}): string {
  if (message.direction === "outbound") {
    try {
      const recips =
        typeof message.recipients === "string"
          ? JSON.parse(message.recipients)
          : message.recipients || [];
      const list = Array.isArray(recips) ? recips : [];
      return list.length > 0
        ? `To: ${list[0]}${list.length > 1 ? ` +${list.length - 1}` : ""}`
        : "To: (unknown)";
    } catch {
      return "To: (unknown)";
    }
  }
  return message.sender_name || message.sender_email || "Unknown";
}

/** Lightweight HTML → text scrub for list previews. */
export function scrubHtmlToPreviewText(text: string): string {
  let t = text || "";
  if (/^\s*<|<html|<body|<div|<table/i.test(t)) {
    t = t
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&/gi, "&")
      .replace(/</gi, "<")
      .replace(/>/gi, ">")
      .replace(/"/gi, '"')
      .replace(/&#39;/gi, "'");
  }
  return t.replace(/\s+/g, " ").trim().slice(0, 120);
}

/** List-row body preview + optional AI summary from parsed_metadata.extracted. */
export function messageBodyPreview(message: {
  body_text?: string | null;
  parsed_metadata?: unknown;
}): { bodyPreview: string; aiSummary: string | null } {
  let summary: string | null = null;
  if (message.parsed_metadata) {
    const meta = parseJsonSafe(message.parsed_metadata) as { extracted?: { summary?: string } } | null;
    if (meta?.extracted?.summary) summary = meta.extracted.summary;
  }
  const preview = scrubHtmlToPreviewText(message.body_text || "");
  return { bodyPreview: preview, aiSummary: summary };
}

/** Full plain-text fallback for body panel (structure-preserving newlines). */
export function stripHtmlToPlainText(html: string): string {
  return (html || "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&/gi, "&")
    .replace(/</gi, "<")
    .replace(/>/gi, ">")
    .replace(/"/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function resolveEmailPlainText(message: {
  body_text?: string | null;
  body_html?: string | null;
}): string {
  const rawHtml =
    message.body_html
    || (message.body_text && /^\s*<|<html|<body|<div|<table|<p[\s>]/i.test(message.body_text)
      ? message.body_text
      : null);
  if (!rawHtml && message.body_text) return message.body_text;
  if (rawHtml && !message.body_text) return stripHtmlToPlainText(rawHtml);
  return message.body_text || "";
}

/**
 * Extracted AI fields for CreateRecordModal / ExtractedFieldsStrip.
 * When `requireHasData` is true, return null unless at least one field is present
 * (strip UI). Modal only needs the extracted object (or null).
 */
export function parseExtractedFields(
  metadata: unknown,
  opts: { requireHasData?: boolean } = {},
): Record<string, any> | null {
  if (!metadata) return null;
  const meta = parseJsonSafe(metadata) as { extracted?: Record<string, any> } | null;
  if (!meta?.extracted) return null;
  const e = meta.extracted;
  if (!opts.requireHasData) return e;
  const hasData =
    e.summary
    || e.rfi_number
    || e.submittal_number
    || (e.drawing_refs?.length > 0)
    || e.due_date
    || e.responsible_party
    || e.priority
    || (e.related_entities?.length > 0)
    || e.action_required;
  return hasData ? e : null;
}
