/**
 * Presentational pieces for Users Management admin shell.
 * Page keeps queries/mutations; this file is pure JSX + props.
 */
// @ts-nocheck
import React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, Mail, Search, X, Users } from "lucide-react";
import { KpiTile } from "@/components/design-system";
import StatusBadge from "@/components/shared/StatusBadge";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { formatDate } from "@/components/shared/formatters";
import { getInitials } from "@/lib/avatars";
import {
  getActivityStatus,
  getUserAvatarColor,
  ACTIVITY_DOT_COLORS,
} from "./usersManagementPageHelpers";

const activityDotColors = ACTIVITY_DOT_COLORS;

export function UsersKpiStrip({
  total,
  adminCount,
  userCount,
}: {
  total: number;
  adminCount: number;
  userCount: number;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
      <KpiTile compact label="Total" value={total} color="var(--accent)" />
      <KpiTile compact label="Admins" value={adminCount} color="var(--phase-detailing)" />
      <KpiTile compact label="Standard" value={userCount} color="var(--phase-fabrication)" />
    </div>
  );
}

export function UsersSearchBar({
  searchTerm,
  onSearchTermChange,
  onClear,
}: {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <div style={{ position: "relative", marginBottom: 12, maxWidth: 360 }}>
      <Search
        className="w-3.5 h-3.5"
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
        placeholder="Search users by name, email, or role..."
        value={searchTerm}
        onChange={(e) => onSearchTermChange(e.target.value)}
        className="sbd-input"
        style={{
          width: "100%",
          padding: "7px 32px 7px 30px",
          fontSize: 12,
        }}
      />
      {searchTerm ? (
        <button
          onClick={onClear}
          style={{
            position: "absolute",
            right: 8,
            top: "50%",
            transform: "translateY(-50%)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 2,
            color: "var(--text-muted)",
            display: "flex",
            alignItems: "center",
          }}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export function UsersTable({
  isLoading,
  filteredUsers,
  searchTerm,
  onClearSearch,
  onEdit,
  onDelete,
}: {
  isLoading: boolean;
  filteredUsers: Array<Record<string, unknown>>;
  searchTerm: string;
  onClearSearch: () => void;
  onEdit: (user: Record<string, unknown>) => void;
  onDelete: (user: Record<string, unknown>) => void;
}) {
  return (
    <div className="sbd-card" style={{ padding: 0, overflow: "hidden" }}>
      <Table>
        <TableHeader>
          <TableRow style={{ background: "var(--bg-surface-low)", borderBottom: "1px solid var(--border-default)" }}>
            <TableHead style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: 11, letterSpacing: "0.05em" }}>Email</TableHead>
            <TableHead style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: 11, letterSpacing: "0.05em" }}>Name</TableHead>
            <TableHead style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: 11, letterSpacing: "0.05em" }}>Role</TableHead>
            <TableHead style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: 11, letterSpacing: "0.05em" }}>Joined</TableHead>
            <TableHead style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: 11, letterSpacing: "0.05em" }}>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={5} style={{ padding: 0 }}>
                <LoadingSkeleton variant="table" rows={5} />
              </TableCell>
            </TableRow>
          ) : filteredUsers.length === 0 && searchTerm.trim() ? (
            <TableRow>
              <TableCell colSpan={5} style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <Search className="w-8 h-8" style={{ opacity: 0.25 }} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>No users match "{searchTerm}"</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClearSearch}
                    style={{ fontSize: 11, color: "var(--text-link)" }}
                  >
                    Clear search
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ) : filteredUsers.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} style={{ textAlign: "center", padding: "48px 0", color: "var(--text-muted)" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <Users className="w-10 h-10" style={{ opacity: 0.18 }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}>No users yet</span>
                  <span style={{ fontSize: 12 }}>Invite team members to get started.</span>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            filteredUsers.map((user) => {
              const activity = getActivityStatus(user);
              return (
                <TableRow
                  key={user.id as string}
                  style={{
                    borderBottom: "1px solid var(--hover-bg)",
                    background: "transparent",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <TableCell style={{ fontFamily: "var(--font-body)", color: "var(--text-primary)", fontSize: 12, fontWeight: 500 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          flexShrink: 0,
                          background: activityDotColors[activity],
                          opacity: activity === "inactive" ? 0.4 : 1,
                        }}
                        title={activity === "active" ? "Active" : activity === "pending" ? "Pending" : ""}
                      />
                      <Mail className="w-4 h-4" style={{ opacity: 0.5, flexShrink: 0 }} />
                      {user.email as string}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "50%",
                          flexShrink: 0,
                          background: getUserAvatarColor(user),
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "var(--on-accent)",
                          fontSize: 11,
                          fontWeight: 700,
                          lineHeight: 1,
                          userSelect: "none",
                        }}
                      >
                        {getInitials(user.full_name as string)}
                      </div>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                        {(user.full_name as string) || "\u2014"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={user.role === "admin" ? "Admin" : "User"} />
                  </TableCell>
                  <TableCell style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {formatDate(user.created_date as string)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => onEdit(user)}
                        style={{ color: "rgba(220,225,240,0.60)" }}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => onDelete(user)}
                        style={{ color: "var(--status-error-bright)" }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
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
