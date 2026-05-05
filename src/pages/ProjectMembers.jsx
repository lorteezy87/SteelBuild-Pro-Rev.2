import React, { useContext, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CommandBar, KpiTile } from "@/components/design-system";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import AdminRoute from "../components/shared/AdminRoute";
import LoadingSkeleton from "../components/shared/LoadingSkeleton";
import DeleteDialog from "../components/shared/DeleteDialog";
import { ProjectContext } from "@/components/shared/ProjectContext";
import { useAuth } from "@/lib/AuthContext";
import { RefreshCw, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_ROLE,
  formatRole,
  getRoleOptions,
  isCurrentUser,
  isValidEmail,
} from "@/lib/projectMembers";

/**
 * ProjectMembers — RBAC Phase C admin surface.
 *
 * Pick a project from the top dropdown, then manage who's on it and what
 * their role is. Reads `user_projects` rows for the selected project and
 * joins them client-side against `user_profiles` (no FK between the two,
 * but `user_profiles.id` mirrors `auth.users.id` so a single .in() lookup
 * is enough).
 *
 * Writes (role updates, removals, additions) go through the standard
 * `base44.entities.UserProject` wrapper. RLS gates them at the DB layer:
 * only system admins or per-project admins can write to user_projects, so
 * even if a non-admin somehow lands here the writes will fail with 42501.
 * The page is wrapped in <AdminRoute> for the global-admin path.
 *
 * Deferred (flagged in TECH_DEBT.md):
 *   - member-activity audit table (no schema for it yet)
 *   - bulk role edits
 *   - inviting users by email (no email infra yet — only existing users
 *     can be added).
 */

// ── small style helpers (mirrors FeatureFlagsAdmin idiom) ─────────────
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

function ProjectMembersContent() {
  const qc = useQueryClient();
  const { user: currentUser } = useAuth();
  const projectCtx = useContext(ProjectContext);

  // ── project picker ────────────────────────────────────────────────
  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["projects-for-member-admin"],
    queryFn: () => base44.entities.Project.list("name"),
    staleTime: 5 * 60 * 1000,
  });

  // Default to the active project if there is one — otherwise leave
  // unselected so admin sees the full list and picks consciously. We
  // can't use useState(activeProject?.id) directly because the cached
  // project list arrives async; this keeps the picker honest while
  // still defaulting cleanly once a selection exists.
  const [selectedProjectId, setSelectedProjectId] = useState(
    () => projectCtx?.activeProject?.id || "",
  );

  // ── members ───────────────────────────────────────────────────────
  const {
    data: memberRows = [],
    isLoading: membersLoading,
    refetch,
  } = useQuery({
    queryKey: ["project-members", selectedProjectId],
    enabled: !!selectedProjectId,
    queryFn: () =>
      base44.entities.UserProject.filter(
        { project_id: selectedProjectId },
        "created_at",
      ),
    staleTime: 30 * 1000,
  });

  // Hydrate member rows with email / full_name from user_profiles.
  // user_profiles.id mirrors auth.users.id, so a single .in() lookup
  // covers every UUID in the page-level member list.
  const userIds = useMemo(
    () => Array.from(new Set(memberRows.map((m) => m.user_id).filter(Boolean))),
    [memberRows],
  );

  const { data: profilesById = {} } = useQuery({
    queryKey: ["user-profiles-by-ids", userIds],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const profiles = await base44.entities.User.filter({ id: userIds });
      const byId = {};
      for (const p of profiles) byId[p.id] = p;
      return byId;
    },
    staleTime: 5 * 60 * 1000,
  });

  const members = useMemo(
    () =>
      memberRows.map((row) => {
        const profile = profilesById[row.user_id] || null;
        return {
          ...row,
          email: profile?.email || null,
          full_name: profile?.full_name || null,
        };
      }),
    [memberRows, profilesById],
  );

  const adminCount = useMemo(
    () => members.filter((m) => m.role === "owner" || m.role === "admin").length,
    [members],
  );

  // ── invalidation helper ───────────────────────────────────────────
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["project-members", selectedProjectId] });

  // ── mutations ─────────────────────────────────────────────────────
  const updateRoleMut = useMutation({
    mutationFn: ({ id, role }) =>
      base44.entities.UserProject.update(id, { role }),
    onSuccess: () => {
      invalidate();
      toast.success("Role updated");
    },
    onError: (err) => {
      toast.error(err?.message || "Failed to update role");
    },
  });

  const removeMemberMut = useMutation({
    mutationFn: (id) => base44.entities.UserProject.delete(id),
    onSuccess: () => {
      invalidate();
      setRemoveTarget(null);
      toast.success("Member removed");
    },
    onError: (err) => {
      toast.error(err?.message || "Failed to remove member");
    },
  });

  const addMemberMut = useMutation({
    mutationFn: async (email) => {
      const trimmed = email.trim().toLowerCase();
      // Look up the user_profiles row for this email — RLS allows
      // authenticated reads on user_profiles, so a single .filter()
      // is enough. We deliberately do NOT auto-create a profile here;
      // the user must have signed up first.
      const profiles = await base44.entities.User.filter({ email: trimmed }, undefined, 1);
      if (profiles.length === 0) {
        throw new Error("User must sign up first.");
      }
      const profile = profiles[0];
      // Guard against duplicates — RLS would let it through and the
      // (user_id, project_id) UNIQUE constraint would 409 us, but a
      // friendlier message is worth the round-trip.
      const existing = members.find((m) => m.user_id === profile.id);
      if (existing) {
        throw new Error(`${trimmed} is already a member.`);
      }
      return base44.entities.UserProject.create({
        user_id: profile.id,
        project_id: selectedProjectId,
        role: DEFAULT_ROLE,
      });
    },
    onSuccess: () => {
      invalidate();
      setNewMemberEmail("");
      toast.success("Member added");
    },
    onError: (err) => {
      toast.error(err?.message || "Failed to add member");
    },
  });

  // ── form state ────────────────────────────────────────────────────
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [removeTarget, setRemoveTarget] = useState(null);

  const handleRoleChange = (member, nextRole) => {
    if (nextRole === member.role) return;
    updateRoleMut.mutate({ id: member.id, role: nextRole });
  };

  const handleAddMember = () => {
    if (!selectedProjectId) {
      toast.error("Pick a project first");
      return;
    }
    if (!isValidEmail(newMemberEmail)) {
      toast.error("Enter a valid email");
      return;
    }
    addMemberMut.mutate(newMemberEmail);
  };

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <CommandBar
        eyebrow="ADMIN · WORKSPACE"
        title="Project Members"
        count={members.length}
        unit=" · MEMBERS"
        subtitle={
          selectedProject
            ? `${selectedProject.name} · ${adminCount} admin${adminCount === 1 ? "" : "s"}`
            : "Pick a project to manage its members"
        }
      >
        <button
          onClick={refetch}
          disabled={!selectedProjectId}
          title="Refresh"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            color: "var(--text-secondary)",
            borderRadius: "var(--radius-btn)",
            padding: "8px 12px",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            cursor: selectedProjectId ? "pointer" : "not-allowed",
            textTransform: "uppercase",
            opacity: selectedProjectId ? 1 : 0.5,
          }}
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </CommandBar>

      {/* Project picker */}
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
          onChange={(e) => setSelectedProjectId(e.target.value)}
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

      {!membersLoading && selectedProjectId && members.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 10,
          }}
        >
          <KpiTile compact label="Total" value={members.length} color="var(--accent)" />
          <KpiTile compact label="Admins / Owners" value={adminCount} color="var(--phase-detailing)" />
          <KpiTile
            compact
            label="Standard"
            value={members.length - adminCount}
            color="var(--phase-fabrication)"
          />
        </div>
      )}

      {/* Add-member form */}
      {selectedProjectId && (
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
            value={newMemberEmail}
            onChange={(e) => setNewMemberEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddMember();
            }}
            style={{ ...inputStyle, flex: 1, minWidth: 240 }}
          />
          <Button
            onClick={handleAddMember}
            disabled={addMemberMut.isPending || !newMemberEmail.trim()}
          >
            <Plus size={14} style={{ marginRight: 4 }} />
            Add member
          </Button>
        </div>
      )}

      {/* Members table */}
      {selectedProjectId && (
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
                <TableHead style={cellLabelStyle}>Email</TableHead>
                <TableHead style={cellLabelStyle}>Name</TableHead>
                <TableHead style={cellLabelStyle}>Role</TableHead>
                <TableHead style={cellLabelStyle}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {membersLoading ? (
                <TableRow>
                  <TableCell colSpan={4} style={{ padding: 0 }}>
                    <LoadingSkeleton variant="table" rows={4} />
                  </TableCell>
                </TableRow>
              ) : members.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
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
                  const isSelf = isCurrentUser(member.user_id, currentUser?.id);
                  const options = getRoleOptions(member.role);
                  return (
                    <TableRow
                      key={member.id}
                      style={{ borderBottom: "1px solid var(--hover-bg)" }}
                    >
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
                          onChange={(e) => handleRoleChange(member, e.target.value)}
                          disabled={updateRoleMut.isPending}
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
                          onClick={() => setRemoveTarget(member)}
                          disabled={isSelf}
                          title={
                            isSelf
                              ? "You can't remove yourself"
                              : `Remove ${member.email || member.user_id}`
                          }
                          style={{
                            background: "none",
                            border: "1px solid var(--border-default)",
                            color: isSelf
                              ? "var(--text-muted)"
                              : "var(--nc-accent-red, #ff6b6b)",
                            borderRadius: "var(--radius-btn)",
                            padding: "6px 10px",
                            cursor: isSelf ? "not-allowed" : "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            fontFamily: "var(--font-mono)",
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            opacity: isSelf ? 0.5 : 1,
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
      )}

      <DeleteDialog
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={() => removeTarget && removeMemberMut.mutate(removeTarget.id)}
        title="Remove member"
        description={
          removeTarget
            ? `Remove ${removeTarget.email || removeTarget.user_id} (${formatRole(removeTarget.role)}) from this project? They will lose all access immediately. This cannot be undone, but you can re-add them.`
            : ""
        }
      />
    </div>
  );
}

export default function ProjectMembers() {
  return (
    <AdminRoute>
      <ProjectMembersContent />
    </AdminRoute>
  );
}
