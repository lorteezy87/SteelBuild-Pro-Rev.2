/**
 * EmailIntake — Review queue for emails staged by the integration service.
 *
 * Shows pending emails with detected type, confidence, sender, subject,
 * and date. Users can approve (creates a record), reject, or reassign type.
 * Also includes a settings panel for configuring mailbox connections and
 * classification preferences.
 */

import React, { useState, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useProjectId } from "@/hooks/useProjectId";
import { toast } from "sonner";
import { CommandBar, EmptyState } from "@/components/design-system";
import {
  Check,
  X,
  Mail,
  Paperclip,
  RefreshCw,
  Settings,
  ArrowRight,
  ChevronDown,
  AlertCircle,
  FileText,
  HelpCircle,
  CheckSquare,
  Folder,
  Search,
  Plus,
  Trash2,
  Eye,
} from "lucide-react";
import {
  approveQueueItem,
  rejectQueueItem,
  reassignType,
  classifyEmail,
  stageEmail,
  EMAIL_RECORD_TYPES,
  EMAIL_PROVIDERS,
  getProjectEmailSettings,
  upsertEmailSetting,
  deleteEmailSetting,
} from "@/services/emailIntegration";

// ── Type icons ─────────────────────────────────────────────────────────────

const TYPE_ICONS = {
  RFI: HelpCircle,
  Submittal: FileText,
  "Action Item": CheckSquare,
  Document: Folder,
  Unknown: AlertCircle,
};

const TYPE_COLORS = {
  RFI: "var(--status-warning)",
  Submittal: "var(--status-info)",
  "Action Item": "var(--accent)",
  Document: "var(--text-secondary)",
  Unknown: "var(--text-muted)",
};

const STATUS_COLORS = {
  Pending: "var(--status-warning)",
  Approved: "var(--status-success)",
  Rejected: "var(--status-error)",
  Processing: "var(--status-info)",
  Error: "var(--status-error)",
};

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(dateStr) {
  if (!dateStr) return "--";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function confidenceLabel(conf) {
  if (conf >= 0.8) return "High";
  if (conf >= 0.5) return "Medium";
  if (conf >= 0.2) return "Low";
  return "None";
}

// ── Main component ─────────────────────────────────────────────────────────

export default function EmailIntake() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  const [tab, setTab] = useState("queue"); // "queue" | "settings"
  const [statusFilter, setStatusFilter] = useState("Pending");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [showManualEntry, setShowManualEntry] = useState(false);

  // ── Queries ──────────────────────────────────────────────────────────────
  const queryKey = ["email-intake-queue", projectId, statusFilter];
  const { data: queueItems = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => {
      const conditions = { project_id: projectId };
      if (statusFilter !== "All") conditions.status = statusFilter;
      return base44.entities.EmailIntakeQueue.filter(conditions, "-received_at");
    },
    enabled: !!projectId,
  });

  const { data: settings = [] } = useQuery({
    queryKey: ["email-integration-settings", projectId],
    queryFn: () => getProjectEmailSettings(projectId),
    enabled: !!projectId,
  });

  // ── Mutations ────────────────────────────────────────────────────────────
  const approveMut = useMutation({
    mutationFn: ({ queueItemId, recordType, userId, notes }) =>
      approveQueueItem({ queueItemId, recordType, userId, notes }),
    onSuccess: () => {
      toast.success("Email approved and record created");
      qc.invalidateQueries({ queryKey: ["email-intake-queue"] });
    },
    onError: (err) => toast.error(err?.message || "Failed to approve"),
  });

  const rejectMut = useMutation({
    mutationFn: ({ queueItemId, userId, notes }) =>
      rejectQueueItem({ queueItemId, userId, notes }),
    onSuccess: () => {
      toast.success("Email rejected");
      qc.invalidateQueries({ queryKey: ["email-intake-queue"] });
    },
    onError: (err) => toast.error(err?.message || "Failed to reject"),
  });

  const reassignMut = useMutation({
    mutationFn: ({ queueItemId, newType }) =>
      reassignType({ queueItemId, newType }),
    onSuccess: () => {
      toast.success("Type reassigned");
      qc.invalidateQueries({ queryKey: ["email-intake-queue"] });
    },
    onError: (err) => toast.error(err?.message || "Failed to reassign"),
  });

  const stageMut = useMutation({
    mutationFn: (rawEmail) => stageEmail({ projectId, sourceMailbox: "manual", rawEmail }),
    onSuccess: () => {
      toast.success("Email staged for review");
      qc.invalidateQueries({ queryKey: ["email-intake-queue"] });
      setShowManualEntry(false);
    },
    onError: (err) => toast.error(err?.message || "Failed to stage email"),
  });

  // ── Filtered items ───────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search.trim()) return queueItems;
    const q = search.toLowerCase();
    return queueItems.filter((item) =>
      (item.subject || "").toLowerCase().includes(q) ||
      (item.sender_address || "").toLowerCase().includes(q) ||
      (item.sender_name || "").toLowerCase().includes(q)
    );
  }, [queueItems, search]);

  // ── Stats ────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const pending = queueItems.filter((i) => i.status === "Pending").length;
    const approved = queueItems.filter((i) => i.status === "Approved").length;
    const rejected = queueItems.filter((i) => i.status === "Rejected").length;
    return { pending, approved, rejected, total: queueItems.length };
  }, [queueItems]);

  const handleApprove = useCallback(async (item) => {
    const user = await base44.auth.me();
    approveMut.mutate({
      queueItemId: item.id,
      recordType: item.detected_type === "Unknown" ? "Action Item" : item.detected_type,
      userId: user.id,
    });
  }, [approveMut]);

  const handleReject = useCallback(async (item) => {
    const user = await base44.auth.me();
    rejectMut.mutate({ queueItemId: item.id, userId: user.id });
  }, [rejectMut]);

  return (
    <div className="email-intake-page">
      <style>{emailIntakeStyles}</style>

      <CommandBar
        eyebrow="Communications"
        title="Email Intake"
        subtitle="Review and approve emails before creating project records"
      >
        <div className="ei-tab-bar">
          <button
            type="button"
            className={`ei-tab ${tab === "queue" ? "active" : ""}`}
            onClick={() => setTab("queue")}
          >
            <Mail size={14} /> Queue
          </button>
          <button
            type="button"
            className={`ei-tab ${tab === "settings" ? "active" : ""}`}
            onClick={() => setTab("settings")}
          >
            <Settings size={14} /> Settings
          </button>
        </div>
        {tab === "queue" && (
          <button
            type="button"
            className="ei-primary-btn"
            onClick={() => setShowManualEntry(true)}
          >
            <Plus size={14} /> Stage Email
          </button>
        )}
      </CommandBar>

      {tab === "queue" && (
        <>
          {/* KPI strip */}
          <div className="ei-kpi-strip">
            <div className="ei-kpi">
              <span className="ei-kpi-value" style={{ color: "var(--status-warning)" }}>{stats.pending}</span>
              <span className="ei-kpi-label">Pending</span>
            </div>
            <div className="ei-kpi">
              <span className="ei-kpi-value" style={{ color: "var(--status-success)" }}>{stats.approved}</span>
              <span className="ei-kpi-label">Approved</span>
            </div>
            <div className="ei-kpi">
              <span className="ei-kpi-value" style={{ color: "var(--status-error)" }}>{stats.rejected}</span>
              <span className="ei-kpi-label">Rejected</span>
            </div>
            <div className="ei-kpi">
              <span className="ei-kpi-value">{stats.total}</span>
              <span className="ei-kpi-label">Total</span>
            </div>
          </div>

          {/* Filters */}
          <div className="ei-filters">
            <label className="ei-search">
              <Search size={14} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by subject, sender..."
              />
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="ei-select"
            >
              <option value="All">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </select>
          </div>

          {/* Queue list */}
          {isLoading ? (
            <div className="ei-loading">Loading queue...</div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Mail}
              title="No emails in queue"
              description={statusFilter === "Pending"
                ? "No emails are waiting for review. Stage an email manually or configure a mailbox connection."
                : "No emails match the current filter."}
            />
          ) : (
            <div className="ei-queue-list">
              {filtered.map((item) => (
                <EmailQueueRow
                  key={item.id}
                  item={item}
                  expanded={expandedId === item.id}
                  onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  onApprove={() => handleApprove(item)}
                  onReject={() => handleReject(item)}
                  onReassign={(newType) => reassignMut.mutate({ queueItemId: item.id, newType })}
                />
              ))}
            </div>
          )}

          {/* Manual entry modal */}
          {showManualEntry && (
            <ManualEntryModal
              onClose={() => setShowManualEntry(false)}
              onSubmit={(raw) => stageMut.mutate(raw)}
              isLoading={stageMut.isPending}
            />
          )}
        </>
      )}

      {tab === "settings" && (
        <EmailSettingsPanel
          projectId={projectId}
          settings={settings}
          onRefresh={() => qc.invalidateQueries({ queryKey: ["email-integration-settings"] })}
        />
      )}
    </div>
  );
}

// ── Queue Row ──────────────────────────────────────────────────────────────

function EmailQueueRow({ item, expanded, onToggle, onApprove, onReject, onReassign }) {
  const TypeIcon = TYPE_ICONS[item.detected_type] || AlertCircle;
  const typeColor = TYPE_COLORS[item.detected_type] || "var(--text-muted)";
  const statusColor = STATUS_COLORS[item.status] || "var(--text-muted)";
  const attachmentCount = Array.isArray(item.attachments) ? item.attachments.length : 0;

  return (
    <div className={`ei-queue-row ${expanded ? "expanded" : ""}`}>
      <div className="ei-queue-row-main" onClick={onToggle}>
        <div className="ei-row-type-icon" style={{ color: typeColor }}>
          <TypeIcon size={18} />
        </div>
        <div className="ei-row-content">
          <div className="ei-row-subject">{item.subject || "(No subject)"}</div>
          <div className="ei-row-meta">
            <span>{item.sender_name || item.sender_address}</span>
            <span>{formatDate(item.received_at)} {formatTime(item.received_at)}</span>
            {attachmentCount > 0 && (
              <span className="ei-row-attachments">
                <Paperclip size={12} /> {attachmentCount}
              </span>
            )}
          </div>
        </div>
        <div className="ei-row-badges">
          <span className="ei-type-badge" style={{ borderColor: typeColor, color: typeColor }}>
            {item.detected_type}
          </span>
          <span className="ei-confidence-badge">
            {confidenceLabel(item.confidence)} ({Math.round((item.confidence || 0) * 100)}%)
          </span>
          <span className="ei-status-badge" style={{ color: statusColor }}>
            {item.status}
          </span>
        </div>
        <ChevronDown size={16} className={`ei-row-chevron ${expanded ? "rotated" : ""}`} />
      </div>

      {expanded && (
        <div className="ei-queue-row-detail">
          <div className="ei-detail-grid">
            <div className="ei-detail-section">
              <h4>Email Body</h4>
              <p className="ei-body-preview">
                {(item.body_text || "").slice(0, 500) || "(No body text)"}
                {(item.body_text || "").length > 500 && "..."}
              </p>
            </div>

            {attachmentCount > 0 && (
              <div className="ei-detail-section">
                <h4>Attachments</h4>
                <ul className="ei-attachment-list">
                  {item.attachments.map((att, idx) => (
                    <li key={idx}>
                      <Paperclip size={12} />
                      <span>{att.filename}</span>
                      {att.size_bytes > 0 && (
                        <small>({(att.size_bytes / 1024).toFixed(1)} KB)</small>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {item.classification_reason && (
              <div className="ei-detail-section">
                <h4>Classification Reason</h4>
                <p className="ei-classification-reason">{item.classification_reason}</p>
              </div>
            )}

            {item.created_record_id && (
              <div className="ei-detail-section">
                <h4>Created Record</h4>
                <p className="ei-created-record">
                  {item.created_record_type} record created ({item.created_record_id.slice(0, 8)}...)
                </p>
              </div>
            )}
          </div>

          {item.status === "Pending" && (
            <div className="ei-detail-actions">
              <select
                className="ei-select"
                value={item.detected_type}
                onChange={(e) => onReassign(e.target.value)}
              >
                {EMAIL_RECORD_TYPES.filter((t) => t !== "Unknown").map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <button type="button" className="ei-approve-btn" onClick={onApprove}>
                <Check size={14} /> Approve
              </button>
              <button type="button" className="ei-reject-btn" onClick={onReject}>
                <X size={14} /> Reject
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Manual Entry Modal ─────────────────────────────────────────────────────

function ManualEntryModal({ onClose, onSubmit, isLoading }) {
  const [subject, setSubject] = useState("");
  const [sender, setSender] = useState("");
  const [body, setBody] = useState("");
  const [messageId, setMessageId] = useState(() => `manual-${Date.now()}`);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!subject.trim()) {
      toast.error("Subject is required");
      return;
    }
    onSubmit({
      subject,
      sender_address: sender,
      body_text: body,
      source_message_id: messageId,
      date: new Date().toISOString(),
    });
  };

  return (
    <div className="ei-modal-backdrop" onClick={onClose}>
      <div className="ei-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Stage Email Manually</h2>
        <p className="ei-modal-desc">
          Paste email content to stage it for review and classification.
        </p>
        <form onSubmit={handleSubmit}>
          <label className="ei-field">
            <span>Subject *</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Email subject line" />
          </label>
          <label className="ei-field">
            <span>Sender</span>
            <input value={sender} onChange={(e) => setSender(e.target.value)} placeholder="sender@example.com" />
          </label>
          <label className="ei-field">
            <span>Body</span>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Email body text..." rows={6} />
          </label>
          <label className="ei-field">
            <span>Message ID</span>
            <input value={messageId} onChange={(e) => setMessageId(e.target.value)} placeholder="Unique message identifier" />
          </label>
          <div className="ei-modal-actions">
            <button type="button" className="ei-secondary-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="ei-primary-btn" disabled={isLoading}>
              {isLoading ? "Staging..." : "Stage for Review"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Settings Panel ─────────────────────────────────────────────────────────

function EmailSettingsPanel({ projectId, settings, onRefresh }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [mailbox, setMailbox] = useState("");
  const [provider, setProvider] = useState("outlook");
  const [autoClassify, setAutoClassify] = useState(true);
  const [defaultType, setDefaultType] = useState("Unknown");

  const saveMut = useMutation({
    mutationFn: () => upsertEmailSetting({
      projectId,
      mailboxAddress: mailbox,
      provider,
      isActive: true,
      autoClassify,
      defaultType,
      assignmentRules: [],
    }),
    onSuccess: () => {
      toast.success("Mailbox configuration saved");
      setShowAddForm(false);
      setMailbox("");
      onRefresh();
    },
    onError: (err) => toast.error(err?.message || "Failed to save settings"),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => deleteEmailSetting(id),
    onSuccess: () => {
      toast.success("Mailbox removed");
      onRefresh();
    },
    onError: (err) => toast.error(err?.message || "Failed to delete"),
  });

  return (
    <div className="ei-settings-panel">
      <div className="ei-settings-header">
        <div>
          <h2>Mailbox Connections</h2>
          <p>Configure which mailboxes to monitor for this project.</p>
        </div>
        <button type="button" className="ei-primary-btn" onClick={() => setShowAddForm(true)}>
          <Plus size={14} /> Add Mailbox
        </button>
      </div>

      {settings.length === 0 && !showAddForm ? (
        <EmptyState
          icon={Mail}
          title="No mailboxes configured"
          description="Add a mailbox to start monitoring for project-related emails."
        />
      ) : (
        <div className="ei-settings-list">
          {settings.map((s) => (
            <div key={s.id} className="ei-setting-card">
              <div className="ei-setting-info">
                <Mail size={16} />
                <div>
                  <strong>{s.mailbox_address}</strong>
                  <span>{EMAIL_PROVIDERS.find((p) => p.value === s.provider)?.label || s.provider}</span>
                </div>
              </div>
              <div className="ei-setting-badges">
                <span className={`ei-setting-status ${s.is_active ? "active" : "inactive"}`}>
                  {s.is_active ? "Active" : "Inactive"}
                </span>
                <span>Auto-classify: {s.auto_classify ? "On" : "Off"}</span>
              </div>
              <button
                type="button"
                className="ei-icon-btn danger"
                onClick={() => deleteMut.mutate(s.id)}
                title="Remove mailbox"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {showAddForm && (
        <div className="ei-add-form">
          <h3>Add Mailbox</h3>
          <label className="ei-field">
            <span>Mailbox Address *</span>
            <input value={mailbox} onChange={(e) => setMailbox(e.target.value)} placeholder="shared-inbox@company.com" />
          </label>
          <label className="ei-field">
            <span>Provider</span>
            <select value={provider} onChange={(e) => setProvider(e.target.value)} className="ei-select">
              {EMAIL_PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </label>
          <label className="ei-field ei-checkbox-field">
            <input type="checkbox" checked={autoClassify} onChange={(e) => setAutoClassify(e.target.checked)} />
            <span>Auto-classify incoming emails</span>
          </label>
          <label className="ei-field">
            <span>Default Type (when classification is uncertain)</span>
            <select value={defaultType} onChange={(e) => setDefaultType(e.target.value)} className="ei-select">
              {EMAIL_RECORD_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <div className="ei-modal-actions">
            <button type="button" className="ei-secondary-btn" onClick={() => setShowAddForm(false)}>Cancel</button>
            <button
              type="button"
              className="ei-primary-btn"
              onClick={() => saveMut.mutate()}
              disabled={!mailbox.trim() || saveMut.isPending}
            >
              {saveMut.isPending ? "Saving..." : "Save Mailbox"}
            </button>
          </div>
        </div>
      )}

      {/* Governance info */}
      <div className="ei-governance-note">
        <AlertCircle size={16} />
        <div>
          <strong>Governance</strong>
          <p>
            All emails are staged in the review queue before creating records.
            Source message IDs and attachment hashes are preserved for audit traceability.
            No records are created automatically without human approval.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const emailIntakeStyles = `
.email-intake-page {
  padding: 24px;
  background: var(--bg);
  color: var(--text-primary);
  min-height: 100vh;
}

/* Tab bar */
.ei-tab-bar {
  display: flex;
  gap: 4px;
  background: var(--bg-surface-low);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  padding: 3px;
}

.ei-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: all 0.15s;
}

.ei-tab.active {
  background: var(--bg-surface);
  color: var(--text-primary);
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}

/* Buttons */
.ei-primary-btn,
.ei-secondary-btn,
.ei-approve-btn,
.ei-reject-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 7px;
  border: 1px solid var(--border-default);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: all 0.15s;
}

.ei-primary-btn {
  background: var(--accent);
  border-color: var(--accent);
  color: #061018;
}

.ei-secondary-btn {
  background: var(--bg-surface);
  color: var(--text-primary);
}

.ei-approve-btn {
  background: color-mix(in srgb, var(--status-success) 15%, transparent);
  border-color: var(--status-success);
  color: var(--status-success);
}

.ei-reject-btn {
  background: color-mix(in srgb, var(--status-error) 15%, transparent);
  border-color: var(--status-error);
  color: var(--status-error);
}

.ei-icon-btn {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.ei-icon-btn.danger:hover {
  border-color: var(--status-error);
  color: var(--status-error);
}

/* KPI strip */
.ei-kpi-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}

.ei-kpi {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 14px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-surface);
}

.ei-kpi-value {
  font-family: var(--font-mono);
  font-size: 28px;
  font-weight: 800;
}

.ei-kpi-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

/* Filters */
.ei-filters {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}

.ei-search {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  min-height: 38px;
  border: 1px solid var(--border-default);
  border-radius: 7px;
  background: var(--bg-surface);
  color: var(--text-secondary);
}

.ei-search input {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
}

.ei-select {
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid var(--border-default);
  border-radius: 7px;
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 13px;
}

/* Queue list */
.ei-queue-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ei-queue-row {
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-surface);
  overflow: hidden;
  transition: border-color 0.15s;
}

.ei-queue-row:hover {
  border-color: var(--border-hover, var(--accent));
}

.ei-queue-row.expanded {
  border-color: var(--accent);
}

.ei-queue-row-main {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
}

.ei-row-type-icon {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: var(--bg-surface-low);
  flex-shrink: 0;
}

.ei-row-content {
  flex: 1;
  min-width: 0;
}

.ei-row-subject {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ei-row-meta {
  display: flex;
  gap: 12px;
  margin-top: 3px;
  font-size: 12px;
  color: var(--text-secondary);
}

.ei-row-attachments {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.ei-row-badges {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.ei-type-badge {
  padding: 3px 8px;
  border: 1px solid;
  border-radius: 999px;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.ei-confidence-badge {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
}

.ei-status-badge {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
}

.ei-row-chevron {
  color: var(--text-muted);
  transition: transform 0.2s;
  flex-shrink: 0;
}

.ei-row-chevron.rotated {
  transform: rotate(180deg);
}

/* Expanded detail */
.ei-queue-row-detail {
  padding: 0 16px 16px;
  border-top: 1px solid var(--border-default);
}

.ei-detail-grid {
  display: grid;
  gap: 14px;
  padding-top: 14px;
}

.ei-detail-section h4 {
  margin: 0 0 6px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.ei-body-preview {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
  white-space: pre-wrap;
  max-height: 200px;
  overflow-y: auto;
}

.ei-attachment-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ei-attachment-list li {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.ei-classification-reason,
.ei-created-record {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.ei-detail-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border-default);
}

/* Modal */
.ei-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0,0,0,0.6);
  display: grid;
  place-items: center;
  padding: 24px;
}

.ei-modal {
  width: 100%;
  max-width: 540px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 12px;
  padding: 24px;
  max-height: 90vh;
  overflow-y: auto;
}

.ei-modal h2 {
  margin: 0 0 6px;
  font-size: 20px;
}

.ei-modal-desc {
  margin: 0 0 18px;
  font-size: 13px;
  color: var(--text-secondary);
}

.ei-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}

.ei-field span {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.ei-field input,
.ei-field textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  background: var(--bg-surface-low);
  color: var(--text-primary);
  font-size: 13px;
  resize: vertical;
}

.ei-checkbox-field {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.ei-checkbox-field input[type="checkbox"] {
  width: 16px;
  height: 16px;
}

.ei-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

/* Settings */
.ei-settings-panel {
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-surface);
  padding: 20px;
}

.ei-settings-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 18px;
}

.ei-settings-header h2 {
  margin: 0 0 4px;
  font-size: 18px;
}

.ei-settings-header p {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.ei-settings-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 18px;
}

.ei-setting-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-surface-low);
}

.ei-setting-info {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.ei-setting-info strong {
  display: block;
  font-size: 13px;
}

.ei-setting-info span {
  font-size: 11px;
  color: var(--text-muted);
}

.ei-setting-badges {
  display: flex;
  gap: 10px;
  font-size: 11px;
  color: var(--text-secondary);
}

.ei-setting-status {
  padding: 2px 8px;
  border-radius: 999px;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
}

.ei-setting-status.active {
  background: color-mix(in srgb, var(--status-success) 15%, transparent);
  color: var(--status-success);
}

.ei-setting-status.inactive {
  background: color-mix(in srgb, var(--text-muted) 15%, transparent);
  color: var(--text-muted);
}

.ei-add-form {
  margin-top: 18px;
  padding: 18px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-surface-low);
}

.ei-add-form h3 {
  margin: 0 0 14px;
  font-size: 15px;
}

.ei-governance-note {
  display: flex;
  gap: 12px;
  margin-top: 24px;
  padding: 14px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-surface-low);
}

.ei-governance-note strong {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
}

.ei-governance-note p {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.ei-loading {
  text-align: center;
  padding: 40px;
  color: var(--text-muted);
}

@media (max-width: 820px) {
  .email-intake-page {
    padding: 16px;
  }
  .ei-kpi-strip {
    grid-template-columns: repeat(2, 1fr);
  }
  .ei-filters {
    flex-direction: column;
  }
  .ei-row-badges {
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
  }
}
`;
