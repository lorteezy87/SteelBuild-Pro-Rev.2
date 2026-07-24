/**
 * DocumentStorageSettings.jsx -- per-project linked folder management.
 *
 * Shows connected external folders (SharePoint, OneDrive) for the current
 * project with controls for adding, syncing, toggling, and removing
 * folder connections. Designed to be embedded on the Integrations page
 * or rendered as a standalone settings drawer.
 */

import React, { useState } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { invalidateEntity } from "@/services/cacheRegistry";
import {
  FolderOpen, Plus, Trash2, Power, PowerOff, Clock, RefreshCw,
} from "lucide-react";

// ── Provider config ───────────────────────────────────────────────────
const PROVIDERS = [
  { value: "sharepoint", label: "SharePoint", enabled: true },
  { value: "onedrive",   label: "OneDrive",   enabled: true },
  { value: "google_drive", label: "Google Drive", enabled: false, tooltip: "Coming soon" },
  { value: "dropbox",    label: "Dropbox",     enabled: false, tooltip: "Coming soon" },
];

const SYNC_FREQUENCIES = [
  { value: "manual",  label: "Manual" },
  { value: "hourly",  label: "Hourly" },
  { value: "daily",   label: "Daily" },
];

// ── Time helper ───────────────────────────────────────────────────────
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

// ── Sync status badge ─────────────────────────────────────────────────
function syncStatusColor(status) {
  switch (status) {
    case "success": return "var(--success)";
    case "error":   return "var(--status-error)";
    case "pending": return "var(--warning)";
    default:        return "var(--text-muted)";
  }
}

function syncStatusLabel(status) {
  switch (status) {
    case "success": return "Synced";
    case "error":   return "Error";
    case "pending": return "Pending";
    case "unavailable": return "Unavailable";
    default:        return "Never";
  }
}

export default function DocumentStorageSettings({ projectId }) {
  const qc = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [provider, setProvider] = useState("sharepoint");
  const [folderName, setFolderName] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [syncFrequency, setSyncFrequency] = useState("daily");

  // ── Data ────────────────────────────────────────────────────────────
  const { data: folders = [], isLoading } = useQuery({
    queryKey: ["linked-folders", projectId],
    queryFn: () => entities.LinkedFolder.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  // ── Mutations ───────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: (data) => entities.LinkedFolder.create(data),
    onSuccess: () => {
      invalidateEntity(qc, "linked_folder", projectId);
      toast.success("Folder linked successfully");
      resetForm();
    },
    onError: (e) => toast.error("Failed: " + (e?.message || "Unknown error")),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => entities.LinkedFolder.update(id, data),
    onSuccess: () => {
      invalidateEntity(qc, "linked_folder", projectId);
    },
    onError: (e) => toast.error("Update failed: " + (e?.message || "Unknown error")),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => entities.LinkedFolder.delete(id),
    onSuccess: () => {
      invalidateEntity(qc, "linked_folder", projectId);
      toast.success("Folder unlinked");
    },
    onError: (e) => toast.error("Delete failed: " + (e?.message || "Unknown error")),
  });

  // ── Handlers ────────────────────────────────────────────────────────
  const resetForm = () => {
    setShowAddForm(false);
    setProvider("sharepoint");
    setFolderName("");
    setFolderPath("");
    setTenantId("");
    setSyncFrequency("daily");
  };

  const handleAdd = () => {
    if (!folderName.trim()) {
      toast.error("Folder name is required");
      return;
    }
    if (!folderPath.trim()) {
      toast.error("Folder path is required");
      return;
    }
    const needsTenant = provider === "sharepoint" || provider === "onedrive";
    if (needsTenant && !tenantId.trim()) {
      toast.error("Tenant ID is required for " + (provider === "sharepoint" ? "SharePoint" : "OneDrive"));
      return;
    }

    createMut.mutate({
      project_id: projectId,
      provider,
      folder_name: folderName.trim(),
      folder_path: folderPath.trim(),
      tenant_id: needsTenant ? tenantId.trim() : null,
      sync_enabled: true,
      sync_frequency: syncFrequency,
      is_active: true,
      is_deleted: false,
    });
  };

  const handleSyncNow = (folder) => {
    toast.message(
      "SharePoint / OneDrive sync is not connected yet. Folder links are saved for setup, but Sync Now does not transfer files until the connector is deployed.",
    );
    updateMut.mutate(
      {
        id: folder.id,
        data: {
          last_sync_status: "unavailable",
          last_sync_at: new Date().toISOString(),
        },
      },
    );
  };

  const handleToggleActive = (folder) => {
    updateMut.mutate(
      { id: folder.id, data: { is_active: !folder.is_active } },
      {
        onSuccess: () =>
          toast.success(folder.is_active ? "Folder deactivated" : "Folder activated"),
      }
    );
  };

  const handleDelete = (folder) => {
    if (!window.confirm(`Unlink "${folder.folder_name}"? This will not delete files from the external provider.`)) return;
    deleteMut.mutate(folder.id);
  };

  const showTenantField = provider === "sharepoint" || provider === "onedrive";

  // ── Render ──────────────────────────────────────────────────────────
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
          <FolderOpen size={16} strokeWidth={1.75} style={{ color: "var(--accent)" }} />
          <h3 style={{
            fontFamily: "var(--font-display)",
            fontSize: 14,
            fontWeight: 700,
            color: "var(--text-primary)",
            margin: 0,
          }}>
            Linked Folders
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
          Link Folder
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div style={{
          padding: "14px 18px",
          borderBottom: "1px solid var(--border-default)",
          background: "var(--bg-surface-low)",
        }}>
          {/* Provider selector */}
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Provider</label>
            <div style={{ display: "flex", gap: 6 }}>
              {PROVIDERS.map((p) => (
                <ProviderButton
                  key={p.value}
                  label={p.label}
                  active={provider === p.value}
                  onClick={() => setProvider(p.value)}
                  disabled={!p.enabled}
                  tooltip={p.tooltip}
                />
              ))}
            </div>
          </div>

          {/* Folder name */}
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Folder Name</label>
            <input
              type="text"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="e.g. Project Drawings"
              style={inputStyle}
            />
          </div>

          {/* Folder path */}
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Folder Path</label>
            <input
              type="text"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              placeholder="/sites/ProjectX/Shared Documents/Drawings"
              style={inputStyle}
            />
          </div>

          {/* Tenant ID -- only for SharePoint / OneDrive */}
          {showTenantField && (
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>Azure AD Tenant ID</label>
              <input
                type="text"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                style={inputStyle}
              />
              <p style={{
                fontFamily: "var(--font-body)",
                fontSize: 10,
                color: "var(--text-muted)",
                margin: "4px 0 0",
                lineHeight: 1.4,
              }}>
                Found in Azure Active Directory &gt; Properties &gt; Tenant ID.
              </p>
            </div>
          )}

          {/* Sync frequency */}
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Sync Frequency</label>
            <div style={{ display: "flex", gap: 6 }}>
              {SYNC_FREQUENCIES.map((f) => (
                <ProviderButton
                  key={f.value}
                  label={f.label}
                  active={syncFrequency === f.value}
                  onClick={() => setSyncFrequency(f.value)}
                />
              ))}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
            <button onClick={resetForm} style={secondaryBtnStyle}>Cancel</button>
            <button onClick={handleAdd} disabled={createMut.isPending} style={primaryBtnStyle}>
              {createMut.isPending ? "Linking..." : "Add Folder"}
            </button>
          </div>
        </div>
      )}

      {/* Folder list */}
      <div style={{ padding: folders.length > 0 ? 0 : "20px 18px" }}>
        {isLoading ? (
          <div style={{
            textAlign: "center",
            padding: 20,
            color: "var(--text-muted)",
            fontFamily: "var(--font-body)",
            fontSize: 12,
          }}>
            Loading linked folders...
          </div>
        ) : folders.length === 0 ? (
          <div style={{
            textAlign: "center",
            color: "var(--text-muted)",
            fontFamily: "var(--font-body)",
            fontSize: 12,
          }}>
            No folders linked. Click "Link Folder" to connect an external document folder.
          </div>
        ) : (
          folders.map((folder, idx) => (
            <div
              key={folder.id}
              style={{
                padding: "12px 18px",
                borderBottom: idx < folders.length - 1 ? "1px solid var(--border-default)" : "none",
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
                background: folder.is_active ? "var(--success)" : "var(--text-muted)",
                flexShrink: 0,
                boxShadow: folder.is_active ? "0 0 6px var(--success)" : "none",
              }} />

              {/* Folder info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}>
                  {folder.folder_name}
                </div>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 2,
                  flexWrap: "wrap",
                }}>
                  {/* Provider badge */}
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
                    {PROVIDERS.find((p) => p.value === folder.provider)?.label || folder.provider}
                  </span>

                  {/* Path */}
                  <span style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--text-muted)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 220,
                  }}>
                    {folder.folder_path}
                  </span>

                  {/* Last sync time */}
                  <span style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    color: "var(--text-muted)",
                  }}>
                    <Clock size={9} strokeWidth={2} />
                    {timeAgo(folder.last_sync_at)}
                  </span>

                  {/* Sync status badge */}
                  <span style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    fontWeight: 600,
                    color: syncStatusColor(folder.last_sync_status),
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    padding: "1px 5px",
                    background: "var(--bg-surface-low)",
                    borderRadius: 3,
                  }}>
                    {syncStatusLabel(folder.last_sync_status)}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <button
                  onClick={() => handleSyncNow(folder)}
                  title="Not connected — sync is unavailable until the SharePoint connector is deployed"
                  disabled={updateMut.isPending}
                  aria-label="Sync unavailable"
                  style={iconBtnStyle}
                >
                  <RefreshCw size={14} strokeWidth={2} style={{ color: "var(--text-muted)" }} />
                </button>
                <button
                  onClick={() => handleToggleActive(folder)}
                  title={folder.is_active ? "Deactivate" : "Activate"}
                  style={iconBtnStyle}
                >
                  {folder.is_active
                    ? <Power size={14} strokeWidth={2} style={{ color: "var(--success)" }} />
                    : <PowerOff size={14} strokeWidth={2} style={{ color: "var(--text-muted)" }} />
                  }
                </button>
                <button
                  onClick={() => handleDelete(folder)}
                  title="Unlink folder"
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

function ProviderButton({ label, active, onClick, disabled, tooltip }) {
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
