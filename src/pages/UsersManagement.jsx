import React, { useState, useMemo } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, Mail, Search, X, Users } from "lucide-react";
import AdminRoute from "../components/shared/AdminRoute";
import { CommandBar, KpiTile } from "@/components/design-system";
import { RefreshCw } from "lucide-react";
import DeleteDialog from "../components/shared/DeleteDialog";
import UserEditModal from "../components/users/UserEditModal";
import StatusBadge from "../components/shared/StatusBadge";
import LoadingSkeleton from "../components/shared/LoadingSkeleton";
import { formatDate } from "../components/shared/formatters";
import { toast } from "sonner";
import { getInitials, getAvatarColor } from "@/lib/avatars";

// Local wrapper preserves the existing call-site shape (`getAvatarColor(user)`)
// while delegating to the shared seed-based helper. The seed is the display
// name with email as fallback so the color follows the user's display, not
// their UUID.
const getUserAvatarColor = (user) =>
  getAvatarColor(user?.full_name || user?.email);

function getActivityStatus(user) {
  if (user.status === "invited" || user.status === "pending") {
    return "pending";
  }
  const lastDate = user.last_active || user.last_login;
  if (lastDate) {
    const diff = Date.now() - new Date(lastDate).getTime();
    if (diff < 7 * 24 * 60 * 60 * 1000) return "active";
  }
  return "inactive";
}

const activityDotColors = {
  active: "#10B981",
  pending: "#F59E0B",
  inactive: "var(--text-muted)",
};

function UsersManagementContent() {
  const qc = useQueryClient();
  const [editingUser, setEditingUser] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  const { data: users = [], isLoading, refetch } = useQuery({
    queryKey: ["users"],
    queryFn: () => entities.User.list("-created_at"),
    staleTime: 5 * 60 * 1000,
  });

  const filteredUsers = useMemo(() => {
    if (!searchTerm.trim()) return users;
    const term = searchTerm.toLowerCase();
    return users.filter((u) =>
      (u.email || "").toLowerCase().includes(term) ||
      (u.full_name || "").toLowerCase().includes(term) ||
      (u.role || "").toLowerCase().includes(term)
    );
  }, [users, searchTerm]);

  const adminCount = useMemo(() => users.filter((u) => u.role === "admin").length, [users]);
  const userCount = useMemo(() => users.filter((u) => u.role !== "admin").length, [users]);

  const deleteUserMut = useMutation({
    mutationFn: (userId) => entities.User.delete(userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setDeleteTarget(null);
      toast.success("User deleted");
    },
    onError: () => {
      toast.error("Failed to delete user");
    },
  });

  const handleEdit = (user) => {
    setEditingUser(user);
    setEditModalOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (deleteTarget) {
      deleteUserMut.mutate(deleteTarget.id);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <CommandBar
        eyebrow="ADMIN · WORKSPACE"
        title="User Management"
        count={users.length}
        unit=" · USERS"
        subtitle={`${adminCount} admin${adminCount !== 1 ? "s" : ""} · ${userCount} user${userCount !== 1 ? "s" : ""}`}
      >
        <button
          onClick={refetch}
          title="Refresh"
          className="sbd-btn"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
            letterSpacing: "0.08em", textTransform: "uppercase",
          }}
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </CommandBar>

      {!isLoading && users.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
          <KpiTile compact label="Total"     value={users.length} color="var(--accent)" />
          <KpiTile compact label="Admins"    value={adminCount}   color="var(--phase-detailing)" />
          <KpiTile compact label="Standard"  value={userCount}    color="var(--phase-fabrication)" />
        </div>
      )}

      {/* Search bar */}
      <div style={{
        position: "relative", marginBottom: 12, maxWidth: 360,
      }}>
        <Search
          className="w-3.5 h-3.5"
          style={{
            position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
            color: "var(--text-muted)", pointerEvents: "none",
          }}
        />
        <input
          type="text"
          placeholder="Search users by name, email, or role..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="sbd-input"
          style={{
            width: "100%", padding: "7px 32px 7px 30px",
            fontSize: 12,
          }}
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm("")}
            style={{
              position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer", padding: 2,
              color: "var(--text-muted)", display: "flex", alignItems: "center",
            }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

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
                      onClick={() => setSearchTerm("")}
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
                  <TableRow key={user.id} style={{ borderBottom: "1px solid var(--hover-bg)", background: "transparent", transition: "background 0.1s" }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--hover-bg)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                    <TableCell style={{ fontFamily: "var(--font-body)", color: "var(--text-primary)", fontSize: 12, fontWeight: 500 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                          style={{
                            width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                            background: activityDotColors[activity],
                            opacity: activity === "inactive" ? 0.4 : 1,
                          }}
                          title={activity === "active" ? "Active" : activity === "pending" ? "Pending" : ""}
                        />
                        <Mail className="w-4 h-4" style={{ opacity: 0.5, flexShrink: 0 }} />
                        {user.email}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div
                          style={{
                            width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                            background: getUserAvatarColor(user),
                            display: "flex", alignItems: "center", justifyContent: "center",
                            color: "#fff", fontSize: 11, fontWeight: 700,
                            lineHeight: 1, userSelect: "none",
                          }}
                        >
                          {getInitials(user.full_name)}
                        </div>
                        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                          {user.full_name || "\u2014"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={user.role === "admin" ? "Admin" : "User"} />
                    </TableCell>
                    <TableCell style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {formatDate(user.created_date)}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleEdit(user)}
                          style={{ color: "rgba(220,225,240,0.60)" }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setDeleteTarget(user)}
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

      <UserEditModal open={editModalOpen} onClose={() => { setEditModalOpen(false); setEditingUser(null); }} user={editingUser} />
      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete User"
        description={`Are you sure you want to delete ${deleteTarget?.email}? This action cannot be undone.`}
      />
    </div>
  );
}

export default function UsersManagement() {
  return (
    <AdminRoute>
      <UsersManagementContent />
    </AdminRoute>
  );
}
