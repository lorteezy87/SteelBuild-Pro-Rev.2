/**
 * EmailInbox.jsx — Email review queue for inbound project emails.
 *
 * Displays parsed inbound emails with triage controls:
 *   - Filter by import_status (pending/approved/rejected/linked/archived)
 *   - Filter by parsed_type (rfi/submittal/action_item/transmittal/general/unknown)
 *   - Search by subject / sender
 *   - Approve & create a new record (RFI, Action Item, Submittal)
 *   - Link to an existing record
 *   - Reject / archive / restore
 *
 * Data flows through the EmailMessage entity client + TanStack Query.
 */

import React, { useState, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProjectId } from "@/hooks/useProjectId";
import { toast } from "sonner";
import { CommandBar, KpiTile, EmptyState } from "@/components/design-system";
import {
  Mail, Search, Inbox, CheckCircle2, XCircle, Link2, Archive, RotateCcw,
  Paperclip, Clock, AlertTriangle, FileText, MessageSquare, ChevronDown,
  Plus, Filter, ExternalLink, X, Settings,
} from "lucide-react";
import { invalidateEntity } from "@/services/cacheRegistry";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

// ── Constants ──────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "all",      label: "All" },
  { value: "pending",  label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "linked",   label: "Linked" },
  { value: "archived", label: "Archived" },
];

const TYPE_OPTIONS = [
  { value: "all",         label: "All Types" },
  { value: "rfi",         label: "RFI" },
  { value: "submittal",   label: "Submittal" },
  { value: "action_item", label: "Action Item" },
  { value: "transmittal", label: "Transmittal" },
  { value: "general",     label: "General" },
  { value: "unknown",     label: "Unknown" },
];

const STATUS_STYLES = {
  pending:  { color: "var(--warning)",  bg: "var(--warning-muted)",  border: "var(--warning-border)", label: "Pending" },
  approved: { color: "var(--success)",  bg: "var(--success-muted)",  border: "var(--success-border)", label: "Approved" },
  rejected: { color: "var(--status-error)", bg: "color-mix(in srgb, var(--status-error) 10%, transparent)", border: "color-mix(in srgb, var(--status-error) 30%, transparent)", label: "Rejected" },
  linked:   { color: "var(--info)",     bg: "var(--info-muted)",     border: "var(--info-border)",    label: "Linked" },
  archived: { color: "var(--text-muted)", bg: "var(--bg-surface-low)", border: "var(--border-default)", label: "Archived" },
};

const TYPE_STYLES = {
  rfi:         { color: "var(--info)",    label: "RFI" },
  submittal:   { color: "var(--accent)",  label: "Submittal" },
  action_item: { color: "var(--warning)", label: "Action Item" },
  transmittal: { color: "var(--success)", label: "Transmittal" },
  general:     { color: "var(--text-muted)", label: "General" },
  unknown:     { color: "var(--text-muted)", label: "Unknown" },
};

const ENTITY_TYPE_OPTIONS = [
  { value: "rfi",         label: "RFI" },
  { value: "action_item", label: "Action Item" },
  { value: "submittal",   label: "Submittal" },
];

// ── Time helpers ───────────────────────────────────────────────────────

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function isToday(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
}

// ── Main component ─────────────────────────────────────────────────────

export default function EmailInbox() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  const navigate = useNavigate();

  // ── Filter state ─────────────────────────────────────────────────────
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [search, setSearch] = useState("");

  // ── Modal state ──────────────────────────────────────────────────────
  const [createModal, setCreateModal] = useState(null);   // email message object
  const [linkModal, setLinkModal] = useState(null);       // email message object

  // ── Data fetching ────────────────────────────────────────────────────
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

  // Group attachments by message_id for quick lookup
  const attachmentsByMessage = useMemo(() => {
    const map = {};
    attachments.forEach((att) => {
      if (!map[att.message_id]) map[att.message_id] = [];
      map[att.message_id].push(att);
    });
    return map;
  }, [attachments]);

  // ── Mutations ────────────────────────────────────────────────────────
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.EmailMessage.update(id, data),
    onSuccess: () => {
      invalidateEntity(qc, "email_message", projectId);
      invalidateEntity(qc, "email_attachment", projectId);
    },
    onError: (e) => toast.error("Update failed: " + (e?.message || "Unknown error")),
  });

  // ── Filtering ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let items = messages;
    if (filterStatus !== "all") {
      items = items.filter((m) => m.import_status === filterStatus);
    }
    if (filterType !== "all") {
      items = items.filter((m) => m.parsed_type === filterType);
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
  }, [messages, filterStatus, filterType, search]);

  // ── Stats ────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const pending = messages.filter((m) => m.import_status === "pending").length;
    const approvedToday = messages.filter(
      (m) => m.import_status === "approved" && isToday(m.reviewed_at)
    ).length;
    const rejected = messages.filter((m) => m.import_status === "rejected").length;
    return { pending, approvedToday, rejected };
  }, [messages]);

  // ── Action handlers ──────────────────────────────────────────────────
  const handleReject = useCallback((msg) => {
    updateMut.mutate(
      { id: msg.id, data: { import_status: "rejected", reviewed_at: new Date().toISOString() } },
      { onSuccess: () => toast.success("Email rejected") }
    );
  }, [updateMut]);

  const handleArchive = useCallback((msg) => {
    updateMut.mutate(
      { id: msg.id, data: { import_status: "archived", reviewed_at: new Date().toISOString() } },
      { onSuccess: () => toast.success("Email archived") }
    );
  }, [updateMut]);

  const handleRestore = useCallback((msg) => {
    updateMut.mutate(
      { id: msg.id, data: { import_status: "pending", reviewed_at: null, linked_entity_type: null, linked_entity_id: null } },
      { onSuccess: () => toast.success("Restored to pending") }
    );
  }, [updateMut]);

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "24px 32px", maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <Mail size={22} strokeWidth={1.75} style={{ color: "var(--accent)" }} />
          <h1 style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            fontWeight: 700,
            color: "var(--text-primary)",
            margin: 0,
          }}>
            Email Inbox
          </h1>
        </div>
        <p style={{
          fontFamily: "var(--font-body)",
          fontSize: 13,
          color: "var(--text-muted)",
          margin: 0,
        }}>
          Review and process inbound project emails
        </p>
      </div>

      {/* KPI tiles */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <KpiTile
          label="Pending Review"
          value={stats.pending}
          icon={<Clock size={16} />}
          color="var(--warning)"
          onClick={() => setFilterStatus("pending")}
          style={{ cursor: "pointer" }}
        />
        <KpiTile
          label="Approved Today"
          value={stats.approvedToday}
          icon={<CheckCircle2 size={16} />}
          color="var(--success)"
          onClick={() => setFilterStatus("approved")}
          style={{ cursor: "pointer" }}
        />
        <KpiTile
          label="Rejected"
          value={stats.rejected}
          icon={<XCircle size={16} />}
          color="var(--status-error)"
          onClick={() => setFilterStatus("rejected")}
          style={{ cursor: "pointer" }}
        />
      </div>

      {/* Filter bar */}
      <div style={{
        display: "flex",
        gap: 10,
        marginBottom: 16,
        flexWrap: "wrap",
        alignItems: "center",
      }}>
        {/* Search */}
        <div style={{
          flex: "1 1 240px",
          minWidth: 200,
          maxWidth: 360,
          position: "relative",
        }}>
          <Search
            size={14}
            strokeWidth={2}
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-muted)",
              pointerEvents: "none",
            }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search subject, sender..."
            style={{
              width: "100%",
              height: 34,
              padding: "0 10px 0 32px",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: 8,
              fontFamily: "var(--font-body)",
              fontSize: 12,
              color: "var(--text-primary)",
              outline: "none",
            }}
          />
        </div>

        {/* Status filter */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{
            height: 34,
            padding: "0 28px 0 10px",
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: 8,
            fontFamily: "var(--font-body)",
            fontSize: 12,
            color: "var(--text-primary)",
            cursor: "pointer",
            appearance: "none",
            backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23888' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 10px center",
          }}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        {/* Type filter */}
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          style={{
            height: 34,
            padding: "0 28px 0 10px",
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: 8,
            fontFamily: "var(--font-body)",
            fontSize: 12,
            color: "var(--text-primary)",
            cursor: "pointer",
            appearance: "none",
            backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23888' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 10px center",
          }}
        >
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        {/* Settings link */}
        <button
          onClick={() => navigate(createPageUrl("Integrations"))}
          title="Email Account Settings"
          style={{
            height: 34,
            width: 34,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: 8,
            cursor: "pointer",
            color: "var(--text-muted)",
            flexShrink: 0,
          }}
        >
          <Settings size={14} strokeWidth={2} />
        </button>
      </div>

      {/* Message list */}
      {isLoading ? (
        <div style={{
          textAlign: "center",
          padding: 60,
          color: "var(--text-muted)",
          fontFamily: "var(--font-body)",
          fontSize: 13,
        }}>
          Loading emails...
        </div>
      ) : error ? (
        <div style={{
          textAlign: "center",
          padding: 60,
          color: "var(--status-error)",
          fontFamily: "var(--font-body)",
          fontSize: 13,
        }}>
          Failed to load emails: {error?.message || "Unknown error"}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyStateCard hasMessages={messages.length > 0} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((msg) => (
            <EmailCard
              key={msg.id}
              message={msg}
              attachments={attachmentsByMessage[msg.id] || []}
              onReject={() => handleReject(msg)}
              onArchive={() => handleArchive(msg)}
              onRestore={() => handleRestore(msg)}
              onApprove={() => setCreateModal(msg)}
              onLink={() => setLinkModal(msg)}
            />
          ))}
        </div>
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

// ── Empty state ────────────────────────────────────────────────────────

function EmptyStateCard({ hasMessages }) {
  return (
    <div style={{
      textAlign: "center",
      padding: "60px 24px",
      background: "var(--bg-surface)",
      border: "1px solid var(--border-default)",
      borderRadius: 12,
    }}>
      <Inbox size={40} strokeWidth={1.25} style={{ color: "var(--text-muted)", marginBottom: 12 }} />
      <p style={{
        fontFamily: "var(--font-display)",
        fontSize: 15,
        fontWeight: 600,
        color: "var(--text-primary)",
        margin: "0 0 6px",
      }}>
        {hasMessages ? "No emails match your filters" : "No emails yet"}
      </p>
      <p style={{
        fontFamily: "var(--font-body)",
        fontSize: 12,
        color: "var(--text-muted)",
        margin: 0,
        maxWidth: 400,
        marginLeft: "auto",
        marginRight: "auto",
        lineHeight: 1.5,
      }}>
        {hasMessages
          ? "Try adjusting your status or type filters to see more results."
          : "Set up email forwarding on the Integrations page to start receiving project emails. Forwarded emails will appear here for review and triage."
        }
      </p>
    </div>
  );
}

// ── Email card ─────────────────────────────────────────────────────────

function EmailCard({ message, attachments, onReject, onArchive, onRestore, onApprove, onLink }) {
  const [expanded, setExpanded] = useState(false);
  const status = STATUS_STYLES[message.import_status] || STATUS_STYLES.pending;
  const typeInfo = TYPE_STYLES[message.parsed_type] || TYPE_STYLES.unknown;

  const bodyPreview = useMemo(() => {
    const text = message.body_text || "";
    if (!text) return "No body content";
    const lines = text.split("\n").filter((l) => l.trim()).slice(0, 2);
    const preview = lines.join(" ").slice(0, 200);
    return preview + (text.length > 200 ? "..." : "");
  }, [message.body_text]);

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: 10,
        padding: "14px 18px",
        transition: "border-color 140ms, box-shadow 140ms",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--accent-border)";
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border-default)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {/* Top row: sender + metadata */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 6 }}>
        {/* Sender avatar */}
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: "var(--accent-muted)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          color: "var(--accent)",
          fontFamily: "var(--font-display)",
          fontSize: 14,
          fontWeight: 700,
        }}>
          {(message.sender_name || message.sender_email || "?")[0].toUpperCase()}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Sender name + email */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 2, flexWrap: "wrap" }}>
            <span style={{
              fontFamily: "var(--font-body)",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-primary)",
            }}>
              {message.sender_name || message.sender_email}
            </span>
            {message.sender_name && (
              <span style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--text-muted)",
              }}>
                {message.sender_email}
              </span>
            )}
          </div>

          {/* Subject */}
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 13,
              fontWeight: 500,
              color: "var(--text-primary)",
              lineHeight: 1.3,
              marginBottom: 4,
              cursor: "pointer",
            }}
            onClick={() => setExpanded((v) => !v)}
          >
            {message.subject || "(no subject)"}
          </div>

          {/* Body preview */}
          <div style={{
            fontFamily: "var(--font-body)",
            fontSize: 11.5,
            color: "var(--text-muted)",
            lineHeight: 1.4,
            overflow: "hidden",
            display: expanded ? "block" : "-webkit-box",
            WebkitLineClamp: expanded ? "unset" : 2,
            WebkitBoxOrient: "vertical",
            maxHeight: expanded ? "none" : 36,
            whiteSpace: expanded ? "pre-wrap" : undefined,
          }}>
            {expanded ? (message.body_text || "No body content") : bodyPreview}
          </div>
        </div>

        {/* Right side: time + badges */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--text-muted)",
            whiteSpace: "nowrap",
          }}>
            {timeAgo(message.received_at)}
          </span>

          <div style={{ display: "flex", gap: 4 }}>
            {/* Parsed type badge */}
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 8px",
              borderRadius: 4,
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: typeInfo.color,
              background: `color-mix(in srgb, ${typeInfo.color} 12%, transparent)`,
              border: `1px solid color-mix(in srgb, ${typeInfo.color} 25%, transparent)`,
            }}>
              {typeInfo.label}
            </span>

            {/* Status badge */}
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 8px",
              borderRadius: 4,
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: status.color,
              background: status.bg,
              border: `1px solid ${status.border}`,
            }}>
              {status.label}
            </span>
          </div>

          {/* Attachment indicator */}
          {message.has_attachments && (
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--text-muted)",
            }}>
              <Paperclip size={10} strokeWidth={2} />
              {message.attachment_count || attachments.length}
            </span>
          )}
        </div>
      </div>

      {/* Linked entity info (for approved/linked messages) */}
      {(message.import_status === "approved" || message.import_status === "linked") && message.linked_entity_type && (
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          marginTop: 8,
          padding: "4px 10px",
          background: "var(--success-muted)",
          border: "1px solid var(--success-border)",
          borderRadius: 6,
          fontFamily: "var(--font-body)",
          fontSize: 11,
          color: "var(--success)",
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
            <ActionButton icon={<Plus size={12} />} label="Approve & Create" color="var(--success)" onClick={onApprove} />
            <ActionButton icon={<Link2 size={12} />} label="Link to Existing" color="var(--info)" onClick={onLink} />
            <ActionButton icon={<XCircle size={12} />} label="Reject" color="var(--status-error)" onClick={onReject} />
            <ActionButton icon={<Archive size={12} />} label="Archive" color="var(--text-muted)" onClick={onArchive} />
          </>
        )}
        {message.import_status === "rejected" && (
          <ActionButton icon={<RotateCcw size={12} />} label="Restore to Pending" color="var(--info)" onClick={onRestore} />
        )}
        {message.import_status === "archived" && (
          <ActionButton icon={<RotateCcw size={12} />} label="Restore to Pending" color="var(--info)" onClick={onRestore} />
        )}
      </div>
    </div>
  );
}

function ActionButton({ icon, label, color, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "5px 10px",
        background: `color-mix(in srgb, ${color} 8%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
        borderRadius: 6,
        fontFamily: "var(--font-body)",
        fontSize: 11,
        fontWeight: 500,
        color: color,
        cursor: "pointer",
        transition: "all 120ms",
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

// ── Create Record Modal ────────────────────────────────────────────────

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
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    try {
      let createdRecord;
      if (entityType === "rfi") {
        createdRecord = await base44.entities.RFI.create({
          project_id: projectId,
          subject: title,
          question: description,
          status: "Open",
          priority: "Medium",
        });
        invalidateEntity(qc, "rfi", projectId);
      } else if (entityType === "action_item") {
        createdRecord = await base44.entities.ActionItem.create({
          project_id: projectId,
          title: title,
          description: description,
          status: "Open",
          priority: "Medium",
        });
        invalidateEntity(qc, "action_item", projectId);
      } else if (entityType === "submittal") {
        createdRecord = await base44.entities.Submittal.create({
          project_id: projectId,
          title: title,
          description: description,
          status: "Open",
        });
        invalidateEntity(qc, "submittal", projectId);
      }

      // Update email message with link
      if (createdRecord) {
        await base44.entities.EmailMessage.update(message.id, {
          import_status: "approved",
          linked_entity_type: entityType,
          linked_entity_id: createdRecord.id,
          reviewed_at: new Date().toISOString(),
        });
      }

      toast.success(`${ENTITY_TYPE_OPTIONS.find((o) => o.value === entityType)?.label || "Record"} created from email`);
      onSuccess();
    } catch (err) {
      toast.error("Failed: " + (err?.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: 12,
        width: 540,
        maxWidth: "90vw",
        maxHeight: "80vh",
        overflow: "auto",
        boxShadow: "var(--shadow-lg)",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--border-default)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <h2 style={{
            fontFamily: "var(--font-display)",
            fontSize: 16,
            fontWeight: 700,
            color: "var(--text-primary)",
            margin: 0,
          }}>
            Create Record from Email
          </h2>
          <button onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--text-muted)", padding: 4,
          }}>
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Entity type selector */}
          <div>
            <label style={labelStyle}>Record Type</label>
            <div style={{ display: "flex", gap: 6 }}>
              {ENTITY_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setEntityType(opt.value)}
                  style={{
                    flex: 1,
                    padding: "8px 0",
                    background: entityType === opt.value
                      ? "var(--accent-muted)"
                      : "var(--bg-surface-low)",
                    border: `1px solid ${entityType === opt.value
                      ? "var(--accent-border)"
                      : "var(--border-default)"}`,
                    borderRadius: 6,
                    fontFamily: "var(--font-body)",
                    fontSize: 12,
                    fontWeight: entityType === opt.value ? 600 : 400,
                    color: entityType === opt.value
                      ? "var(--accent)"
                      : "var(--text-secondary)",
                    cursor: "pointer",
                    transition: "all 120ms",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label style={labelStyle}>Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={inputStyle}
              placeholder="Record title"
            />
          </div>

          {/* Description */}
          <div>
            <label style={labelStyle}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              style={{ ...inputStyle, resize: "vertical", minHeight: 80 }}
            />
          </div>

          {/* Attachments */}
          {attachments.length > 0 && (
            <div>
              <label style={labelStyle}>Attachments to File</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {attachments.map((att) => (
                  <label
                    key={att.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 10px",
                      background: "var(--bg-surface-low)",
                      border: "1px solid var(--border-default)",
                      borderRadius: 6,
                      cursor: "pointer",
                      fontFamily: "var(--font-body)",
                      fontSize: 12,
                      color: "var(--text-primary)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedAttachments.has(att.id)}
                      onChange={(e) => {
                        const next = new Set(selectedAttachments);
                        if (e.target.checked) next.add(att.id);
                        else next.delete(att.id);
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

        {/* Footer */}
        <div style={{
          padding: "12px 20px",
          borderTop: "1px solid var(--border-default)",
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
        }}>
          <button onClick={onClose} style={secondaryBtnStyle}>Cancel</button>
          <button onClick={handleCreate} disabled={saving} style={primaryBtnStyle}>
            {saving ? "Creating..." : "Create Record"}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

// ── Link to Existing Modal ─────────────────────────────────────────────

function LinkToExistingModal({ message, projectId, onClose, onSuccess }) {
  const qc = useQueryClient();
  const [searchType, setSearchType] = useState("rfi");
  const [searchQuery, setSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);

  // Fetch potential linkable records
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

  const records = searchType === "rfi" ? rfis
    : searchType === "action_item" ? actionItems
    : submittals;

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
        import_status: "linked",
        linked_entity_type: searchType,
        linked_entity_id: record.id,
        reviewed_at: new Date().toISOString(),
      });
      invalidateEntity(qc, "email_message", projectId);
      toast.success("Email linked to existing record");
      onSuccess();
    } catch (err) {
      toast.error("Failed: " + (err?.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: 12,
        width: 540,
        maxWidth: "90vw",
        maxHeight: "80vh",
        overflow: "hidden",
        boxShadow: "var(--shadow-lg)",
        display: "flex",
        flexDirection: "column",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--border-default)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <h2 style={{
            fontFamily: "var(--font-display)",
            fontSize: 16,
            fontWeight: 700,
            color: "var(--text-primary)",
            margin: 0,
          }}>
            Link to Existing Record
          </h2>
          <button onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--text-muted)", padding: 4,
          }}>
            <X size={16} />
          </button>
        </div>

        {/* Search controls */}
        <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border-default)", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {ENTITY_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSearchType(opt.value)}
                style={{
                  flex: 1,
                  padding: "6px 0",
                  background: searchType === opt.value ? "var(--accent-muted)" : "var(--bg-surface-low)",
                  border: `1px solid ${searchType === opt.value ? "var(--accent-border)" : "var(--border-default)"}`,
                  borderRadius: 6,
                  fontFamily: "var(--font-body)",
                  fontSize: 11,
                  fontWeight: searchType === opt.value ? 600 : 400,
                  color: searchType === opt.value ? "var(--accent)" : "var(--text-secondary)",
                  cursor: "pointer",
                  transition: "all 120ms",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${ENTITY_TYPE_OPTIONS.find((o) => o.value === searchType)?.label || "records"}...`}
            style={inputStyle}
            autoFocus
          />
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflow: "auto", padding: "8px 20px 16px" }}>
          {filteredRecords.length === 0 ? (
            <div style={{
              textAlign: "center",
              padding: 32,
              color: "var(--text-muted)",
              fontFamily: "var(--font-body)",
              fontSize: 12,
            }}>
              No matching records found
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {filteredRecords.map((rec) => (
                <button
                  key={rec.id}
                  onClick={() => handleLink(rec)}
                  disabled={saving}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    background: "var(--bg-surface-low)",
                    border: "1px solid var(--border-default)",
                    borderRadius: 8,
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%",
                    transition: "all 120ms",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--accent-border)";
                    e.currentTarget.style.background = "var(--accent-muted)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border-default)";
                    e.currentTarget.style.background = "var(--bg-surface-low)";
                  }}
                >
                  <FileText size={14} strokeWidth={1.75} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: "var(--font-body)",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {rec.subject || rec.title || "(untitled)"}
                    </div>
                    <div style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: "var(--text-muted)",
                    }}>
                      {rec.status || ""} {rec.number ? `#${rec.number}` : ""}
                    </div>
                  </div>
                  <Link2 size={12} strokeWidth={2} style={{ color: "var(--accent)", flexShrink: 0 }} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
}

// ── Modal overlay ──────────────────────────────────────────────────────

function ModalOverlay({ children, onClose }) {
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
        padding: 16,
      }}
    >
      {children}
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────

const labelStyle = {
  display: "block",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  marginBottom: 5,
};

const inputStyle = {
  width: "100%",
  padding: "8px 12px",
  background: "var(--bg-surface-low)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  fontFamily: "var(--font-body)",
  fontSize: 12,
  color: "var(--text-primary)",
  outline: "none",
  boxSizing: "border-box",
};

const primaryBtnStyle = {
  padding: "8px 18px",
  background: "var(--accent)",
  border: "1px solid var(--accent-border)",
  borderRadius: 8,
  fontFamily: "var(--font-body)",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-on-accent, #fff)",
  cursor: "pointer",
  transition: "all 120ms",
};

const secondaryBtnStyle = {
  padding: "8px 18px",
  background: "var(--bg-surface-low)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  fontFamily: "var(--font-body)",
  fontSize: 12,
  fontWeight: 500,
  color: "var(--text-secondary)",
  cursor: "pointer",
  transition: "all 120ms",
};

// ── Helpers ────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (!bytes || bytes < 1) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}
