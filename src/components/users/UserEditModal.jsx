import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const fieldLabelStyle = {
  display: "block",
  marginBottom: 8,
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  color: "var(--text-muted)",
  letterSpacing: "0.10em",
  textTransform: "uppercase",
};

const fieldInputStyle = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  padding: "10px 12px",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  outline: "none",
  boxSizing: "border-box",
};

function ReadOnlyField({ label, value }) {
  return (
    <div>
      <label style={fieldLabelStyle}>{label}</label>
      <div
        style={{
          background: "var(--bg-input)",
          border: "1px solid var(--border-default)",
          borderRadius: 8,
          padding: "10px 12px",
          color: "var(--text-secondary)",
          fontFamily: "var(--font-body)",
          fontSize: 12,
        }}
      >
        {value || "-"}
      </div>
    </div>
  );
}

export default function UserEditModal({ open, onClose, user }) {
  const qc = useQueryClient();
  const isCreate = !user?.id;

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("user");

  useEffect(() => {
    if (user?.id) {
      setEmail(user.email || "");
      setFullName(user.full_name || "");
      setRole(user.role || "user");
    } else {
      setEmail("");
      setFullName("");
      setRole("user");
    }
  }, [user, open]);

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.User.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("User created");
      onClose();
    },
    onError: (err) => {
      toast.error("Failed to create user: " + (err.message || "Unknown error"));
    },
  });

  const updateMut = useMutation({
    mutationFn: (data) => {
      if (!user?.id) throw new Error("User not found");
      return base44.entities.User.update(user.id, data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("User updated");
      onClose();
    },
    onError: (err) => {
      toast.error("Failed to update user: " + (err.message || "Unknown error"));
    },
  });

  const handleSave = () => {
    if (isCreate) {
      if (!email.trim()) {
        toast.error("Email is required");
        return;
      }
      createMut.mutate({
        email: email.trim(),
        full_name: fullName.trim(),
        role,
      });
      return;
    }

    if (!user?.id) return;
    updateMut.mutate({ role });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent style={{ background: "var(--bg-elevated)", border: "1px solid var(--accent-border)" }}>
        <DialogHeader>
          <DialogTitle style={{ color: "var(--text-primary)", fontSize: 18, fontWeight: 700 }}>
            {isCreate ? "Create User" : "Edit User"}
          </DialogTitle>
          <DialogDescription style={{ color: "var(--text-muted)", fontSize: 12 }}>
            Maintain the user profile and role used by the SteelBuild-Pro workspace.
          </DialogDescription>
        </DialogHeader>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {isCreate ? (
            <>
              <div>
                <label style={fieldLabelStyle}>Email</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@company.com"
                  style={fieldInputStyle}
                />
              </div>

              <div>
                <label style={fieldLabelStyle}>Name</label>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Full name"
                  style={fieldInputStyle}
                />
              </div>
            </>
          ) : (
            <>
              <ReadOnlyField label="Email" value={email} />
              <ReadOnlyField label="Name" value={fullName} />
            </>
          )}

          <div>
            <label style={fieldLabelStyle}>Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              style={{ ...fieldInputStyle, cursor: "pointer" }}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>

        <DialogFooter style={{ display: "flex", gap: 8, marginTop: 24 }}>
          <Button
            variant="outline"
            onClick={onClose}
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={createMut.isPending || updateMut.isPending}
            style={{ background: "var(--accent)", color: "var(--on-accent)", fontWeight: 700 }}
          >
            {createMut.isPending || updateMut.isPending
              ? "Saving..."
              : isCreate
                ? "Create User"
                : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
