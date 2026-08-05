/**
 * Presentational pieces + style tokens for FeatureFlagsAdmin.
 * Page keeps queries/mutations; this file is pure JSX + props.
 */
// @ts-nocheck
import type { CSSProperties } from "react";
import React from "react";
import { CommandBar, KpiTile } from "@/components/design-system";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { RefreshCw, Plus, Trash2, X } from "lucide-react";
import {
  coerceOverrides,
  createEmptyOverrideDraft,
} from "./featureFlagsPageHelpers";

export const featureFlagsInputStyle: CSSProperties = {
  background: "var(--bg-surface-low)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  padding: "7px 10px",
  fontSize: 12,
  color: "var(--text-primary)",
  outline: "none",
  fontFamily: "var(--font-body)",
};

export const featureFlagsCellLabelStyle: CSSProperties = {
  color: "var(--text-primary)",
  fontWeight: 700,
  fontSize: 11,
  letterSpacing: "0.05em",
};

const inputStyle = featureFlagsInputStyle;
const cellLabelStyle = featureFlagsCellLabelStyle;

export function FeatureFlagsKpiStrip({
  total,
  enabledCount,
  overrideCount,
}: {
  total: number;
  enabledCount: number;
  overrideCount: number;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
      <KpiTile compact label="Total" value={total} color="var(--accent)" />
      <KpiTile compact label="Enabled" value={enabledCount} color="var(--phase-fabrication)" />
      <KpiTile compact label="Overrides" value={overrideCount} color="var(--phase-detailing)" />
    </div>
  );
}

export function FeatureFlagsCommandBar({
  flagCount,
  enabledCount,
  overrideCount,
  onRefresh,
}: {
  flagCount: number;
  enabledCount: number;
  overrideCount: number;
  onRefresh: () => void;
}) {
  return (
    <CommandBar
      eyebrow="ADMIN · WORKSPACE"
      title="Feature Flags"
      count={flagCount}
      unit=" · FLAGS"
      subtitle={`${enabledCount} enabled · ${overrideCount} per-user override${overrideCount === 1 ? "" : "s"}`}
    >
      <button
        onClick={onRefresh}
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
  );
}

export function NewFlagForm({
  newFlag,
  onChangeField,
  onCreate,
  createPending,
}: {
  newFlag: { flag_key: string; description: string; enabled: boolean };
  onChangeField: (field: string, value: unknown) => void;
  onCreate: () => void;
  createPending: boolean;
}) {
  return (
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
        onChange={(e) => onChangeField("flag_key", e.target.value)}
        style={{ ...inputStyle, minWidth: 220 }}
      />
      <input
        type="text"
        placeholder="Description (optional)"
        value={newFlag.description}
        onChange={(e) => onChangeField("description", e.target.value)}
        style={{ ...inputStyle, flex: 1, minWidth: 220 }}
      />
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)" }}>
        <input
          type="checkbox"
          checked={newFlag.enabled}
          onChange={(e) => onChangeField("enabled", e.target.checked)}
        />
        Enabled
      </label>
      <Button onClick={onCreate} disabled={createPending}>
        <Plus size={14} style={{ marginRight: 4 }} />
        Add flag
      </Button>
    </div>
  );
}

export function FeatureFlagsTable({
  isLoading,
  flags,
  overrideDrafts,
  onPatchOverrideDraft,
  onDescriptionBlur,
  onToggleEnabled,
  onAddOverride,
  onRemoveOverride,
  onDeleteFlag,
  updatePending,
}: {
  isLoading: boolean;
  flags: Array<Record<string, unknown>>;
  overrideDrafts: Record<string, { email: string; enabled: boolean }>;
  onPatchOverrideDraft: (
    flagId: string,
    patch: Partial<{ email: string; enabled: boolean }>,
  ) => void;
  onDescriptionBlur: (flag: Record<string, unknown>, nextDescription: string) => void;
  onToggleEnabled: (flag: Record<string, unknown>) => void;
  onAddOverride: (flag: Record<string, unknown>) => void;
  onRemoveOverride: (flag: Record<string, unknown>, email: string) => void;
  onDeleteFlag: (flag: Record<string, unknown>) => void;
  updatePending: boolean;
}) {
  return (
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
              const draft = overrideDrafts[flag.id as string] || createEmptyOverrideDraft();
              return (
                <TableRow key={flag.id as string} style={{ borderBottom: "1px solid var(--border-default)" }}>
                  <TableCell style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-primary)" }}>
                    {flag.flag_key as string}
                  </TableCell>
                  <TableCell>
                    <input
                      type="text"
                      defaultValue={(flag.description as string) || ""}
                      onBlur={(e) => onDescriptionBlur(flag, e.target.value)}
                      placeholder="Describe what this flag controls"
                      style={{ ...inputStyle, width: "100%" }}
                    />
                  </TableCell>
                  <TableCell>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={!!flag.enabled}
                        onChange={() => onToggleEnabled(flag)}
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
                              onClick={() => onRemoveOverride(flag, email)}
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
                            onPatchOverrideDraft(flag.id as string, { email: e.target.value })
                          }
                          style={{ ...inputStyle, flex: 1, minWidth: 160 }}
                        />
                        <select
                          value={draft.enabled ? "on" : "off"}
                          onChange={(e) =>
                            onPatchOverrideDraft(flag.id as string, {
                              enabled: e.target.value === "on",
                            })
                          }
                          style={{ ...inputStyle, padding: "7px 8px" }}
                        >
                          <option value="on">On</option>
                          <option value="off">Off</option>
                        </select>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => onAddOverride(flag)}
                          disabled={updatePending}
                        >
                          Add
                        </Button>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => onDeleteFlag(flag)}
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
  );
}

