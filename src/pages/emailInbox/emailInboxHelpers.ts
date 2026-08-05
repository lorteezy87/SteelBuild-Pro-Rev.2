/**
 * Pure helpers for Email Inbox page (filter, stats, labels, selection).
 */
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

export function nextSelectedIdsForToggle(
  selectedIds: Set<string>,
  id: string,
): Set<string> {
  const next = new Set(selectedIds);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function findMessageById<T extends { id?: string | null }>(
  messages: T[],
  selectedId: string | null | undefined,
): T | null {
  if (!selectedId) return null;
  return (messages || []).find((m) => m.id === selectedId) || null;
}
