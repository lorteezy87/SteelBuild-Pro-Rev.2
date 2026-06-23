/**
 * EmailInbox.tsx — Professional split-pane email client for project emails.
 *
 * Three-column layout:
 *   Left sidebar  (~200px) — folder/label navigation
 *   Email list    (~380px) — compact rows with checkbox, star, sender, preview
 *   Detail pane   (flex)   — full email view with HTML rendering + actions
 *
 * Features:
 *   - Read/unread tracking (auto-mark on select)
 *   - Star/flag toggle inline
 *   - Label system with colored chips + custom labels
 *   - Bulk actions via checkbox selection
 *   - Approve & Create (RFI/Submittal/Action Item), Link, Reject, Archive
 *   - Sandboxed iframe for HTML body rendering
 *   - Responsive: hides detail pane on narrow screens, uses modal instead
 *
 * Data flows through EmailMessage entity + TanStack Query.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentType, PropsWithChildren } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProjectId } from "@/hooks/useProjectId";
import { toast } from "sonner";
import { KpiTile as KpiTileRaw, Modal as ModalRaw, BulkActionBar as BulkActionBarRaw } from "@/components/design-system";
import {
  Archive, Clock, Eye, Inbox, Mail, PenSquare, Search, Send, Settings, Star, XCircle,
} from "lucide-react";
import { invalidateEntity } from "@/services/cacheRegistry";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useAppSecurity } from "@/components/shared/useAppSecurity";
import { DEFAULT_LABELS, FOLDERS, getLabelColor, useWindowWidth } from "./emailInbox/constants";
import { EmailBodyContent, EmailDetail, EmailRow, MobileDetailFooter } from "./emailInbox/components";
import { ComposeEmailModal, CreateRecordModal, LinkToExistingModal, ReplyEmailModal } from "./emailInbox/modals";
import type { EmailAttachment, EmailMessage, ReplyMode } from "./emailInbox/types";

// design-system primitives are still .jsx — type them permissively at the
// boundary until the design system is converted. Removable once it is typed.
type AnyProps = PropsWithChildren<Record<string, unknown>>;
const KpiTile = KpiTileRaw as unknown as ComponentType<AnyProps>;
const Modal = ModalRaw as unknown as ComponentType<AnyProps>;
const BulkActionBar = BulkActionBarRaw as unknown as ComponentType<AnyProps>;

export default function EmailInbox() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const windowWidth = useWindowWidth();
  const isNarrow = windowWidth < 900;
  const { user } = useAppSecurity();
  const currentUserEmail = user?.email || "";

  // ── State ──────────────────────────────────────────────────────────
  const [activeFolder, setActiveFolder] = useState("inbox");
  const [activeLabelFilter, setActiveLabelFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [createModal, setCreateModal] = useState<EmailMessage | null>(null);
  const [linkModal, setLinkModal] = useState<EmailMessage | null>(null);
  const [labelDropdownId, setLabelDropdownId] = useState<string | null>(null);
  const [mobileDetailMsg, setMobileDetailMsg] = useState<EmailMessage | null>(null);
  const [composeModal, setComposeModal] = useState(false);
  const [replyState, setReplyState] = useState<{ mode: ReplyMode; message: EmailMessage } | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────
  // the generated generated row types lag the live schema (missing labels/direction/
  // is_read/etc.), so cast to the local EmailMessage/EmailAttachment shapes.
  const { data: messagesData = [], isLoading, error } = useQuery({
    queryKey: ["email-messages", projectId],
    queryFn: () => entities.EmailMessage.filter({ project_id: projectId }, "-received_at"),
    enabled: !!projectId,
  });
  const messages = messagesData as unknown as EmailMessage[];

  const { data: attachmentsData = [] } = useQuery({
    queryKey: ["email-attachments", projectId],
    queryFn: () => entities.EmailAttachment.filter({ project_id: projectId }),
    enabled: !!projectId,
  });
  const attachments = attachmentsData as unknown as EmailAttachment[];

  // Live updates — new webhook emails appear without manual refresh
  useRealtimeInvalidation("email_messages", projectId, [
    ["email-messages", projectId],
  ]);
  useRealtimeInvalidation("email_attachments", projectId, [
    ["email-attachments", projectId],
  ]);

  const attachmentsByMessage = useMemo(() => {
    const map: Record<string, any[]> = {};
    attachments.forEach((att) => {
      const messageId = att.message_id;
      if (messageId == null) return;
      if (!map[messageId]) map[messageId] = [];
      map[messageId].push(att);
    });
    return map;
  }, [attachments]);

  // ── Mutations ──────────────────────────────────────────────────────
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => entities.EmailMessage.update(id, data),
    onSuccess: () => {
      invalidateEntity(qc, "email_message", projectId);
    },
    onError: (e: any) => toast.error("Update failed: " + (e?.message || "Unknown error")),
  });

  const bulkUpdateMut = useMutation({
    mutationFn: async ({ ids, data }: { ids: string[]; data: any }) => {
      await Promise.all(ids.map((id) => entities.EmailMessage.update(id, data)));
    },
    onSuccess: () => {
      invalidateEntity(qc, "email_message", projectId);
      setSelectedIds(new Set());
    },
    onError: (e: any) => toast.error("Bulk update failed: " + (e?.message || "Unknown error")),
  });

  // ── Collect all labels used across messages ────────────────────────
  const allLabels = useMemo(() => {
    const labelSet = new Set(DEFAULT_LABELS);
    messages.forEach((m) => {
      const labels = Array.isArray(m.labels) ? m.labels : [];
      labels.forEach((l) => labelSet.add(l));
    });
    return Array.from(labelSet).sort();
  }, [messages]);

  // ── Filtering ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const folder = FOLDERS.find((f) => f.id === activeFolder) || FOLDERS[0];
    let items = messages.filter(folder.filter);

    if (activeLabelFilter) {
      items = items.filter((m) => {
        const labels = Array.isArray(m.labels) ? m.labels : [];
        return labels.includes(activeLabelFilter);
      });
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((m) =>
        (m.subject || "").toLowerCase().includes(q)
        || (m.sender_email || "").toLowerCase().includes(q)
        || (m.sender_name || "").toLowerCase().includes(q)
      );
    }
    return items;
  }, [messages, activeFolder, activeLabelFilter, search]);

  // ── Stats ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = messages.filter((m) => m.import_status === "pending" && m.direction !== "outbound").length;
    const unread = messages.filter((m) => !m.is_read && m.import_status === "pending" && m.direction !== "outbound").length;
    const starred = messages.filter((m) => m.is_starred && m.import_status !== "archived" && m.import_status !== "rejected").length;
    const pending = messages.filter((m) => m.import_status === "pending" && m.direction !== "outbound").length;
    const sent = messages.filter((m) => m.direction === "outbound").length;
    return { total, unread, starred, pending, sent };
  }, [messages]);

  // ── Folder counts ──────────────────────────────────────────────────
  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    FOLDERS.forEach((f) => {
      counts[f.id] = messages.filter(f.filter).length;
    });
    return counts;
  }, [messages]);

  // ── Selected message ───────────────────────────────────────────────
  const selectedMessage = useMemo(
    () => messages.find((m) => m.id === selectedId) || null,
    [messages, selectedId]
  );

  // Auto-mark as read when selected
  useEffect(() => {
    if (selectedMessage && !selectedMessage.is_read) {
      updateMut.mutate({ id: selectedMessage.id, data: { is_read: true } });
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Action handlers ────────────────────────────────────────────────
  const handleStar = useCallback((msg: EmailMessage, e?: any) => {
    e?.stopPropagation();
    updateMut.mutate({ id: msg.id, data: { is_starred: !msg.is_starred } });
  }, [updateMut]);

  const handleMarkRead = useCallback((msg: EmailMessage) => {
    updateMut.mutate(
      { id: msg.id, data: { is_read: !msg.is_read } },
      { onSuccess: () => toast.success(msg.is_read ? "Marked unread" : "Marked read") }
    );
  }, [updateMut]);

  const handleReject = useCallback((msg: EmailMessage) => {
    updateMut.mutate(
      { id: msg.id, data: { import_status: "rejected", reviewed_at: new Date().toISOString() } },
      { onSuccess: () => { toast.success("Email rejected"); if (selectedId === msg.id) setSelectedId(null); } }
    );
  }, [updateMut, selectedId]);

  const handleArchive = useCallback((msg: EmailMessage) => {
    updateMut.mutate(
      { id: msg.id, data: { import_status: "archived", reviewed_at: new Date().toISOString() } },
      { onSuccess: () => { toast.success("Email archived"); if (selectedId === msg.id) setSelectedId(null); } }
    );
  }, [updateMut, selectedId]);

  const handleRestore = useCallback((msg: EmailMessage) => {
    updateMut.mutate(
      { id: msg.id, data: { import_status: "pending", reviewed_at: null, linked_entity_type: null, linked_entity_id: null } },
      { onSuccess: () => toast.success("Restored to pending") }
    );
  }, [updateMut]);

  const handleAddLabel = useCallback((msg: EmailMessage, label: string) => {
    const current = Array.isArray(msg.labels) ? msg.labels : [];
    if (current.includes(label)) return;
    updateMut.mutate({ id: msg.id, data: { labels: [...current, label] } });
  }, [updateMut]);

  const handleRemoveLabel = useCallback((msg: EmailMessage, label: string) => {
    const current = Array.isArray(msg.labels) ? msg.labels : [];
    updateMut.mutate({ id: msg.id, data: { labels: current.filter((l) => l !== label) } });
  }, [updateMut]);

  // ── Bulk actions ───────────────────────────────────────────────────
  const allFilteredSelected = filtered.length > 0 && filtered.every((m) => selectedIds.has(m.id));

  const toggleSelectAll = useCallback(() => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((m) => m.id)));
    }
  }, [filtered, allFilteredSelected]);

  const toggleSelect = useCallback((id: string, e?: any) => {
    e?.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleSelectMessage = useCallback((msg: EmailMessage) => {
    if (isNarrow) {
      setMobileDetailMsg(msg);
      // Mark as read
      if (!msg.is_read) {
        updateMut.mutate({ id: msg.id, data: { is_read: true } });
      }
    } else {
      setSelectedId(msg.id);
    }
  }, [isNarrow, updateMut]);

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* KPI strip */}
      <div style={{ padding: "16px 20px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <Mail size={20} strokeWidth={1.75} style={{ color: "var(--accent)" }} />
          <h1 style={{
            fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700,
            color: "var(--text-primary)", margin: 0,
          }}>
            Email Inbox
          </h1>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setComposeModal(true)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              height: 30, padding: "0 12px",
              background: "var(--accent)", border: "1px solid var(--accent-border)",
              borderRadius: 8, cursor: "pointer",
              fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600,
              color: "var(--text-on-accent, #fff)", flexShrink: 0,
            }}
          >
            <PenSquare size={12} strokeWidth={2} />
            Compose
          </button>
          <button
            onClick={() => navigate(createPageUrl("Integrations"))}
            title="Email Settings"
            style={{
              height: 30, width: 30, display: "flex", alignItems: "center", justifyContent: "center",
              background: "var(--bg-surface)", border: "1px solid var(--border-default)",
              borderRadius: 8, cursor: "pointer", color: "var(--text-muted)", flexShrink: 0,
            }}
          >
            <Settings size={13} strokeWidth={2} />
          </button>
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <KpiTile compact label="Inbox" value={stats.total} icon={<Inbox size={14} />} color="var(--accent)"
            active={activeFolder === "inbox"} onClick={() => { setActiveFolder("inbox"); setActiveLabelFilter(null); }} />
          <KpiTile compact label="Unread" value={stats.unread} icon={<Mail size={14} />} color="var(--warning)"
            onClick={() => { setActiveFolder("inbox"); setActiveLabelFilter(null); }} />
          <KpiTile compact label="Starred" value={stats.starred} icon={<Star size={14} />} color="#F59E0B"
            active={activeFolder === "starred"} onClick={() => { setActiveFolder("starred"); setActiveLabelFilter(null); }} />
          <KpiTile compact label="Sent" value={stats.sent} icon={<Send size={14} />} color="var(--accent)"
            active={activeFolder === "sent"} onClick={() => { setActiveFolder("sent"); setActiveLabelFilter(null); }} />
          <KpiTile compact label="Pending Review" value={stats.pending} icon={<Clock size={14} />} color="var(--info)"
            active={activeFolder === "inbox"} onClick={() => { setActiveFolder("inbox"); setActiveLabelFilter(null); }} />
        </div>
      </div>

      {/* Main content area */}
      <div style={{
        flex: 1, display: "flex", overflow: "hidden",
        border: "1px solid var(--border-default)", borderRadius: 12,
        margin: "0 20px 16px", background: "var(--bg-surface)",
      }}>
        {/* ── Left sidebar ──────────────────────────────────────────── */}
        {!isNarrow && (
          <div style={{
            width: 200, flexShrink: 0, borderRight: "1px solid var(--border-default)",
            display: "flex", flexDirection: "column", overflow: "hidden",
          }}>
            {/* Folders */}
            <div style={{ padding: "12px 8px 6px" }}>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                letterSpacing: "0.14em", textTransform: "uppercase",
                color: "var(--text-muted)", padding: "0 8px 6px",
              }}>
                Folders
              </div>
              {FOLDERS.map((f) => {
                const FolderIcon = f.icon;
                const isActive = activeFolder === f.id && !activeLabelFilter;
                const count = folderCounts[f.id] || 0;
                return (
                  <button
                    key={f.id}
                    onClick={() => { setActiveFolder(f.id); setActiveLabelFilter(null); setSelectedIds(new Set()); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, width: "100%",
                      padding: "7px 10px", borderRadius: 6, border: "none",
                      background: isActive ? "var(--accent-muted)" : "transparent",
                      color: isActive ? "var(--accent)" : "var(--text-secondary)",
                      fontFamily: "var(--font-body)", fontSize: 12, fontWeight: isActive ? 600 : 400,
                      cursor: "pointer", textAlign: "left", transition: "all 100ms",
                    }}
                  >
                    <FolderIcon size={14} strokeWidth={isActive ? 2 : 1.5} />
                    <span style={{ flex: 1 }}>{f.label}</span>
                    {count > 0 && (
                      <span style={{
                        fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600,
                        color: isActive ? "var(--accent)" : "var(--text-muted)",
                        minWidth: 18, textAlign: "right",
                      }}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Labels */}
            <div style={{ padding: "8px 8px 12px", borderTop: "1px solid var(--border-default)", marginTop: 4 }}>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                letterSpacing: "0.14em", textTransform: "uppercase",
                color: "var(--text-muted)", padding: "4px 8px 6px",
              }}>
                Labels
              </div>
              {allLabels.map((label) => {
                const isActive = activeLabelFilter === label;
                const color = getLabelColor(label);
                const count = messages.filter((m) => {
                  const labels = Array.isArray(m.labels) ? m.labels : [];
                  return labels.includes(label);
                }).length;
                return (
                  <button
                    key={label}
                    onClick={() => {
                      setActiveLabelFilter(isActive ? null : label);
                      setActiveFolder("all");
                      setSelectedIds(new Set());
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, width: "100%",
                      padding: "5px 10px", borderRadius: 6, border: "none",
                      background: isActive ? `color-mix(in srgb, ${color} 15%, transparent)` : "transparent",
                      color: isActive ? color : "var(--text-secondary)",
                      fontFamily: "var(--font-body)", fontSize: 11, fontWeight: isActive ? 600 : 400,
                      cursor: "pointer", textAlign: "left", transition: "all 100ms",
                    }}
                  >
                    <div style={{
                      width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0,
                    }} />
                    <span style={{ flex: 1 }}>{label}</span>
                    {count > 0 && (
                      <span style={{
                        fontFamily: "var(--font-mono)", fontSize: 10,
                        color: "var(--text-muted)",
                      }}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Email list ────────────────────────────────────────────── */}
        <div style={{
          width: isNarrow ? "100%" : 380, flexShrink: 0,
          borderRight: isNarrow ? "none" : "1px solid var(--border-default)",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          {/* Search + filter bar */}
          <div style={{
            padding: "10px 12px", borderBottom: "1px solid var(--border-default)",
            display: "flex", gap: 8, alignItems: "center", flexShrink: 0,
          }}>
            <div style={{ flex: 1, position: "relative" }}>
              <Search size={13} strokeWidth={2} style={{
                position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)",
                color: "var(--text-muted)", pointerEvents: "none",
              }} />
              <input
                type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search emails..."
                style={{
                  width: "100%", height: 30, padding: "0 8px 0 28px",
                  background: "var(--bg-surface-low)", border: "1px solid var(--border-default)",
                  borderRadius: 6, fontFamily: "var(--font-body)", fontSize: 11,
                  color: "var(--text-primary)", outline: "none",
                }}
              />
            </div>
            {/* Mobile folder selector */}
            {isNarrow && (
              <select
                value={activeFolder}
                onChange={(e) => { setActiveFolder(e.target.value); setActiveLabelFilter(null); }}
                style={{
                  height: 30, padding: "0 24px 0 8px", background: "var(--bg-surface-low)",
                  border: "1px solid var(--border-default)", borderRadius: 6,
                  fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)",
                  cursor: "pointer", appearance: "none",
                  backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23888' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
                  backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center",
                }}
              >
                {FOLDERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            )}
          </div>

          {/* Select-all header */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
            borderBottom: "1px solid var(--border-default)", flexShrink: 0,
            background: "var(--bg-surface-low)",
          }}>
            <input
              type="checkbox"
              checked={allFilteredSelected && filtered.length > 0}
              onChange={toggleSelectAll}
              style={{ accentColor: "var(--accent)", cursor: "pointer" }}
            />
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
              letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)",
            }}>
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : `${filtered.length} emails`}
            </span>
          </div>

          {/* Email rows */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {isLoading ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: 12 }}>
                Loading emails...
              </div>
            ) : error ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--status-error)", fontFamily: "var(--font-body)", fontSize: 12 }}>
                Failed to load: {(error as any)?.message || "Unknown"}
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40 }}>
                <Inbox size={32} strokeWidth={1.25} style={{ color: "var(--text-muted)", marginBottom: 8 }} />
                <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                  {messages.length > 0 ? "No emails match your filters" : "No emails yet"}
                </p>
              </div>
            ) : (
              filtered.map((msg) => (
                <EmailRow
                  key={msg.id}
                  message={msg}
                  isSelected={selectedId === msg.id}
                  isChecked={selectedIds.has(msg.id)}
                  onSelect={() => handleSelectMessage(msg)}
                  onCheck={(e) => toggleSelect(msg.id, e)}
                  onStar={(e) => handleStar(msg, e)}
                  attachmentCount={(attachmentsByMessage[msg.id] || []).length}
                />
              ))
            )}
          </div>
        </div>

        {/* ── Detail pane ───────────────────────────────────────────── */}
        {!isNarrow && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {selectedMessage ? (
              <EmailDetail
                message={selectedMessage}
                attachments={attachmentsByMessage[selectedMessage.id] || []}
                onReject={() => handleReject(selectedMessage)}
                onArchive={() => handleArchive(selectedMessage)}
                onRestore={() => handleRestore(selectedMessage)}
                onApprove={() => setCreateModal(selectedMessage)}
                onLink={() => setLinkModal(selectedMessage)}
                onMarkRead={() => handleMarkRead(selectedMessage)}
                onStar={(e) => handleStar(selectedMessage, e)}
                onAddLabel={(label) => handleAddLabel(selectedMessage, label)}
                onRemoveLabel={(label) => handleRemoveLabel(selectedMessage, label)}
                allLabels={allLabels}
                labelDropdownOpen={labelDropdownId === selectedMessage.id}
                onToggleLabelDropdown={() => setLabelDropdownId(labelDropdownId === selectedMessage.id ? null : selectedMessage.id)}
                onReply={() => setReplyState({ mode: "reply", message: selectedMessage })}
                onReplyAll={() => setReplyState({ mode: "reply_all", message: selectedMessage })}
              />
            ) : (
              <div style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                flexDirection: "column", gap: 8, color: "var(--text-muted)",
              }}>
                <Mail size={40} strokeWidth={1} style={{ opacity: 0.4 }} />
                <span style={{ fontFamily: "var(--font-body)", fontSize: 13 }}>Select an email to read</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          onClear={() => setSelectedIds(new Set())}
          actions={[
            {
              label: "Mark Read", icon: <Eye size={12} />,
              onClick: () => bulkUpdateMut.mutate({ ids: [...selectedIds], data: { is_read: true } }),
            },
            {
              label: "Star", icon: <Star size={12} />,
              onClick: () => bulkUpdateMut.mutate({ ids: [...selectedIds], data: { is_starred: true } }),
            },
            {
              label: "Archive", icon: <Archive size={12} />,
              onClick: () => bulkUpdateMut.mutate({
                ids: [...selectedIds],
                data: { import_status: "archived", reviewed_at: new Date().toISOString() },
              }),
            },
            {
              label: "Reject", icon: <XCircle size={12} />, variant: "danger",
              onClick: () => bulkUpdateMut.mutate({
                ids: [...selectedIds],
                data: { import_status: "rejected", reviewed_at: new Date().toISOString() },
              }),
            },
          ]}
        />
      )}

      {/* Mobile detail modal */}
      {isNarrow && mobileDetailMsg && (
        <Modal
          open={true}
          onClose={() => setMobileDetailMsg(null)}
          title={mobileDetailMsg.subject || "(no subject)"}
          eyebrow={`FROM ${mobileDetailMsg.sender_name || mobileDetailMsg.sender_email}`}
          width={600}
          footer={
            <MobileDetailFooter
              message={mobileDetailMsg}
              onReject={() => { handleReject(mobileDetailMsg); setMobileDetailMsg(null); }}
              onArchive={() => { handleArchive(mobileDetailMsg); setMobileDetailMsg(null); }}
              onRestore={() => { handleRestore(mobileDetailMsg); setMobileDetailMsg(null); }}
              onApprove={() => { setCreateModal(mobileDetailMsg); setMobileDetailMsg(null); }}
              onLink={() => { setLinkModal(mobileDetailMsg); setMobileDetailMsg(null); }}
            />
          }
        >
          <EmailBodyContent
            message={mobileDetailMsg}
            attachments={attachmentsByMessage[mobileDetailMsg.id] || []}
          />
        </Modal>
      )}

      {/* Create Record Modal */}
      {createModal && (
        <CreateRecordModal
          message={createModal}
          attachments={attachmentsByMessage[createModal.id] || []}
          projectId={projectId ?? ""}
          onClose={() => setCreateModal(null)}
          onSuccess={() => {
            setCreateModal(null);
            invalidateEntity(qc, "email_message", projectId);
          }}
        />
      )}

      {/* Link to Existing Modal */}
      {linkModal && (
        <LinkToExistingModal
          message={linkModal}
          projectId={projectId ?? ""}
          onClose={() => setLinkModal(null)}
          onSuccess={() => {
            setLinkModal(null);
            invalidateEntity(qc, "email_message", projectId);
          }}
        />
      )}

      {/* Compose Modal */}
      {composeModal && (
        <ComposeEmailModal
          projectId={projectId ?? ""}
          onClose={() => setComposeModal(false)}
          onSent={() => {
            setComposeModal(false);
            invalidateEntity(qc, "email_message", projectId);
          }}
        />
      )}

      {/* Reply Modal */}
      {replyState && (
        <ReplyEmailModal
          projectId={projectId ?? ""}
          originalMessage={replyState.message}
          mode={replyState.mode}
          currentUserEmail={currentUserEmail}
          onClose={() => setReplyState(null)}
          onSent={() => {
            setReplyState(null);
            invalidateEntity(qc, "email_message", projectId);
          }}
        />
      )}
    </div>
  );
}
