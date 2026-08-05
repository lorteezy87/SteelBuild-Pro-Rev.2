/**
 * Presentational UI for Project Members admin page.
 */
// @ts-nocheck
import React from "react";
import { CommandBar, KpiTile, Button as DSButton } from "@/components/design-system";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { RefreshCw, Plus, Trash2, Users, History } from "lucide-react";
import {
  DEFAULT_ROLE,
  formatRole,
  getRoleOptions,
  isCurrentUser,
  isProjectAdminRole,
} from "@/lib/projectMembers";
import { formatActivityEvent } from "./projectMembersHelpers";

export const inputStyle = {
  background: "var(--bg-surface-low)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  padding: "7px 10px",
  fontSize: 12,
  color: "var(--text-primary)",
  outline: "none",
  fontFamily: "var(--font-body)",
};

export const cellLabelStyle = {
  color: "var(--text-primary)",
  fontWeight: 700,
  fontSize: 11,
  letterSpacing: "0.05em",
};

export function MembersCommandBar({ memberCount, subtitle, onRefresh, refreshDisabled }) {
  return (
    <CommandBar
      eyebrow="ADMIN · WORKSPACE"
      title="Project Members"
      count={memberCount}
      unit=" · MEMBERS"
      subtitle={subtitle}
    >
      <DSButton variant="secondary" onClick={onRefresh} disabled={refreshDisabled} title="Refresh">
        <RefreshCw size={12} /> Refresh
      </DSButton>
    </CommandBar>
  );
}

export function ProjectPicker({ selectedProjectId, onChange, projects, projectsLoading }) {
  return (
    <div
      style={{
        background: "var(--bg-surface-low)",
        border: "1px solid var(--border-default)",
        borderRadius: 12,
        padding: 14,
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.08em",
          color: "var(--text-muted)",
          textTransform: "uppercase",
        }}
      >
        Project
      </span>
      <select
        value={selectedProjectId}
        onChange={(e) => onChange(e.target.value)}
        disabled={projectsLoading}
        style={{ ...inputStyle, minWidth: 280 }}
        aria-label="Select project to manage members for"
      >
        <option value="">— Pick a project —</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name || p.id}
          </option>
        ))}
      </select>
    </div>
  );
}

export function AccessCheckingBanner() {
  return (
    <div
      style={{
        background: "var(--bg-surface-low)",
        border: "1px solid var(--border-default)",
        borderRadius: 12,
        padding: 18,
        color: "var(--text-secondary)",
        fontSize: 13,
      }}
    >
      Checking project role...
    </div>
  );
}

export function AccessDeniedBanner() {
  return (
    <div
      style={{
        background: "var(--bg-surface-low)",
        border: "1px solid var(--border-default)",
        borderRadius: 12,
        padding: 18,
      }}
    >
      <div
        style={{
          color: "var(--danger)",
          fontWeight: 700,
          fontSize: 14,
          marginBottom: 6,
        }}
      >
        Project admin access required
      </div>
      <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>
        Select a project where your role is Admin or Owner.
      </div>
    </div>
  );
}

export function MembersKpiStrip({ total, adminCount }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: 10,
      }}
    >
      <KpiTile compact label="Total" value={total} color="var(--accent)" />
      <KpiTile compact label="Admins / Owners" value={adminCount} color="var(--phase-detailing)" />
      <KpiTile
        compact
        label="Standard"
        value={total - adminCount}
        color="var(--phase-fabrication)"
      />
    </div>
  );
}

export function AddMemberForm({ email, onEmailChange, onSubmit, isPending }) {
  return (
    <div
      style={{
        background: "var(--bg-surface-low)",
        border: "1px solid var(--border-default)",
        borderRadius: 12,
        padding: 14,
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.08em",
          color: "var(--text-muted)",
          textTransform: "uppercase",
        }}
      >
        Add member
      </span>
      <input
        type="email"
        placeholder="user@example.com"
        value={email}
        onChange={(e) => onEmailChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit();
        }}
        style={{ ...inputStyle, flex: 1, minWidth: 240 }}
      />
      <Button onClick={onSubmit} disabled={isPending || !email.trim()}>
        <Plus size={14} style={{ marginRight: 4 }} />
        Add member
      </Button>
    </div>
  );
}

export function BulkRoleBar({ bulkRole, onBulkRoleChange, onApply, isPending, selectedCount }) {
  return (
    <div
      style={{
        background: "var(--bg-surface-low)",
        border: "1px solid var(--border-default)",
        borderRadius: 12,
        padding: 14,
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.08em",
          color: "var(--text-muted)",
          textTransform: "uppercase",
        }}
      >
        Bulk role
      </span>
      <select
        value={bulkRole}
        onChange={(e) => onBulkRoleChange(e.target.value)}
        style={{ ...inputStyle, minWidth: 140 }}
        aria-label="Bulk role"
      >
        {getRoleOptions(DEFAULT_ROLE).map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <Button onClick={onApply} disabled={isPending || selectedCount === 0}>
        Apply to {selectedCount || 0}
      </Button>
    </div>
  );
}

export function MembersTable({
  members,
  membersLoading,
  selectedMemberIds,
  allMembersSelected,
  onToggleAll,
  onToggleMember,
  onRoleChange,
  onRemove,
  currentUserId,
  adminCount,
  roleUpdatePending = false,
}) {
  return (
    <div
      style={{
        background: "var(--bg-surface-low)",
        border: "1px solid var(--border-default)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <Table>
        <TableHeader>
          <TableRow
            style={{
              background: "var(--bg-surface-low)",
              borderBottom: "1px solid var(--border-default)",
            }}
          >
            <TableHead style={{ ...cellLabelStyle, width: 44 }}>
              <input
                type="checkbox"
                checked={allMembersSelected}
                onChange={(e) => onToggleAll(e.target.checked)}
                aria-label="Select all members"
              />
            </TableHead>
            <TableHead style={cellLabelStyle}>Email</TableHead>
            <TableHead style={cellLabelStyle}>Name</TableHead>
            <TableHead style={cellLabelStyle}>Role</TableHead>
            <TableHead style={cellLabelStyle}>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {membersLoading ? (
            <TableRow>
              <TableCell colSpan={5} style={{ padding: 0 }}>
                <LoadingSkeleton variant="table" rows={4} />
              </TableCell>
            </TableRow>
          ) : members.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={5}
                style={{ textAlign: "center", padding: "48px 0", color: "var(--text-muted)" }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Users className="w-10 h-10" style={{ opacity: 0.18 }} />
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                    }}
                  >
                    No members yet
                  </span>
                  <span style={{ fontSize: 12 }}>
                    Add one above to get started.
                  </span>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            members.map((member) => {
              const isSelf = isCurrentUser(member.user_id, currentUserId);
              const isLastAdmin =
                isProjectAdminRole(member.role) && adminCount <= 1;
              const options = getRoleOptions(member.role);
              return (
                <TableRow
                  key={member.id}
                  style={{ borderBottom: "1px solid var(--hover-bg)" }}
                >
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedMemberIds.has(member.id)}
                      onChange={(e) => onToggleMember(member.id, e.target.checked)}
                      aria-label={`Select ${member.email || member.user_id}`}
                    />
                  </TableCell>
                  <TableCell
                    style={{
                      fontFamily: "var(--font-body)",
                      color: "var(--text-primary)",
                      fontSize: 12,
                      fontWeight: 500,
                    }}
                  >
                    {member.email || (
                      <span
                        title={`user_id: ${member.user_id}`}
                        style={{ color: "var(--text-muted)" }}
                      >
                        (no profile)
                      </span>
                    )}
                    {isSelf && (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 10,
                          fontFamily: "var(--font-mono)",
                          color: "var(--text-muted)",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                        }}
                      >
                        (you)
                      </span>
                    )}
                  </TableCell>
                  <TableCell
                    style={{ fontSize: 12, color: "var(--text-secondary)" }}
                  >
                    {member.full_name || "—"}
                  </TableCell>
                  <TableCell>
                    <select
                      value={member.role}
                      onChange={(e) => onRoleChange(member, e.target.value)}
                      disabled={roleUpdatePending}
                      aria-label={`Role for ${member.email || member.user_id}`}
                      style={{ ...inputStyle, padding: "6px 8px" }}
                    >
                      {options.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => onRemove(member)}
                      disabled={isSelf || isLastAdmin}
                      title={
                        isSelf
                          ? "You can't remove yourself"
                          : isLastAdmin
                            ? "A project must keep at least one admin or owner"
                          : `Remove ${member.email || member.user_id}`
                      }
                      style={{
                        background: "none",
                        border: "1px solid var(--border-default)",
                        color: isSelf || isLastAdmin
                          ? "var(--text-muted)"
                          : "var(--danger)",
                        borderRadius: "var(--radius-btn)",
                        padding: "6px 10px",
                        cursor: isSelf || isLastAdmin ? "not-allowed" : "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        opacity: isSelf || isLastAdmin ? 0.5 : 1,
                      }}
                    >
                      <Trash2 size={12} /> Remove
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

export function MemberActivityPanel({ activityLoading, memberActivity }) {
  return (
    <div
      style={{
        background: "var(--bg-surface-low)",
        border: "1px solid var(--border-default)",
        borderRadius: 12,
        padding: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
          color: "var(--text-primary)",
          fontWeight: 700,
          fontSize: 13,
        }}
      >
        <History size={14} />
        Recent member activity
      </div>
      {activityLoading ? (
        <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
          Loading activity...
        </div>
      ) : memberActivity.length === 0 ? (
        <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
          No membership changes logged yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {memberActivity.map((activity) => (
            <div
              key={activity.id}
              style={{
                borderTop: "1px solid var(--hover-bg)",
                paddingTop: 8,
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto",
                gap: 12,
                alignItems: "start",
              }}
            >
              <div>
                <div style={{ color: "var(--text-primary)", fontSize: 12 }}>
                  {formatActivityEvent(activity)}
                </div>
                <div style={{ color: "var(--text-muted)", fontSize: 11 }}>
                  By {activity.actor_email || "system"}
                </div>
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: 11 }}>
                {activity.created_at
                  ? new Date(activity.created_at).toLocaleString()
                  : ""}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
