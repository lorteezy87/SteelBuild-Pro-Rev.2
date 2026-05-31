import React, { useState, useMemo } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CommandBar, KpiTile } from "@/components/design-system";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import AdminRoute from "../components/shared/AdminRoute";
import LoadingSkeleton from "../components/shared/LoadingSkeleton";
import DeleteDialog from "../components/shared/DeleteDialog";
import { RefreshCw, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

/**
 * FeatureFlagsAdmin
 *
 * Admin-only UI for the feature_flags table (migration 078). Lets a sole
 * admin toggle global flags, edit descriptions, and add per-email overrides
 * for opt-in betas without flipping the global flag.
 *
 * Writes go straight through `entities.FeatureFlag` — RLS is
 * permissive on writes for authenticated users, so the only thing keeping a
 * non-admin out of this surface is the AdminRoute wrap below.
 */

// ── small style helpers (mirrors UsersManagement.jsx idiom) ─────────
const inputStyle = {
  background: "var(--bg-surface-low)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  padding: "7px 10px",
  fontSize: 12,
  color: "var(--text-primary)",
  outline: "none",
  fontFamily: "var(--font-body)",
};

const cellLabelStyle = {
  color: "var(--text-primary)",
  fontWeight: 700,
  fontSize: 11,
  letterSpacing: "0.05em",
};

// Coerce whatever's in user_overrides into a clean { email: boolean } map.
function coerceOverrides(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "boolean" && typeof k === "string" && k.length > 0) {
      out[k.toLowerCase()] = v;
    }
  }
  return out;
}

function FeatureFlagsAdminContent() {
  const qc = useQueryClient();
  const [newFlag, setNewFlag] = useState({ flag_key: "", description: "", enabled: false });
  const [overrideDrafts, setOverrideDrafts] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: flags = [], isLoading, refetch } = useQuery({
    queryKey: ["feature_flags_admin"],
    queryFn: () => entities.FeatureFlag.list("flag_key"),
    staleTime: 30 * 1000,
  });

  const enabledCount = useMemo(() => flags.filter((f) => f.enabled).length, [flags]);
  const overrideCount = useMemo(
    () => flags.reduce((sum, f) => sum + Object.keys(coerceOverrides(f.user_overrides)).length, 0),
    [flags],
  );

  const invalidate = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ["feature_flags_admin"] });
    qc.invalidateQueries({ queryKey: ["feature_flags"] });
  }, [qc]);

  const updateMut = useMutation({
    mutationFn: ({ id, updates }) => entities.FeatureFlag.update(id, updates),
    onSuccess: () => invalidate(),
    onError: (err) => toast.error(err?.message || "Failed to update flag"),
  });

  const createMut = useMutation({
    mutationFn: (record) => entities.FeatureFlag.create(record),
    onSuccess: () => {
      invalidate();
      setNewFlag({ flag_key: "", description: "", enabled: false });
      toast.success("Flag created");
    },
    onError: (err) => toast.error(err?.message || "Failed to create flag"),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => entities.FeatureFlag.delete(id),
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
      toast.success("Flag deleted");
    },
    onError: (err) => toast.error(err?.message || "Failed to delete flag"),
  });

  const handleToggleEnabled = (flag) => {
    updateMut.mutate({ id: flag.id, updates: { enabled: !flag.enabled } });
  };

  const handleDescriptionBlur = (flag, nextDescription) => {
    if ((flag.description || "") === (nextDescription || "")) return;
    updateMut.mutate({ id: flag.id, updates: { description: nextDescription || null } });
  };

  const handleAddOverride = (flag) => {
    const draft = overrideDrafts[flag.id] || { email: "", enabled: true };
    const email = (draft.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      toast.error("Enter a valid email");
      return;
    }
    const overrides = { ...coerceOverrides(flag.user_overrides), [email]: !!draft.enabled };
    updateMut.mutate(
      { id: flag.id, updates: { user_overrides: overrides } },
      {
        onSuccess: () => {
          setOverrideDrafts((d) => ({ ...d, [flag.id]: { email: "", enabled: true } }));
        },
      },
    );
  };

  const handleRemoveOverride = (flag, email) => {
    const overrides = { ...coerceOverrides(flag.user_overrides) };
    delete overrides[email];
    updateMut.mutate({ id: flag.id, updates: { user_overrides: overrides } });
  };

  const handleCreateFlag = () => {
    const key = (newFlag.flag_key || "").trim();
    if (!key) {
      toast.error("flag_key is required");
      return;
    }
    if (!/^[a-z0-9_]+$/.test(key)) {
      toast.error("flag_key must be lowercase letters, numbers, and underscores");
      return;
    }
    createMut.mutate({
      flag_key: key,
      description: newFlag.description?.trim() || null,
      enabled: !!newFlag.enabled,
      user_overrides: {},
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <CommandBar
        eyebrow="ADMIN · WORKSPACE"
        title="Feature Flags"
        count={flags.length}
        unit=" · FLAGS"
        subtitle={`${enabledCount} enabled · ${overrideCount} per-user override${overrideCount === 1 ? "" : "s"}`}
      >
        <button
          onClick={refetch}
          title="Refresh"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "var(--bg-surface)", border: "1px solid var(--border-default)",
            color: "var(--text-secondary)", borderRadius: "var(--radius-btn)",
            padding: "8px 12px", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
            letterSpacing: "0.08em", cursor: "pointer", textTransform: "uppercase",
          }}
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </CommandBar>

      {!isLoading && flags.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
          <KpiTile compact label="Total"      value={flags.length}    color="var(--accent)" />
          <KpiTile compact label="Enabled"    value={enabledCount}    color="var(--phase-fabrication)" />
          <KpiTile compact label="Overrides"  value={overrideCount}   color="var(--phase-detailing)" />
        </div>
      )}

      {/* New-flag form */}
      <div style={{
        background: "var(--bg-surface-low)",
        border: "1px solid var(--border-default)",
        borderRadius: 12,
        padding: 14,
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
        alignItems: "center",
      }}>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
          letterSpacing: "0.08em", color: "var(--text-muted)", textTransform: "uppercase",
        }}>
          New flag
        </span>
        <input
          type="text"
          placeholder="flag_key (e.g. new_dashboard)"
          value={newFlag.flag_key}
          onChange={(e) => setNewFlag((f) => ({ ...f, flag_key: e.target.value }))}
          style={{ ...inputStyle, minWidth: 220 }}
        />
        <input
          type="text"
          placeholder="Description (optional)"
          value={newFlag.description}
          onChange={(e) => setNewFlag((f) => ({ ...f, description: e.target.value }))}
          style={{ ...inputStyle, flex: 1, minWidth: 220 }}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)" }}>
          <input
            type="checkbox"
            checked={newFlag.enabled}
            onChange={(e) => setNewFlag((f) => ({ ...f, enabled: e.target.checked }))}
          />
          Enabled
        </label>
        <Button onClick={handleCreateFlag} disabled={createMut.isPending}>
          <Plus size={14} style={{ marginRight: 4 }} />
          Add flag
        </Button>
      </div>

      {/* Flags table */}
      <div style={{ background: "var(--bg-surface-low)", border: "1px solid var(--border-default)", borderRadius: 12, overflow: "hidden" }}>
        <Table>
          <TableHeader>
            <TableRow style={{ background: "var(--bg-surface-low)", borderBottom: "1px solid var(--border-default)" }}>
              <TableHead style={cellLabelStyle}>Key</TableHead>
              <TableHead style={cellLabelStyle}>Description</TableHead>
              <TableHead style={cellLabelStyle}>Enabled</TableHead>
              <TableHead style={cellLabelStyle}>Per-user overrides</TableHead>
              <TableHead style={cellLabelStyle}>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} style={{ padding: 0 }}>
                  <LoadingSkeleton variant="table" rows={4} />
                </TableCell>
              </TableRow>
            ) : flags.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} style={{ textAlign: "center", padding: 24, color: "var(--text-muted)" }}>
                  No feature flags yet. Add one above.
                </TableCell>
              </TableRow>
            ) : (
              flags.map((flag) => {
                const overrides = coerceOverrides(flag.user_overrides);
                const draft = overrideDrafts[flag.id] || { email: "", enabled: true };
                return (
                  <TableRow key={flag.id} style={{ borderBottom: "1px solid var(--border-default)" }}>
                    <TableCell style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-primary)" }}>
                      {flag.flag_key}
                    </TableCell>
                    <TableCell>
                      <input
                        type="text"
                        defaultValue={flag.description || ""}
                        onBlur={(e) => handleDescriptionBlur(flag, e.target.value)}
                        placeholder="Describe what this flag controls"
                        style={{ ...inputStyle, width: "100%" }}
                      />
                    </TableCell>
                    <TableCell>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={!!flag.enabled}
                          onChange={() => handleToggleEnabled(flag)}
                        />
                        <span style={{
                          fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
                          color: flag.enabled ? "var(--phase-fabrication)" : "var(--text-muted)",
                          textTransform: "uppercase", letterSpacing: "0.08em",
                        }}>
                          {flag.enabled ? "On" : "Off"}
                        </span>
                      </label>
                    </TableCell>
                    <TableCell>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 280 }}>
                        {Object.keys(overrides).length === 0 ? (
                          <span style={{ color: "var(--text-muted)", fontSize: 11 }}>None</span>
                        ) : (
                          Object.entries(overrides).map(([email, value]) => (
                            <div key={email} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                              <span style={{ fontFamily: "var(--font-mono)" }}>{email}</span>
                              <span style={{
                                fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
                                color: value ? "var(--phase-fabrication)" : "var(--text-muted)",
                                textTransform: "uppercase", letterSpacing: "0.08em",
                              }}>
                                {value ? "On" : "Off"}
                              </span>
                              <button
                                onClick={() => handleRemoveOverride(flag, email)}
                                title="Remove override"
                                style={{
                                  background: "none", border: "none", cursor: "pointer",
                                  color: "var(--text-muted)", display: "inline-flex", alignItems: "center", padding: 2,
                                }}
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ))
                        )}
                        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
                          <input
                            type="email"
                            placeholder="user@example.com"
                            value={draft.email}
                            onChange={(e) =>
                              setOverrideDrafts((d) => ({
                                ...d,
                                [flag.id]: { ...draft, email: e.target.value },
                              }))
                            }
                            style={{ ...inputStyle, flex: 1, minWidth: 160 }}
                          />
                          <select
                            value={draft.enabled ? "on" : "off"}
                            onChange={(e) =>
                              setOverrideDrafts((d) => ({
                                ...d,
                                [flag.id]: { ...draft, enabled: e.target.value === "on" },
                              }))
                            }
                            style={{ ...inputStyle, padding: "7px 8px" }}
                          >
                            <option value="on">On</option>
                            <option value="off">Off</option>
                          </select>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleAddOverride(flag)}
                            disabled={updateMut.isPending}
                          >
                            Add
                          </Button>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => setDeleteTarget(flag)}
                        title="Delete flag"
                        style={{
                          background: "none", border: "1px solid var(--border-default)",
                          color: "var(--danger)",
                          borderRadius: "var(--radius-btn)", padding: "6px 10px",
                          cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4,
                          fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
                          letterSpacing: "0.08em", textTransform: "uppercase",
                        }}
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
        title="Delete feature flag"
        description={`Delete the flag "${deleteTarget?.flag_key}"? Any UI gated on this key will fall back to its default (off). This cannot be undone.`}
      />
    </div>
  );
}

export default function FeatureFlagsAdmin() {
  return (
    <AdminRoute>
      <FeatureFlagsAdminContent />
    </AdminRoute>
  );
}
