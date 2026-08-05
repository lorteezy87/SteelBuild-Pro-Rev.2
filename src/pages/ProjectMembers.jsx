import React, { useContext, useEffect, useMemo, useState } from "react";
import {
  collectUniqueUserIds,
  mergeMembersWithProfiles,
  countAdminMembers,
  filterSelectedMembers,
  wouldLeaveProjectWithoutAdmin,
  pruneSelectedIds,
  allMembersSelected as computeAllMembersSelected,
  nextSelectedIdsToggle,
  nextSelectedIdsAll,
  commandBarSubtitle,
  bulkUpdateSuccessMessage,
  removeMemberDescription,
} from "./projectMembers/projectMembersHelpers";
import {
  MembersCommandBar,
  ProjectPicker,
  AccessCheckingBanner,
  AccessDeniedBanner,
  MembersKpiStrip,
  AddMemberForm,
  BulkRoleBar,
  MembersTable,
  MemberActivityPanel,
} from "./projectMembers/ProjectMembersUi";
import { entities } from "@/api/supabaseClient";
import { supabase } from "@/lib/supabase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DeleteDialog from "../components/shared/DeleteDialog";
import { ProjectContext } from "@/components/shared/ProjectContext";
import { useAuth } from "@/lib/AuthContext";
import { useProjectRole, roleAtLeast } from "@/hooks/useProjectRole";
import { toast } from "sonner";
import {
  DEFAULT_ROLE,
  isProjectAdminRole,
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
 * Writes (role updates, removals, additions, and bulk edits) go through
 * the standard `entities.UserProject` wrapper. RLS gates them at the DB layer:
 * only system admins or per-project admins can write to user_projects, so
 * even if a non-admin lands here the writes will fail with 42501. The DB
 * logs membership changes into member_activity.
 * System admins and per-project admins pass the page-level gate.
 *
 * Email invites stay blocked until email infrastructure exists. This page
 * only adds existing user_profiles rows.
 */

function ProjectMembersContent() {
  const qc = useQueryClient();
  const { user: currentUser } = useAuth();
  const projectCtx = useContext(ProjectContext);

  // ── project picker ────────────────────────────────────────────────
  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["projects-for-member-admin"],
    queryFn: () => entities.Project.list("name"),
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

  const isSystemAdmin = currentUser?.role === "admin";
  const {
    role: selectedProjectRole,
    isLoading: projectRoleLoading,
  } = useProjectRole(selectedProjectId || null);
  const canManageSelectedProject =
    isSystemAdmin || roleAtLeast(selectedProjectRole, "admin");
  const accessCheckLoading =
    !!selectedProjectId && !isSystemAdmin && projectRoleLoading;

  // ── members ───────────────────────────────────────────────────────
  const {
    data: memberRows = [],
    isLoading: membersLoading,
    refetch,
  } = useQuery({
    queryKey: ["project-members", selectedProjectId],
    enabled: !!selectedProjectId && canManageSelectedProject,
    queryFn: () =>
      entities.UserProject.filter(
        { project_id: selectedProjectId },
        "created_at",
      ),
    staleTime: 30 * 1000,
  });

  // Hydrate member rows with email / full_name from user_profiles.
  // user_profiles.id mirrors auth.users.id, so a single .in() lookup
  // covers every UUID in the page-level member list.
  const userIds = useMemo(
    () => collectUniqueUserIds(memberRows),
    [memberRows],
  );

  const { data: profilesById = {} } = useQuery({
    queryKey: ["user-profiles-by-ids", userIds],
    enabled: canManageSelectedProject && userIds.length > 0,
    queryFn: async () => {
      const profiles = await entities.User.filter({ id: userIds });
      const byId = {};
      for (const p of profiles) byId[p.id] = p;
      return byId;
    },
    staleTime: 5 * 60 * 1000,
  });

  const members = useMemo(
    () => mergeMembersWithProfiles(memberRows, profilesById),
    [memberRows, profilesById],
  );

  const adminCount = useMemo(
    () => countAdminMembers(members),
    [members],
  );

  const { data: memberActivity = [], isLoading: activityLoading } = useQuery({
    queryKey: ["member-activity", selectedProjectId],
    enabled: !!selectedProjectId && canManageSelectedProject,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("member_activity")
        .select("*")
        .eq("project_id", selectedProjectId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    staleTime: 30 * 1000,
  });

  // ── invalidation helper ───────────────────────────────────────────
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["project-members", selectedProjectId] });
    qc.invalidateQueries({ queryKey: ["member-activity", selectedProjectId] });
  };

  // ── mutations ─────────────────────────────────────────────────────
  const updateRoleMut = useMutation({
    mutationFn: ({ id, role }) =>
      entities.UserProject.update(id, { role }),
    onSuccess: () => {
      invalidate();
      toast.success("Role updated");
    },
    onError: (err) => {
      toast.error(err?.message || "Failed to update role");
    },
  });

  const removeMemberMut = useMutation({
    mutationFn: (id) => entities.UserProject.delete(id),
    onSuccess: () => {
      invalidate();
      setRemoveTarget(null);
      toast.success("Member removed");
    },
    onError: (err) => {
      toast.error(err?.message || "Failed to remove member");
    },
  });

  const bulkRoleMut = useMutation({
    mutationFn: async ({ membersToUpdate, role }) => {
      const changedMembers = membersToUpdate.filter((member) => member.role !== role);
      await Promise.all(
        changedMembers.map((member) =>
          entities.UserProject.update(member.id, { role }),
        ),
      );
      return changedMembers.length;
    },
    onSuccess: (changedCount) => {
      invalidate();
      setSelectedMemberIds(new Set());
      toast.success(bulkUpdateSuccessMessage(changedCount));
    },
    onError: (err) => {
      toast.error(err?.message || "Failed to update selected members");
    },
  });

  const addMemberMut = useMutation({
    mutationFn: async (email) => {
      const trimmed = email.trim().toLowerCase();
      // Look up the user_profiles row for this email — RLS allows
      // authenticated reads on user_profiles, so a single .filter()
      // is enough. We deliberately do NOT auto-create a profile here;
      // the user must have signed up first.
      const profiles = await entities.User.filter({ email: trimmed }, undefined, 1);
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
      return entities.UserProject.create({
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
  const [selectedMemberIds, setSelectedMemberIds] = useState(() => new Set());
  const [bulkRole, setBulkRole] = useState(DEFAULT_ROLE);

  useEffect(() => {
    setSelectedMemberIds((prev) => {
      const liveIds = new Set(members.map((member) => member.id));
      return pruneSelectedIds(prev, liveIds);
    });
  }, [members]);

  const selectedMembers = useMemo(
    () => filterSelectedMembers(members, selectedMemberIds),
    [members, selectedMemberIds],
  );

  const allMembersSelected = computeAllMembersSelected(members, selectedMemberIds);

  const wouldLeaveWithoutAdmin = (targetMembers, nextRole) =>
    wouldLeaveProjectWithoutAdmin(members, targetMembers, nextRole);

  const toggleMemberSelection = (memberId, checked) => {
    setSelectedMemberIds((prev) => nextSelectedIdsToggle(prev, memberId, checked));
  };

  const toggleAllMembers = (checked) => {
    setSelectedMemberIds(nextSelectedIdsAll(members, checked));
  };

  const handleRoleChange = (member, nextRole) => {
    if (nextRole === member.role) return;
    if (wouldLeaveWithoutAdmin([member], nextRole)) {
      toast.error("A project must keep at least one admin or owner.");
      return;
    }
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

  const handleBulkRoleUpdate = () => {
    if (selectedMembers.length === 0) {
      toast.error("Select at least one member");
      return;
    }
    if (wouldLeaveWithoutAdmin(selectedMembers, bulkRole)) {
      toast.error("A project must keep at least one admin or owner.");
      return;
    }
    bulkRoleMut.mutate({ membersToUpdate: selectedMembers, role: bulkRole });
  };

  const handleRemoveMember = () => {
    if (!removeTarget) return;
    if (isProjectAdminRole(removeTarget.role) && adminCount <= 1) {
      toast.error("A project must keep at least one admin or owner.");
      return;
    }
    removeMemberMut.mutate(removeTarget.id);
  };

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  return (
    <div className="sb-dashboard-reference-page">
      <MembersCommandBar
        memberCount={members.length}
        subtitle={commandBarSubtitle(selectedProject, adminCount)}
        onRefresh={refetch}
        refreshDisabled={!selectedProjectId || !canManageSelectedProject}
      />

      <ProjectPicker
        selectedProjectId={selectedProjectId}
        onChange={(value) => {
          setSelectedProjectId(value);
          setSelectedMemberIds(new Set());
        }}
        projects={projects}
        projectsLoading={projectsLoading}
      />

      {selectedProjectId && accessCheckLoading && <AccessCheckingBanner />}

      {selectedProjectId && !accessCheckLoading && !canManageSelectedProject && (
        <AccessDeniedBanner />
      )}

      {!membersLoading && selectedProjectId && canManageSelectedProject && members.length > 0 && (
        <MembersKpiStrip total={members.length} adminCount={adminCount} />
      )}

      {selectedProjectId && canManageSelectedProject && (
        <AddMemberForm
          email={newMemberEmail}
          onEmailChange={setNewMemberEmail}
          onSubmit={handleAddMember}
          isPending={addMemberMut.isPending}
        />
      )}

      {selectedProjectId && canManageSelectedProject && members.length > 0 && (
        <BulkRoleBar
          bulkRole={bulkRole}
          onBulkRoleChange={setBulkRole}
          onApply={handleBulkRoleUpdate}
          isPending={bulkRoleMut.isPending}
          selectedCount={selectedMembers.length}
        />
      )}

      {selectedProjectId && canManageSelectedProject && (
        <MembersTable
          members={members}
          membersLoading={membersLoading}
          selectedMemberIds={selectedMemberIds}
          allMembersSelected={allMembersSelected}
          onToggleAll={toggleAllMembers}
          onToggleMember={toggleMemberSelection}
          onRoleChange={handleRoleChange}
          onRemove={setRemoveTarget}
          currentUserId={currentUser?.id}
          adminCount={adminCount}
          roleUpdatePending={updateRoleMut.isPending}
        />
      )}

      {selectedProjectId && canManageSelectedProject && (
        <MemberActivityPanel
          activityLoading={activityLoading}
          memberActivity={memberActivity}
        />
      )}

      <DeleteDialog
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleRemoveMember}
        title="Remove member"
        description={removeMemberDescription(removeTarget)}
      />
    </div>
  );
}

export default function ProjectMembers() {
  return <ProjectMembersContent />;
}
