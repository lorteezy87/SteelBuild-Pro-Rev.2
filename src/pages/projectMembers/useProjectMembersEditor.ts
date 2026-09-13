import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/supabase";
import {
  DEFAULT_ROLE,
  countProjectAdmins,
  deriveProjectMembers,
  indexProfiles,
  isProjectAdminRole,
  isProjectRole,
  isValidEmail,
  normalizeMemberEmail,
  pruneSelectedMemberIds,
  shapeAddProjectMemberPayload,
  shapeRoleUpdatePayload,
  wouldLeaveProjectWithoutAdmin,
  type MemberActivityRow,
  type ProjectMember,
  type ProjectRoleValue,
  type UserProfileRow,
  type UserProjectRow,
} from "@/lib/projectMembers";

type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];

type UseProjectMembersEditorOptions = {
  selectedProjectId: string;
  canManageSelectedProject: boolean;
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useProjectMembersEditor({
  selectedProjectId,
  canManageSelectedProject,
}: UseProjectMembersEditorOptions) {
  const queryClient = useQueryClient();
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [removeTarget, setRemoveTarget] = useState<ProjectMember | null>(null);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [bulkRole, setBulkRole] = useState<ProjectRoleValue>(DEFAULT_ROLE);

  const { data: projects = [], isLoading: projectsLoading } = useQuery<ProjectRow[]>({
    queryKey: ["projects-for-member-admin"],
    queryFn: () => entities.Project.list("name"),
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: memberRows = [],
    isLoading: membersLoading,
    refetch,
  } = useQuery<UserProjectRow[]>({
    queryKey: ["project-members", selectedProjectId],
    enabled: Boolean(selectedProjectId) && canManageSelectedProject,
    queryFn: () =>
      entities.UserProject.filter(
        { project_id: selectedProjectId },
        "created_at",
      ),
    staleTime: 30 * 1000,
  });

  const userIds = useMemo(
    () => [...new Set(memberRows.map((member) => member.user_id).filter(Boolean))],
    [memberRows],
  );

  const { data: profilesById = {} } = useQuery<Record<string, UserProfileRow>>({
    queryKey: ["user-profiles-by-ids", userIds],
    enabled: canManageSelectedProject && userIds.length > 0,
    queryFn: async () => indexProfiles(await entities.User.filter({ id: userIds })),
    staleTime: 5 * 60 * 1000,
  });

  const members = useMemo(
    () => deriveProjectMembers(memberRows, profilesById),
    [memberRows, profilesById],
  );
  const adminCount = useMemo(() => countProjectAdmins(members), [members]);
  const selectedMembers = useMemo(
    () => members.filter((member) => selectedMemberIds.has(member.id)),
    [members, selectedMemberIds],
  );
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId),
    [projects, selectedProjectId],
  );

  const { data: memberActivity = [], isLoading: activityLoading } =
    useQuery<MemberActivityRow[]>({
      queryKey: ["member-activity", selectedProjectId],
      enabled: Boolean(selectedProjectId) && canManageSelectedProject,
      queryFn: async () => {
        const { data, error } = await supabase
          .from("member_activity")
          .select("*")
          .eq("project_id", selectedProjectId)
          .order("created_at", { ascending: false })
          .limit(20);
        if (error) throw error;
        return data ?? [];
      },
      staleTime: 30 * 1000,
    });

  useEffect(() => {
    setSelectedMemberIds((previous) => {
      const next = pruneSelectedMemberIds(previous, members);
      return next.size === previous.size ? previous : next;
    });
  }, [members]);

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: ["project-members", selectedProjectId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["member-activity", selectedProjectId],
    });
  };

  const updateRoleMut = useMutation({
    mutationFn: ({ id, role }: { id: string; role: ProjectRoleValue }) =>
      entities.UserProject.update(id, shapeRoleUpdatePayload(role)),
    onSuccess: () => {
      invalidate();
      toast.success("Role updated");
    },
    onError: (error: unknown) => {
      toast.error(errorMessage(error, "Failed to update role"));
    },
  });

  const removeMemberMut = useMutation({
    mutationFn: (id: string) => entities.UserProject.delete(id),
    onSuccess: () => {
      invalidate();
      setRemoveTarget(null);
      toast.success("Member removed");
    },
    onError: (error: unknown) => {
      toast.error(errorMessage(error, "Failed to remove member"));
    },
  });

  const bulkRoleMut = useMutation({
    mutationFn: async ({
      membersToUpdate,
      role,
    }: {
      membersToUpdate: ProjectMember[];
      role: ProjectRoleValue;
    }) => {
      const changedMembers = membersToUpdate.filter((member) => member.role !== role);
      await Promise.all(
        changedMembers.map((member) =>
          entities.UserProject.update(member.id, shapeRoleUpdatePayload(role)),
        ),
      );
      return changedMembers.length;
    },
    onSuccess: (changedCount) => {
      invalidate();
      setSelectedMemberIds(new Set());
      toast.success(
        changedCount === 1
          ? "Updated 1 member"
          : `Updated ${changedCount} members`,
      );
    },
    onError: (error: unknown) => {
      toast.error(errorMessage(error, "Failed to update selected members"));
    },
  });

  const addMemberMut = useMutation({
    mutationFn: async (email: string) => {
      if (!selectedProjectId) throw new Error("Pick a project first");
      const normalizedEmail = normalizeMemberEmail(email);
      const profiles = await entities.User.filter(
        { email: normalizedEmail },
        undefined,
        1,
      );
      const profile = profiles[0];
      if (!profile) throw new Error("User must sign up first.");
      if (members.some((member) => member.user_id === profile.id)) {
        throw new Error(`${normalizedEmail} is already a member.`);
      }
      return entities.UserProject.create(
        shapeAddProjectMemberPayload(profile.id, selectedProjectId),
      );
    },
    onSuccess: () => {
      invalidate();
      setNewMemberEmail("");
      toast.success("Member added");
    },
    onError: (error: unknown) => {
      toast.error(errorMessage(error, "Failed to add member"));
    },
  });

  const toggleMemberSelection = (memberId: string, checked: boolean) => {
    setSelectedMemberIds((previous) => {
      const next = new Set(previous);
      if (checked) next.add(memberId);
      else next.delete(memberId);
      return next;
    });
  };

  const toggleAllMembers = (checked: boolean) => {
    setSelectedMemberIds(
      checked ? new Set(members.map((member) => member.id)) : new Set(),
    );
  };

  const handleRoleChange = (member: ProjectMember, nextRole: string) => {
    if (!isProjectRole(nextRole) || nextRole === member.role) return;
    if (wouldLeaveProjectWithoutAdmin(members, [member], nextRole)) {
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
    if (wouldLeaveProjectWithoutAdmin(members, selectedMembers, bulkRole)) {
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

  return {
    projects,
    projectsLoading,
    selectedProject,
    members,
    membersLoading,
    memberActivity,
    activityLoading,
    adminCount,
    selectedMemberIds,
    selectedMembers,
    allMembersSelected:
      members.length > 0 && selectedMemberIds.size === members.length,
    newMemberEmail,
    removeTarget,
    bulkRole,
    updateRoleMut,
    removeMemberMut,
    bulkRoleMut,
    addMemberMut,
    refetch,
    setNewMemberEmail,
    setRemoveTarget,
    setSelectedMemberIds,
    setBulkRole,
    toggleMemberSelection,
    toggleAllMembers,
    handleRoleChange,
    handleAddMember,
    handleBulkRoleUpdate,
    handleRemoveMember,
  };
}
