import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function UserEditModal({ open, onClose, user }) {
  const qc = useQueryClient();
  const [role, setRole] = useState("");

  useEffect(() => {
    if (user) {
      setRole(user.role || "user");
    }
  }, [user, open]);

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.User.update(id, data),
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
    if (!user) return;
    updateMut.mutate({ id: user.id, data: { role } });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent style={{ background: "var(--bg-elevated)", border: "1px solid var(--accent-border)" }}>
        <DialogHeader>
          <DialogTitle style={{ color: "var(--text-primary)", fontSize: 18, fontWeight: 700 }}>Edit User</DialogTitle>
        </DialogHeader>

        {user && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ display: "block", marginBottom: 8, fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase" }}>Email</label>
              <div style={{ background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "10px 12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", fontSize: 12 }}>
                {user.email}
              </div>
            </div>

            <div>
              <label style={{ display: "block", marginBottom: 8, fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase" }}>Name</label>
              <div style={{ background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "10px 12px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", fontSize: 12 }}>
                {user.full_name || "—"}
              </div>
            </div>

            <div>
              <label style={{ display: "block", marginBottom: 8, fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase" }}>Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                style={{
                  width: "100%",
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-default)",
                  borderRadius: 8,
                  padding: "10px 12px",
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-body)",
                  fontSize: 12,
                  outline: "none",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "var(--accent)";
                  e.target.style.boxShadow = "0 0 0 3px var(--accent-muted)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "var(--border-default)";
                  e.target.style.boxShadow = "none";
                }}
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
        )}

        <DialogFooter style={{ display: "flex", gap: 8, marginTop: 24 }}>
          <Button variant="outline" onClick={onClose} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateMut.isPending} style={{ background: "var(--accent)", color: "#fff", fontWeight: 700 }}>
            {updateMut.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}