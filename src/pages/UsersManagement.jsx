import React, { useState, useMemo } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminRoute from "../components/shared/AdminRoute";
import { CommandBar } from "@/components/design-system";
import { RefreshCw } from "lucide-react";
import DeleteDialog from "../components/shared/DeleteDialog";
import UserEditModal from "../components/users/UserEditModal";
import { toast } from "sonner";
import {
  filterUsersBySearch,
  countAdmins,
  countNonAdmins,
} from "./usersManagement/usersManagementPageHelpers";
import {
  UsersKpiStrip,
  UsersSearchBar,
  UsersTable,
} from "./usersManagement/UsersManagementUi";

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

  const filteredUsers = useMemo(
    () => filterUsersBySearch(users, searchTerm),
    [users, searchTerm],
  );

  const adminCount = useMemo(() => countAdmins(users), [users]);
  const userCount = useMemo(() => countNonAdmins(users), [users]);

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
    <div className="sb-dashboard-reference-page" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
        <UsersKpiStrip
          total={users.length}
          adminCount={adminCount}
          userCount={userCount}
        />
      )}

      <UsersSearchBar
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        onClear={() => setSearchTerm("")}
      />

      <UsersTable
        isLoading={isLoading}
        filteredUsers={filteredUsers}
        searchTerm={searchTerm}
        onClearSearch={() => setSearchTerm("")}
        onEdit={handleEdit}
        onDelete={setDeleteTarget}
      />

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
