/**
 * EmailAccountSettings.jsx — per-project email account management.
 *
 * Shows connected email accounts for the current project with controls
 * for adding new sources (manual forward or OAuth) and toggling state.
 * Designed to be embedded on the Integrations page or rendered as a
 * standalone settings drawer.
 */

import React, { useState } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { invalidateEntity } from "@/services/cacheRegistry";
import {
  Mail, Plus, Trash2, Power, PowerOff, Clock, Copy,
  Check, AlertTriangle,
} from "lucide-react";

// ── Time helper ────────────────────────────────────────────────────────
function timeAgo(dateStr) {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function EmailAccountSettings({ projectId }) {
  const qc = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [addType, setAddType] = useState("manual_forward");
  const [newEmail, setNewEmail] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [copiedUrl, setCopiedUrl] = useState(false);

  // ── Data ─────────────────────────────────────────────────────────────
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["email-accounts", projectId],
    queryFn: () => entities.EmailAccount.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  // ── Mutations ────────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: (data) => entities.EmailAccount.create(data),
    onSuccess: () => {
      invalidateEntity(qc, "email_account", projectId);
      toast.success("Email account added");
      setShowAddForm(false);
      setNewEmail("");
      setNewDisplayName("");
    },
    onError: (e) => toast.error("Failed: " + (e?.message || "Unknown error")),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => entities.EmailAccount.update(id, data),
    onSuccess: () => {
      invalidateEntity(qc, "email_account", projectId);
    },
    onError: (e) => toast.error("Update failed: " + (e?.message || "Unknown error")),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => entities.EmailAccount.delete(id),
    onSuccess: () => {
      invalidateEntity(qc, "email_account", projectId);
      toast.success("Email account removed");
    },
    onError: (e) => toast.error("Delete failed: " + (e?.message || "Unknown error")),
  });

  // ── Handlers ─────────────────────────────────────────────────────────
  const handleAdd = () => {
    if (!newEmail.trim()) {
      toast.error("Email address is required");
      return;
    }
    createMut.mutate({
      project_id: projectId,
      email_address: newEmail.trim(),
      display_name: newDisplayName.trim() || null,
      connection_type: addType,
      provider: "outlook",
      is_active: true,
    });
  };

  const handleToggleActive = (account) => {
    updateMut.mutate(
      { id: account.id, data: { is_active: !account.is_active } },
      { onSuccess: () => toast.success(account.is_active ? "Account deactivated" : "Account activated") }
    );
  };

  const handleDelete = (account) => {
    if (!window.confirm(`Remove ${account.email_address}?`)) return;
    deleteMut.mutate(account.id);
  };

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const webhookUrl = `${supabaseUrl}/functions/v1/email-ingest/${projectId}`;

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(webhookUrl).then(() => {
      setCopiedUrl(true);
      toast.success("Webhook URL copied");
      setTimeout(() => setCopiedUrl(false), 2000);
    });
  };

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-default)",
      borderRadius: 10,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 18px",
        borderBottom: "1px solid var(--border-default)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Mail size={16} strokeWidth={1.75} style={{ color: "var(--accent)" }} />
          <h3 style={{
            fontFamily: "var(--font-display)",
            fontSize: 14,
            fontWeight: 700,
            color: "var(--text-primary)",
            margin: 0,
          }}>
            Email Accounts
          </h3>
        </div>
        <button
          onClick={() => setShowAddForm((v) => !v)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "5px 10px",
            background: "var(--accent-muted)",
            border: "1px solid var(--accent-border)",
            borderRadius: 6,
            fontFamily: "var(--font-body)",
            fontSize: 11,
            fontWeight: 600,
            color: "var(--accent)",
            cursor: "pointer",
          }}
        >
          <Plus size={12} />
          Add Email Source
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div style={{
          padding: "14px 18px",
          borderBottom: "1px solid var(--border-default)",
          background: "var(--bg-surface-low)",
        }}>
          {/* Connection type selector */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            <TypeButton
              label="Manual Forward"
              active={addType === "manual_forward"}
              onClick={() => setAddType("manual_forward")}
            />
            <TypeButton
              label="Power Automate"
              active={addType === "power_automate"}
              onClick={() => setAddType("power_automate")}
            />
            <TypeButton
              label="Outlook OAuth"
              active={addType === "oauth"}
              onClick={() => setAddType("oauth")}
              disabled
              tooltip="Coming Soon — requires Azure AD app registration"
            />
          </div>

          {/* ── Manual Forward ──────────────────────────────────────── */}
          {addType === "manual_forward" && (
            <>
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Email Address</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="inbox@yourproject.com"
                  style={inputStyle}
                />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Display Name (optional)</label>
                <input
                  type="text"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  placeholder="Project Inbox"
                  style={inputStyle}
                />
              </div>

              {/* Webhook URL */}
              <WebhookUrlBlock webhookUrl={webhookUrl} copiedUrl={copiedUrl} onCopy={handleCopyUrl} />
              <p style={hintTextStyle}>
                Set up an Outlook rule to auto-forward project emails to this URL.
                Forwarded emails will appear in the Email Inbox for review.
              </p>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 10 }}>
                <button onClick={() => setShowAddForm(false)} style={secondaryBtnStyle}>Cancel</button>
                <button onClick={handleAdd} disabled={createMut.isPending} style={primaryBtnStyle}>
                  {createMut.isPending ? "Adding..." : "Add Account"}
                </button>
              </div>
            </>
          )}

          {/* ── Power Automate ──────────────────────────────────────── */}
          {addType === "power_automate" && (
            <>
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Shared Mailbox Address</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="projects@shsteelaz.com"
                  style={inputStyle}
                />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Display Name (optional)</label>
                <input
                  type="text"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  placeholder="SHS Steel Projects"
                  style={inputStyle}
                />
              </div>

              {/* Webhook URL */}
              <WebhookUrlBlock webhookUrl={webhookUrl} copiedUrl={copiedUrl} onCopy={handleCopyUrl} />

              {/* Setup guide */}
              <div style={{
                marginTop: 10, padding: "10px 12px",
                background: "color-mix(in srgb, var(--info) 6%, transparent)",
                border: "1px solid color-mix(in srgb, var(--info) 20%, transparent)",
                borderRadius: 8,
              }}>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                  letterSpacing: "0.1em", textTransform: "uppercase",
                  color: "var(--info)", marginBottom: 6,
                }}>
                  Power Automate Setup
                </div>
                <ol style={{
                  fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)",
                  lineHeight: 1.6, margin: 0, paddingLeft: 18,
                }}>
                  <li>Open <strong>Power Automate</strong> in Microsoft 365.</li>
                  <li>Create a new <strong>Automated cloud flow</strong>.</li>
                  <li>Trigger: <em>When a new email arrives</em> (Office 365 Outlook).</li>
                  <li>Set the shared mailbox or folder to monitor.</li>
                  <li>Add an action: <strong>HTTP — POST</strong> to the webhook URL above.</li>
                  <li>Set header: <code style={{ fontSize: 10 }}>x-webhook-secret</code> = your EMAIL_WEBHOOK_SECRET.</li>
                  <li>Body (JSON): include <code style={{ fontSize: 10 }}>subject</code>, <code style={{ fontSize: 10 }}>from</code>, <code style={{ fontSize: 10 }}>toRecipients</code>, <code style={{ fontSize: 10 }}>body</code>, <code style={{ fontSize: 10 }}>receivedDateTime</code>, <code style={{ fontSize: 10 }}>internetMessageId</code>, and <code style={{ fontSize: 10 }}>attachments</code> from the trigger output.</li>
                  <li>Save and test — emails will appear in the Email Inbox.</li>
                </ol>
                <p style={{
                  fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-muted)",
                  margin: "8px 0 0", lineHeight: 1.4,
                }}>
                  The ingestion endpoint supports Microsoft Graph / Power Automate nested formats natively —
                  including nested <code style={{ fontSize: 9 }}>emailAddress</code> objects and base64 <code style={{ fontSize: 9 }}>contentBytes</code> attachments.
                </p>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 10 }}>
                <button onClick={() => setShowAddForm(false)} style={secondaryBtnStyle}>Cancel</button>
                <button
                  onClick={() => {
                    if (!newEmail.trim()) { toast.error("Email address is required"); return; }
                    createMut.mutate({
                      project_id: projectId,
                      email_address: newEmail.trim(),
                      display_name: newDisplayName.trim() || null,
                      connection_type: "power_automate",
                      provider: "outlook",
                      is_active: true,
                    });
                  }}
                  disabled={createMut.isPending}
                  style={primaryBtnStyle}
                >
                  {createMut.isPending ? "Adding..." : "Add Account"}
                </button>
              </div>
            </>
          )}

          {/* ── Outlook OAuth (disabled) ────────────────────────────── */}
          {addType === "oauth" && (
            <div style={{
              padding: 20, textAlign: "center", color: "var(--text-muted)",
              fontFamily: "var(--font-body)", fontSize: 12, lineHeight: 1.5,
            }}>
              <AlertTriangle size={20} strokeWidth={1.5} style={{ marginBottom: 8, color: "var(--warning)" }} />
              <br />
              Direct Outlook OAuth connection requires Azure AD app registration.
              <br />
              Use <strong>Power Automate</strong> for the fastest path to live email ingestion.
            </div>
          )}
        </div>
      )}

      {/* Account list */}
      <div style={{ padding: accounts.length > 0 ? 0 : "20px 18px" }}>
        {isLoading ? (
          <div style={{
            textAlign: "center",
            padding: 20,
            color: "var(--text-muted)",
            fontFamily: "var(--font-body)",
            fontSize: 12,
          }}>
            Loading accounts...
          </div>
        ) : accounts.length === 0 ? (
          <div style={{
            textAlign: "center",
            color: "var(--text-muted)",
            fontFamily: "var(--font-body)",
            fontSize: 12,
          }}>
            No email accounts connected. Click "Add Email Source" to get started.
          </div>
        ) : (
          accounts.map((account, idx) => (
            <div
              key={account.id}
              style={{
                padding: "12px 18px",
                borderBottom: idx < accounts.length - 1 ? "1px solid var(--border-default)" : "none",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              {/* Status indicator */}
              <div style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: account.is_active ? "var(--success)" : "var(--text-muted)",
                flexShrink: 0,
                boxShadow: account.is_active ? "0 0 6px var(--success)" : "none",
              }} />

              {/* Account info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}>
                  {account.display_name || account.email_address}
                </div>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 2,
                }}>
                  {account.display_name && (
                    <span style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: "var(--text-muted)",
                    }}>
                      {account.email_address}
                    </span>
                  )}
                  <span style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    padding: "1px 5px",
                    background: "var(--bg-surface-low)",
                    borderRadius: 3,
                  }}>
                    {account.connection_type === "manual_forward" ? "Forward" : account.connection_type === "power_automate" ? "Power Automate" : "OAuth"}
                  </span>
                  <span style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    color: "var(--text-muted)",
                  }}>
                    <Clock size={9} strokeWidth={2} />
                    {timeAgo(account.last_sync_at)}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <button
                  onClick={() => handleToggleActive(account)}
                  title={account.is_active ? "Deactivate" : "Activate"}
                  style={iconBtnStyle}
                >
                  {account.is_active
                    ? <Power size={14} strokeWidth={2} style={{ color: "var(--success)" }} />
                    : <PowerOff size={14} strokeWidth={2} style={{ color: "var(--text-muted)" }} />
                  }
                </button>
                <button
                  onClick={() => handleDelete(account)}
                  title="Remove account"
                  style={iconBtnStyle}
                >
                  <Trash2 size={14} strokeWidth={2} style={{ color: "var(--status-error)" }} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────

function TypeButton({ label, active, onClick, disabled, tooltip }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled ? tooltip : undefined}
      style={{
        flex: 1,
        padding: "7px 0",
        background: active ? "var(--accent-muted)" : "var(--bg-surface)",
        border: `1px solid ${active ? "var(--accent-border)" : "var(--border-default)"}`,
        borderRadius: 6,
        fontFamily: "var(--font-body)",
        fontSize: 11,
        fontWeight: active ? 600 : 400,
        color: active ? "var(--accent)" : disabled ? "var(--text-muted)" : "var(--text-secondary)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        transition: "all 120ms",
      }}
    >
      {label}
    </button>
  );
}

// ── Webhook URL block (shared between manual forward and Power Automate) ──

function WebhookUrlBlock({ webhookUrl, copiedUrl, onCopy }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <label style={labelStyle}>Webhook URL</label>
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "6px 10px", background: "var(--bg-surface)",
        border: "1px solid var(--border-default)", borderRadius: 8,
      }}>
        <code style={{
          flex: 1, fontFamily: "var(--font-mono)", fontSize: 10,
          color: "var(--text-secondary)", overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {webhookUrl}
        </code>
        <button
          onClick={onCopy} title="Copy URL"
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: copiedUrl ? "var(--success)" : "var(--text-muted)",
            padding: 2, flexShrink: 0,
          }}
        >
          {copiedUrl ? <Check size={12} /> : <Copy size={12} />}
        </button>
      </div>
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────

const hintTextStyle = {
  fontFamily: "var(--font-body)",
  fontSize: 10,
  color: "var(--text-muted)",
  margin: "4px 0 0",
  lineHeight: 1.4,
};

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
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  fontFamily: "var(--font-body)",
  fontSize: 12,
  color: "var(--text-primary)",
  outline: "none",
  boxSizing: "border-box",
};

const primaryBtnStyle = {
  padding: "7px 14px",
  background: "var(--accent)",
  border: "1px solid var(--accent-border)",
  borderRadius: 6,
  fontFamily: "var(--font-body)",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-on-accent, #fff)",
  cursor: "pointer",
};

const secondaryBtnStyle = {
  padding: "7px 14px",
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: 6,
  fontFamily: "var(--font-body)",
  fontSize: 11,
  fontWeight: 500,
  color: "var(--text-secondary)",
  cursor: "pointer",
};

const iconBtnStyle = {
  width: 30,
  height: 30,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "none",
  border: "1px solid transparent",
  borderRadius: 6,
  cursor: "pointer",
  transition: "all 120ms",
};
