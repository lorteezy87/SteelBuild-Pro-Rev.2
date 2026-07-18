import React from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function DeleteDialog({ open, onClose, onConfirm, title, description, busy = false }) {
  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent className="sbd-card-strong" style={{ background: "var(--bg-surface-secondary)", border: "1px solid var(--border-default)", borderRadius: 16, color: "var(--text-primary)", boxShadow: "var(--shadow-lg)" }}>
         <AlertDialogHeader>
           <AlertDialogTitle style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>
             {title || "Delete Item"}
           </AlertDialogTitle>
           <AlertDialogDescription style={{ fontFamily: "var(--font-body)", color: "var(--text-muted)", fontSize: 13 }}>
             {description || "This action cannot be undone."}
           </AlertDialogDescription>
         </AlertDialogHeader>
         <AlertDialogFooter>
           <AlertDialogCancel className="sbd-btn-ghost" onClick={onClose} disabled={busy} style={{ background: "transparent", border: "1px solid var(--border-default)", color: "var(--text-secondary)", borderRadius: 8, fontFamily: "var(--font-body)", fontSize: 13 }}>
             Cancel
           </AlertDialogCancel>
           <AlertDialogAction className="sbd-btn" onClick={onConfirm} disabled={busy} style={{ background: "var(--danger-muted)", border: "1px solid var(--danger-border)", color: "var(--status-error)", borderRadius: 8, fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600 }}>
             {busy ? "Deleting..." : "Delete"}
           </AlertDialogAction>
         </AlertDialogFooter>
       </AlertDialogContent>
    </AlertDialog>
  );
}
