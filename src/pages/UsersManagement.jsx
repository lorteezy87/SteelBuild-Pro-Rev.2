import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, Mail } from "lucide-react";
import AdminRoute from "../components/shared/AdminRoute";
import PageHeader from "../components/shared/PageHeader";
import DeleteDialog from "../components/shared/DeleteDialog";
import UserEditModal from "../components/users/UserEditModal";
import StatusBadge from "../components/shared/StatusBadge";
import { formatDate } from "../components/shared/formatters";
import { toast } from "sonner";

function UsersManagementContent() {
  const qc = useQueryClient();
  const [editingUser, setEditingUser] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: users = [], isLoading, refetch } = useQuery({
    queryKey: ["users"],
    queryFn: () => base44.entities.User.list("-created_at"),
  });

  const deleteUserMut = useMutation({
    mutationFn: (userId) => base44.entities.User.delete(userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setDeleteTarget(null);
      toast.success("User deleted");
    },
    onError: (err) => {
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
    <div>
      <PageHeader
        title="User Management"
        subtitle={`${users.length} total users`}
        onRefresh={refetch}
      />

      <div style={{ background: "var(--bg-surface-low)", border: "1px solid var(--border-default)", borderRadius: 12, overflow: "hidden" }}>
        <Table>
          <TableHeader>
            <TableRow style={{ background: "var(--bg-sidebar)", borderBottom: "1px solid var(--border-default)" }}>
              <TableHead style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: 11, letterSpacing: "0.05em" }}>Email</TableHead>
              <TableHead style={{ color: "#F2F4F8", fontWeight: 700, fontSize: 11, letterSpacing: "0.05em" }}>Name</TableHead>
              <TableHead style={{ color: "#F2F4F8", fontWeight: 700, fontSize: 11, letterSpacing: "0.05em" }}>Role</TableHead>
              <TableHead style={{ color: "#F2F4F8", fontWeight: 700, fontSize: 11, letterSpacing: "0.05em" }}>Joined</TableHead>
              <TableHead style={{ color: "#F2F4F8", fontWeight: 700, fontSize: 11, letterSpacing: "0.05em" }}>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} style={{ textAlign: "center", padding: "32px 0", color: "var(--text-muted)" }}>
                  Loading...
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} style={{ textAlign: "center", padding: "32px 0", color: "var(--text-muted)" }}>
                  No users found
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: "transparent", transition: "background 0.1s" }} onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.02)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                  <TableCell style={{ fontFamily: "var(--font-body)", color: "var(--text-primary)", fontSize: 12, fontWeight: 500 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Mail className="w-4 h-4" style={{ opacity: 0.5 }} />
                      {user.email}
                    </div>
                  </TableCell>
                  <TableCell style={{ fontSize: 12, color: "var(--text-secondary)" }}>{user.full_name || "—"}</TableCell>
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
                        style={{ color: "#FF3D3D" }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
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