/**
 * EmailInbox.jsx — Professional split-pane email client for project emails.
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

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProjectId } from "@/hooks/useProjectId";
import { toast } from "sonner";
import { KpiTile, Modal, BulkActionBar } from "@/components/design-system";
import {
  Mail, Search, Inbox, CheckCircle2, XCircle, Link2, Archive, RotateCcw,
  Paperclip, Clock, AlertTriangle, FileText, MessageSquare, ChevronDown,
  Plus, Filter, ExternalLink, X, Settings, Star, Eye, EyeOff, Tag,
  Send, Trash2, ChevronRight, MoreHorizontal, Check, Hash,
} from "lucide-react";
import { invalidateEntity } from "@/services/cacheRegistry";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

// ── Constants ──────────────────────────────────────────────────────────

const TYPE_STYLES = {
  rfi:         { color: "var(--info)",       label: "RFI" },
  submittal:   { color: "var(--accent)",     label: "Submittal" },
  action_item: { color: "var(--warning)",    label: "Action Item" },
  transmittal: { color: "var(--success)",    label: "Transmittal" },
  general:     { color: "var(--text-muted)", label: "General" },
  unknown:     { color: "var(--text-muted)", label: "Unknown" },
};

const STATUS_STYLES = {
  pending:  { color: "var(--warning)",      bg: "var(--warning-muted)",  border: "var(--warning-border)", label: "Pending" },
  approved: { color: "var(--success)",      bg: "var(--success-muted)",  border: "var(--success-border)", label: "Approved" },
  rejected: { color: "var(--status-error)", bg: "color-mix(in srgb, var(--status-error) 10%, transparent)", border: "color-mix(in srgb, var(--status-error) 30%, transparent)", label: "Rejected" },
  linked:   { color: "var(--info)",         bg: "var(--info-muted)",     border: "var(--info-border)",    label: "Linked" },
  archived: { color: "var(--text-muted)",   bg: "var(--bg-surface-low)", border: "var(--border-default)", label: "Archived" },
};

const ENTITY_TYPE_OPTIONS = [
  { value: "rfi",         label: "RFI" },
  { value: "action_item", label: "Action Item" },
  { value: "submittal",   label: "Submittal" },
];

const DEFAULT_LABELS = ["Urgent", "Follow-up", "Waiting", "Important"];

const LABEL_COLORS = {
  "Urgent":     "#EF4444",
  "Follow-up":  "#F59E0B",
  "Waiting":    "#8B5CF6",
  "Important":  "#3B82F6",
};

function getLabelColor(label) {
  if (LABEL_COLORS[label]) return LABEL_COLORS[label];
  // Deterministic color from string hash
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = label.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 55%)`;
}

// ── Sidebar folders ───────────────────────────────────────────────────

const FOLDERS = [
  { id: "inbox",    label: "Inbox",    icon: Inbox,       filter: (m) => m.import_status === "pending" },
  { id: "starred",  label: "Starred",  icon: Star,        filter: (m) => m.is_starred && m.import_status !== "archived" && m.import_status !== "rejected" },
  { id: "approved", label: "Approved", icon: CheckCircle2, filter: (m) => m.import_status === "approved" },
  { id: "linked",   label: "Linked",   icon: Link2,       filter: (m) => m.import_status === "linked" },
  { id: "rejected", label: "Rejected", icon: XCircle,     filter: (m) => m.import_status === "rejected" },
  { id: "archived", label: "Archived", icon: Archive,     filter: (m) => m.import_status === "archived" },
  { id: "all",      label: "All Mail", icon: Mail,        filter: () => true },
];

// ── Time helpers ──────────────────────────────────────────────────────

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    weekday: "short", year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function isToday(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
}

// ── Responsive hook ───────────────────────────────────────────────────

function useWindowWidth() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return w;
}

// ── Main component ────────────────────────────────────────────────────

export default function EmailInbox() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const windowWidth = useWindowWidth();
  const isNarrow = windowWidth < 900;

  // ── State ──────────────────────────────────────────────────────────
  const [activeFolder, setActiveFolder] = useState("inbox");
  const [activeLabelFilter, setActiveLabelFilter] = useState(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [createModal, setCreateModal] = useState(null);
  const [linkModal, setLinkModal] = useState(null);
  const [labelDropdownId, setLabelDropdownId] = useState(null);
  const [mobileDetailMsg, setMobileDetailMsg] = useState(null);

  // ── Data fetching ──────────────────────────────────────────────────
  const { data: messages = [], isLoading, error } = useQuery({
    queryKey: ["email-messages", projectId],
    queryFn: () => base44.entities.EmailMessage.filter({ project_id: projectId }, "-received_at"),
    enabled: !!projectId,
  });

  const { data: attachments = [] } = useQuery({
    queryKey: ["email-attachments", projectId],
    queryFn: () => base44.entities.EmailAttachment.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const attachmentsByMessage = useMemo(() => {
    const map = {};
    attachments.forEach((att) => {
      if (!map[att.message_id]) map[att.message_id] = [];
      map[att.message_id].push(att);
    });
    return map;
  }, [attachments]);

  // ── Mutations ──────────────────────────────────────────────────────
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.EmailMessage.update(id, data),
    onSuccess: () => {
      invalidateEntity(qc, "email_message", projectId);
    },
    onError: (e) => toast.error("Update failed: " + (e?.message || "Unknown error")),
  });

  const bulkUpdateMut = useMutation({
    mutationFn: async ({ ids, data }) => {
      await Promise.all(ids.map((id) => base44.entities.EmailMessage.update(id, data)));
    },
    onSuccess: () => {
      invalidateEntity(qc, "email_message", projectId);
      setSelectedIds(new Set());
    },
    onError: (e) => toast.error("Bulk update failed: " + (e?.message || "Unknown error")),
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
    const total = messages.filter((m) => m.import_status === "pending").length;
    const unread = messages.filter((m) => !m.is_read && m.import_status === "pending").length;
    const starred = messages.filter((m) => m.is_starred && m.import_status !== "archived" && m.import_status !== "rejected").length;
    const pending = messages.filter((m) => m.import_status === "pending").length;
    return { total, unread, starred, pending };
  }, [messages]);

  // ── Folder counts ──────────────────────────────────────────────────
  const folderCounts = useMemo(() => {
    const counts = {};
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
  const handleStar = useCallback((msg, e) => {
    e?.stopPropagation();
    updateMut.mutate({ id: msg.id, data: { is_starred: !msg.is_starred } });
  }, [updateMut]);

  const handleMarkRead = useCallback((msg) => {
    updateMut.mutate(
      { id: msg.id, data: { is_read: !msg.is_read } },
      { onSuccess: () => toast.success(msg.is_read ? "Marked unread" : "Marked read") }
    );
  }, [updateMut]);

  const handleReject = useCallback((msg) => {
    updateMut.mutate(
      { id: msg.id, data: { import_status: "rejected", reviewed_at: new Date().toISOString() } },
      { onSuccess: () => { toast.success("Email rejected"); if (selectedId === msg.id) setSelectedId(null); } }
    );
  }, [updateMut, selectedId]);

  const handleArchive = useCallback((msg) => {
    updateMut.mutate(
      { id: msg.id, data: { import_status: "archived", reviewed_at: new Date().toISOString() } },
      { onSuccess: () => { toast.success("Email archived"); if (selectedId === msg.id) setSelectedId(null); } }
    );
  }, [updateMut, selectedId]);

  const handleRestore = useCallback((msg) => {
    updateMut.mutate(
      { id: msg.id, data: { import_status: "pending", reviewed_at: null, linked_entity_type: null, linked_entity_id: null } },
      { onSuccess: () => toast.success("Restored to pending") }
    );
  }, [updateMut]);

  const handleAddLabel = useCallback((msg, label) => {
    const current = Array.isArray(msg.labels) ? msg.labels : [];
    if (current.includes(label)) return;
    updateMut.mutate({ id: msg.id, data: { labels: [...current, label] } });
  }, [updateMut]);

  const handleRemoveLabel = useCallback((msg, label) => {
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

  const toggleSelect = useCallback((id, e) => {
    e?.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleSelectMessage = useCallback((msg) => {
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
                Failed to load: {error?.message || "Unknown"}
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
          projectId={projectId}
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
          projectId={projectId}
          onClose={() => setLinkModal(null)}
          onSuccess={() => {
            setLinkModal(null);
            invalidateEntity(qc, "email_message", projectId);
          }}
        />
      )}
    </div>
  );
}

// ── Email Row ─────────────────────────────────────────────────────────

function EmailRow({ message, isSelected, isChecked, onSelect, onCheck, onStar, attachmentCount }) {
  const isUnread = !message.is_read;
  const typeInfo = TYPE_STYLES[message.parsed_type] || TYPE_STYLES.unknown;
  const labels = Array.isArray(message.labels) ? message.labels : [];

  const bodyPreview = useMemo(() => {
    const text = message.body_text || "";
    return text.replace(/\s+/g, " ").trim().slice(0, 120);
  }, [message.body_text]);

  return (
    <div
      onClick={onSelect}
      style={{
        display: "flex", alignItems: "flex-start", gap: 6, padding: "9px 12px",
        borderBottom: "1px solid var(--border-default)",
        background: isSelected
          ? "var(--accent-muted)"
          : isUnread
            ? "color-mix(in srgb, var(--bg-surface) 100%, transparent)"
            : "var(--bg-surface-low)",
        cursor: "pointer",
        transition: "background 80ms",
      }}
      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "color-mix(in srgb, var(--accent) 6%, var(--bg-surface))"; }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.background = isUnread
            ? "color-mix(in srgb, var(--bg-surface) 100%, transparent)"
            : "var(--bg-surface-low)";
        }
      }}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={isChecked}
        onChange={onCheck}
        onClick={(e) => e.stopPropagation()}
        style={{ accentColor: "var(--accent)", marginTop: 3, cursor: "pointer", flexShrink: 0 }}
      />

      {/* Star */}
      <button
        onClick={(e) => { e.stopPropagation(); onStar(e); }}
        style={{
          background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 2, flexShrink: 0,
          color: message.is_starred ? "#F59E0B" : "var(--text-muted)",
          opacity: message.is_starred ? 1 : 0.4,
          transition: "all 100ms",
        }}
        title={message.is_starred ? "Unstar" : "Star"}
      >
        <Star size={13} strokeWidth={2} fill={message.is_starred ? "#F59E0B" : "none"} />
      </button>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Sender + time */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{
            fontFamily: "var(--font-body)", fontSize: 12,
            fontWeight: isUnread ? 700 : 400,
            color: "var(--text-primary)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
          }}>
            {message.sender_name || message.sender_email || "Unknown"}
          </span>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)",
            whiteSpace: "nowrap", flexShrink: 0,
          }}>
            {timeAgo(message.received_at)}
          </span>
        </div>

        {/* Subject */}
        <div style={{
          fontFamily: "var(--font-body)", fontSize: 11.5,
          fontWeight: isUnread ? 600 : 400,
          color: isUnread ? "var(--text-primary)" : "var(--text-secondary)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          marginTop: 1,
        }}>
          {message.subject || "(no subject)"}
        </div>

        {/* Body preview */}
        <div style={{
          fontFamily: "var(--font-body)", fontSize: 10.5,
          color: "var(--text-muted)", lineHeight: 1.35,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          marginTop: 2,
        }}>
          {bodyPreview || "No content"}
        </div>

        {/* Bottom row: badges + attachments + labels */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
          {/* Type badge */}
          <span style={{
            display: "inline-flex", padding: "1px 5px", borderRadius: 3,
            fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
            letterSpacing: "0.06em", textTransform: "uppercase",
            color: typeInfo.color,
            background: `color-mix(in srgb, ${typeInfo.color} 12%, transparent)`,
          }}>
            {typeInfo.label}
          </span>

          {/* Attachment indicator */}
          {(message.has_attachments || attachmentCount > 0) && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 2,
              fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)",
            }}>
              <Paperclip size={9} strokeWidth={2} />
              {message.attachment_count || attachmentCount}
            </span>
          )}

          {/* Labels */}
          {labels.slice(0, 2).map((l) => (
            <span key={l} style={{
              display: "inline-flex", padding: "1px 4px", borderRadius: 3,
              fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 600,
              color: getLabelColor(l),
              background: `color-mix(in srgb, ${getLabelColor(l)} 12%, transparent)`,
            }}>
              {l}
            </span>
          ))}
          {labels.length > 2 && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>
              +{labels.length - 2}
            </span>
          )}

          {/* Unread dot */}
          {isUnread && (
            <div style={{
              width: 6, height: 6, borderRadius: 3, background: "var(--accent)", marginLeft: "auto", flexShrink: 0,
            }} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Email Detail Pane ─────────────────────────────────────────────────

function EmailDetail({
  message, attachments, onReject, onArchive, onRestore, onApprove, onLink,
  onMarkRead, onStar, onAddLabel, onRemoveLabel, allLabels,
  labelDropdownOpen, onToggleLabelDropdown,
}) {
  const [customLabel, setCustomLabel] = useState("");
  const status = STATUS_STYLES[message.import_status] || STATUS_STYLES.pending;
  const typeInfo = TYPE_STYLES[message.parsed_type] || TYPE_STYLES.unknown;
  const labels = Array.isArray(message.labels) ? message.labels : [];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Detail header */}
      <div style={{
        padding: "14px 18px", borderBottom: "1px solid var(--border-default)", flexShrink: 0,
      }}>
        {/* Subject */}
        <h2 style={{
          fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700,
          color: "var(--text-primary)", margin: "0 0 8px", lineHeight: 1.3,
        }}>
          {message.subject || "(no subject)"}
        </h2>

        {/* Sender + metadata */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          {/* Avatar */}
          <div style={{
            width: 34, height: 34, borderRadius: 8, background: "var(--accent-muted)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            color: "var(--accent)", fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 700,
          }}>
            {(message.sender_name || message.sender_email || "?")[0].toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                {message.sender_name || message.sender_email}
              </span>
              {message.sender_name && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
                  {"<"}{message.sender_email}{">"}
                </span>
              )}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
              {formatDate(message.received_at)}
            </div>
            {/* Recipients */}
            {message.recipients && (
              <div style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                To: {typeof message.recipients === "string" ? message.recipients : JSON.parse(message.recipients || "[]").join(", ")}
              </div>
            )}
          </div>
          {/* Right side: star + status */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <button
              onClick={onStar}
              style={{
                background: "none", border: "none", cursor: "pointer", padding: 2,
                color: message.is_starred ? "#F59E0B" : "var(--text-muted)",
              }}
              title={message.is_starred ? "Unstar" : "Star"}
            >
              <Star size={16} strokeWidth={1.75} fill={message.is_starred ? "#F59E0B" : "none"} />
            </button>
            <span style={{
              padding: "2px 8px", borderRadius: 4,
              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
              letterSpacing: "0.05em", textTransform: "uppercase",
              color: typeInfo.color,
              background: `color-mix(in srgb, ${typeInfo.color} 12%, transparent)`,
              border: `1px solid color-mix(in srgb, ${typeInfo.color} 25%, transparent)`,
            }}>
              {typeInfo.label}
            </span>
            <span style={{
              padding: "2px 8px", borderRadius: 4,
              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
              letterSpacing: "0.05em", textTransform: "uppercase",
              color: status.color, background: status.bg, border: `1px solid ${status.border}`,
            }}>
              {status.label}
            </span>
          </div>
        </div>

        {/* Labels row */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
          {labels.map((l) => (
            <span key={l} style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "2px 8px", borderRadius: 4,
              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600,
              color: getLabelColor(l),
              background: `color-mix(in srgb, ${getLabelColor(l)} 12%, transparent)`,
              border: `1px solid color-mix(in srgb, ${getLabelColor(l)} 25%, transparent)`,
            }}>
              {l}
              <X
                size={9} strokeWidth={2.5} style={{ cursor: "pointer", opacity: 0.6 }}
                onClick={() => onRemoveLabel(l)}
              />
            </span>
          ))}

          {/* Add label button */}
          <div style={{ position: "relative" }}>
            <button
              onClick={onToggleLabelDropdown}
              style={{
                display: "inline-flex", alignItems: "center", gap: 3,
                padding: "2px 7px", borderRadius: 4, border: "1px dashed var(--border-default)",
                background: "transparent", cursor: "pointer",
                fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600,
                color: "var(--text-muted)",
              }}
            >
              <Tag size={9} strokeWidth={2} /> Label
            </button>

            {labelDropdownOpen && (
              <div style={{
                position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 100,
                background: "var(--bg-elevated)", border: "1px solid var(--border-strong)",
                borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                width: 180, maxHeight: 200, overflowY: "auto",
              }}>
                {allLabels.filter((l) => !labels.includes(l)).map((l) => (
                  <button
                    key={l}
                    onClick={() => { onAddLabel(l); onToggleLabelDropdown(); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, width: "100%",
                      padding: "7px 12px", border: "none", background: "transparent",
                      cursor: "pointer", textAlign: "left",
                      fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)",
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-surface-low)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: getLabelColor(l), flexShrink: 0 }} />
                    {l}
                  </button>
                ))}
                {/* Custom label input */}
                <div style={{
                  padding: "6px 10px", borderTop: "1px solid var(--border-default)",
                  display: "flex", gap: 4,
                }}>
                  <input
                    type="text" value={customLabel} onChange={(e) => setCustomLabel(e.target.value)}
                    placeholder="Custom..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && customLabel.trim()) {
                        onAddLabel(customLabel.trim());
                        setCustomLabel("");
                        onToggleLabelDropdown();
                      }
                    }}
                    style={{
                      flex: 1, height: 24, padding: "0 6px",
                      background: "var(--bg-surface-low)", border: "1px solid var(--border-default)",
                      borderRadius: 4, fontFamily: "var(--font-body)", fontSize: 10,
                      color: "var(--text-primary)", outline: "none",
                    }}
                  />
                  <button
                    onClick={() => {
                      if (customLabel.trim()) {
                        onAddLabel(customLabel.trim());
                        setCustomLabel("");
                        onToggleLabelDropdown();
                      }
                    }}
                    style={{
                      height: 24, padding: "0 6px", background: "var(--accent)",
                      border: "none", borderRadius: 4, cursor: "pointer",
                      color: "var(--text-on-accent, #fff)", fontSize: 10,
                    }}
                  >
                    <Plus size={10} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Linked entity info */}
        {(message.import_status === "approved" || message.import_status === "linked") && message.linked_entity_type && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8,
            padding: "4px 10px", background: "var(--success-muted)",
            border: "1px solid var(--success-border)", borderRadius: 6,
            fontFamily: "var(--font-body)", fontSize: 11, color: "var(--success)",
          }}>
            <Link2 size={12} strokeWidth={2} />
            Linked to {message.linked_entity_type.replace(/_/g, " ")}
            <ExternalLink size={10} strokeWidth={2} />
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {message.import_status === "pending" && (
            <>
              <DetailAction icon={<Plus size={12} />} label="Approve & Create" color="var(--success)" onClick={onApprove} />
              <DetailAction icon={<Link2 size={12} />} label="Link to Existing" color="var(--info)" onClick={onLink} />
              <DetailAction icon={<XCircle size={12} />} label="Reject" color="var(--status-error)" onClick={onReject} />
              <DetailAction icon={<Archive size={12} />} label="Archive" color="var(--text-muted)" onClick={onArchive} />
            </>
          )}
          {message.import_status === "approved" && (
            <DetailAction icon={<Archive size={12} />} label="Archive" color="var(--text-muted)" onClick={onArchive} />
          )}
          {(message.import_status === "rejected" || message.import_status === "archived") && (
            <DetailAction icon={<RotateCcw size={12} />} label="Restore to Pending" color="var(--info)" onClick={onRestore} />
          )}
          <DetailAction
            icon={message.is_read ? <EyeOff size={12} /> : <Eye size={12} />}
            label={message.is_read ? "Mark Unread" : "Mark Read"}
            color="var(--text-muted)"
            onClick={onMarkRead}
          />
        </div>
      </div>

      {/* Body content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>
        <EmailBodyContent message={message} attachments={attachments} />
      </div>
    </div>
  );
}

// ── Email body content (shared between detail pane and mobile modal) ──

function EmailBodyContent({ message, attachments }) {
  const iframeRef = useRef(null);

  // Resize iframe to fit content
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !message.body_html) return;
    const onLoad = () => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc) {
          const h = doc.documentElement.scrollHeight || doc.body.scrollHeight;
          iframe.style.height = Math.min(Math.max(h + 20, 100), 2000) + "px";
        }
      } catch { /* cross-origin guard */ }
    };
    iframe.addEventListener("load", onLoad);
    return () => iframe.removeEventListener("load", onLoad);
  }, [message.body_html]);

  const htmlDoc = message.body_html
    ? `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        body { margin: 0; padding: 12px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 13px; line-height: 1.5; color: #d4d4d8; background: transparent; }
        img { max-width: 100%; height: auto; }
        a { color: #60a5fa; }
        table { border-collapse: collapse; max-width: 100%; }
        td, th { padding: 4px 8px; }
        pre, code { font-family: var(--font-mono, monospace); font-size: 12px;
          background: rgba(255,255,255,0.06); padding: 2px 4px; border-radius: 3px; }
      </style></head><body>${message.body_html}</body></html>`
    : null;

  return (
    <div>
      {/* Render HTML body in sandboxed iframe, or fallback to text */}
      {htmlDoc ? (
        <iframe
          ref={iframeRef}
          sandbox="allow-same-origin"
          srcDoc={htmlDoc}
          style={{
            width: "100%", minHeight: 100, border: "none", borderRadius: 6,
            background: "var(--bg-surface-low)",
          }}
          title="Email body"
        />
      ) : message.body_text ? (
        <div style={{
          fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)",
          lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word",
          padding: 12, background: "var(--bg-surface-low)", borderRadius: 8,
        }}>
          {message.body_text}
        </div>
      ) : (
        <div style={{
          fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)",
          fontStyle: "italic", padding: 12,
        }}>
          No email body content available
        </div>
      )}

      {/* Attachments */}
      {attachments.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
            letterSpacing: "0.12em", textTransform: "uppercase",
            color: "var(--text-muted)", marginBottom: 6,
          }}>
            Attachments ({attachments.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {attachments.map((att) => (
              <div
                key={att.id}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 12px", background: "var(--bg-surface-low)",
                  border: "1px solid var(--border-default)", borderRadius: 6,
                }}
              >
                <Paperclip size={12} strokeWidth={2} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                <span style={{
                  flex: 1, fontFamily: "var(--font-body)", fontSize: 12,
                  color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {att.filename}
                </span>
                {att.size_bytes && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
                    {formatBytes(att.size_bytes)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Detail action button ──────────────────────────────────────────────

function DetailAction({ icon, label, color, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "5px 10px",
        background: `color-mix(in srgb, ${color} 8%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
        borderRadius: 6, fontFamily: "var(--font-body)", fontSize: 11,
        fontWeight: 500, color, cursor: "pointer", transition: "all 120ms",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = `color-mix(in srgb, ${color} 16%, transparent)`;
        e.currentTarget.style.borderColor = `color-mix(in srgb, ${color} 40%, transparent)`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = `color-mix(in srgb, ${color} 8%, transparent)`;
        e.currentTarget.style.borderColor = `color-mix(in srgb, ${color} 25%, transparent)`;
      }}
    >
      {icon}
      {label}
    </button>
  );
}

// ── Mobile detail footer ──────────────────────────────────────────────

function MobileDetailFooter({ message, onReject, onArchive, onRestore, onApprove, onLink }) {
  return (
    <>
      {message.import_status === "pending" && (
        <>
          <DetailAction icon={<Plus size={12} />} label="Approve" color="var(--success)" onClick={onApprove} />
          <DetailAction icon={<Link2 size={12} />} label="Link" color="var(--info)" onClick={onLink} />
          <DetailAction icon={<XCircle size={12} />} label="Reject" color="var(--status-error)" onClick={onReject} />
          <DetailAction icon={<Archive size={12} />} label="Archive" color="var(--text-muted)" onClick={onArchive} />
        </>
      )}
      {(message.import_status === "rejected" || message.import_status === "archived") && (
        <DetailAction icon={<RotateCcw size={12} />} label="Restore" color="var(--info)" onClick={onRestore} />
      )}
    </>
  );
}

// ── Create Record Modal ───────────────────────────────────────────────

function CreateRecordModal({ message, attachments, projectId, onClose, onSuccess }) {
  const qc = useQueryClient();
  const [entityType, setEntityType] = useState(
    message.parsed_type === "rfi" ? "rfi"
    : message.parsed_type === "action_item" ? "action_item"
    : message.parsed_type === "submittal" ? "submittal"
    : "action_item"
  );
  const [title, setTitle] = useState(message.subject || "");
  const [description, setDescription] = useState(
    `From: ${message.sender_name || message.sender_email}\n\n${message.body_text || ""}`
  );
  const [selectedAttachments, setSelectedAttachments] = useState(
    new Set(attachments.map((a) => a.id))
  );
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      let createdRecord;
      if (entityType === "rfi") {
        createdRecord = await base44.entities.RFI.create({
          project_id: projectId, subject: title, question: description,
          status: "Open", priority: "Medium",
        });
        invalidateEntity(qc, "rfi", projectId);
      } else if (entityType === "action_item") {
        createdRecord = await base44.entities.ActionItem.create({
          project_id: projectId, title, description, status: "Open", priority: "Medium",
        });
        invalidateEntity(qc, "action_item", projectId);
      } else if (entityType === "submittal") {
        createdRecord = await base44.entities.Submittal.create({
          project_id: projectId, title, description, status: "Open",
        });
        invalidateEntity(qc, "submittal", projectId);
      }
      if (createdRecord) {
        await base44.entities.EmailMessage.update(message.id, {
          import_status: "approved", linked_entity_type: entityType,
          linked_entity_id: createdRecord.id, reviewed_at: new Date().toISOString(),
        });
      }
      toast.success(`${ENTITY_TYPE_OPTIONS.find((o) => o.value === entityType)?.label || "Record"} created from email`);
      onSuccess();
    } catch (err) {
      toast.error("Failed: " + (err?.message || "Unknown error"));
    } finally { setSaving(false); }
  };

  return (
    <Modal open={true} onClose={onClose} title="Create Record from Email" width={540}
      footer={
        <>
          <button onClick={onClose} style={secondaryBtnStyle}>Cancel</button>
          <button onClick={handleCreate} disabled={saving} style={primaryBtnStyle}>
            {saving ? "Creating..." : "Create Record"}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={labelStyle}>Record Type</label>
          <div style={{ display: "flex", gap: 6 }}>
            {ENTITY_TYPE_OPTIONS.map((opt) => (
              <button key={opt.value} onClick={() => setEntityType(opt.value)} style={{
                flex: 1, padding: "8px 0",
                background: entityType === opt.value ? "var(--accent-muted)" : "var(--bg-surface-low)",
                border: `1px solid ${entityType === opt.value ? "var(--accent-border)" : "var(--border-default)"}`,
                borderRadius: 6, fontFamily: "var(--font-body)", fontSize: 12,
                fontWeight: entityType === opt.value ? 600 : 400,
                color: entityType === opt.value ? "var(--accent)" : "var(--text-secondary)",
                cursor: "pointer", transition: "all 120ms",
              }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={labelStyle}>Title</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
            style={inputStyle} placeholder="Record title" />
        </div>
        <div>
          <label style={labelStyle}>Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)}
            rows={5} style={{ ...inputStyle, resize: "vertical", minHeight: 80 }} />
        </div>
        {attachments.length > 0 && (
          <div>
            <label style={labelStyle}>Attachments to File</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {attachments.map((att) => (
                <label key={att.id} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
                  background: "var(--bg-surface-low)", border: "1px solid var(--border-default)",
                  borderRadius: 6, cursor: "pointer", fontFamily: "var(--font-body)", fontSize: 12,
                  color: "var(--text-primary)",
                }}>
                  <input type="checkbox" checked={selectedAttachments.has(att.id)}
                    onChange={(e) => {
                      const next = new Set(selectedAttachments);
                      if (e.target.checked) next.add(att.id); else next.delete(att.id);
                      setSelectedAttachments(next);
                    }}
                    style={{ accentColor: "var(--accent)" }}
                  />
                  <Paperclip size={12} strokeWidth={2} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {att.filename}
                  </span>
                  {att.size_bytes && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
                      {formatBytes(att.size_bytes)}
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Link to Existing Modal ────────────────────────────────────────────

function LinkToExistingModal({ message, projectId, onClose, onSuccess }) {
  const qc = useQueryClient();
  const [searchType, setSearchType] = useState("rfi");
  const [searchQuery, setSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: rfis = [] } = useQuery({
    queryKey: ["rfis", projectId, "link-search"],
    queryFn: () => base44.entities.RFI.filter({ project_id: projectId }),
    enabled: !!projectId && searchType === "rfi",
  });
  const { data: actionItems = [] } = useQuery({
    queryKey: ["action-items", projectId, "link-search"],
    queryFn: () => base44.entities.ActionItem.filter({ project_id: projectId }),
    enabled: !!projectId && searchType === "action_item",
  });
  const { data: submittals = [] } = useQuery({
    queryKey: ["submittals", projectId, "link-search"],
    queryFn: () => base44.entities.Submittal.filter({ project_id: projectId }),
    enabled: !!projectId && searchType === "submittal",
  });

  const records = searchType === "rfi" ? rfis : searchType === "action_item" ? actionItems : submittals;

  const filteredRecords = useMemo(() => {
    if (!searchQuery.trim()) return records.slice(0, 20);
    const q = searchQuery.toLowerCase();
    return records.filter((r) =>
      (r.subject || r.title || "").toLowerCase().includes(q)
      || (r.description || r.question || "").toLowerCase().includes(q)
    ).slice(0, 20);
  }, [records, searchQuery]);

  const handleLink = async (record) => {
    setSaving(true);
    try {
      await base44.entities.EmailMessage.update(message.id, {
        import_status: "linked", linked_entity_type: searchType,
        linked_entity_id: record.id, reviewed_at: new Date().toISOString(),
      });
      invalidateEntity(qc, "email_message", projectId);
      toast.success("Email linked to existing record");
      onSuccess();
    } catch (err) {
      toast.error("Failed: " + (err?.message || "Unknown error"));
    } finally { setSaving(false); }
  };

  return (
    <Modal open={true} onClose={onClose} title="Link to Existing Record" width={540}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {ENTITY_TYPE_OPTIONS.map((opt) => (
            <button key={opt.value} onClick={() => setSearchType(opt.value)} style={{
              flex: 1, padding: "6px 0",
              background: searchType === opt.value ? "var(--accent-muted)" : "var(--bg-surface-low)",
              border: `1px solid ${searchType === opt.value ? "var(--accent-border)" : "var(--border-default)"}`,
              borderRadius: 6, fontFamily: "var(--font-body)", fontSize: 11,
              fontWeight: searchType === opt.value ? 600 : 400,
              color: searchType === opt.value ? "var(--accent)" : "var(--text-secondary)",
              cursor: "pointer", transition: "all 120ms",
            }}>
              {opt.label}
            </button>
          ))}
        </div>
        <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={`Search ${ENTITY_TYPE_OPTIONS.find((o) => o.value === searchType)?.label || "records"}...`}
          style={inputStyle} autoFocus />
      </div>

      {filteredRecords.length === 0 ? (
        <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: 12 }}>
          No matching records found
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {filteredRecords.map((rec) => (
            <button key={rec.id} onClick={() => handleLink(rec)} disabled={saving} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
              background: "var(--bg-surface-low)", border: "1px solid var(--border-default)",
              borderRadius: 8, cursor: "pointer", textAlign: "left", width: "100%", transition: "all 120ms",
            }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent-border)"; e.currentTarget.style.background = "var(--accent-muted)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-default)"; e.currentTarget.style.background = "var(--bg-surface-low)"; }}
            >
              <FileText size={14} strokeWidth={1.75} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, color: "var(--text-primary)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {rec.subject || rec.title || "(untitled)"}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
                  {rec.status || ""} {rec.number ? `#${rec.number}` : ""}
                </div>
              </div>
              <Link2 size={12} strokeWidth={2} style={{ color: "var(--accent)", flexShrink: 0 }} />
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────

const labelStyle = {
  display: "block", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
  letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 5,
};

const inputStyle = {
  width: "100%", padding: "8px 12px", background: "var(--bg-surface-low)",
  border: "1px solid var(--border-default)", borderRadius: 8,
  fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)",
  outline: "none", boxSizing: "border-box",
};

const primaryBtnStyle = {
  padding: "8px 18px", background: "var(--accent)", border: "1px solid var(--accent-border)",
  borderRadius: 8, fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600,
  color: "var(--text-on-accent, #fff)", cursor: "pointer", transition: "all 120ms",
};

const secondaryBtnStyle = {
  padding: "8px 18px", background: "var(--bg-surface-low)", border: "1px solid var(--border-default)",
  borderRadius: 8, fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 500,
  color: "var(--text-secondary)", cursor: "pointer", transition: "all 120ms",
};

// ── Helpers ───────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (!bytes || bytes < 1) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}
