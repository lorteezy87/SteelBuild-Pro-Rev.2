import React, { useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

/**
 * Shared delete confirm. AlertDialogAction would otherwise close immediately
 * on click — before a failed mutation can be known. We prevent that close,
 * await onConfirm when it returns a Promise, and only dismiss on success.
 *
 * Callers should pass `() => mutateAsync(...)` (not fire-and-forget mutate)
 * so rejections keep the dialog open. Pass `busy` from `mutation.isPending`.
 */
export default function DeleteDialog({ open, onClose, onConfirm, title, description, busy = false, isDeleting = false }) {
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  const isBusy = busy || isDeleting || awaitingConfirm;

  const handleOpenChange = (nextOpen) => {
    if (!nextOpen && !isBusy) onClose?.();
  };

  const handleConfirm = async (event) => {
    event.preventDefault();
    if (isBusy) return;
    setAwaitingConfirm(true);
    try {
      await Promise.resolve(onConfirm?.());
      onClose?.();
    } catch {
      // Keep open; callers toast via mutation onError.
    } finally {
      setAwaitingConfirm(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
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
           <AlertDialogCancel className="sbd-btn-ghost" onClick={onClose} disabled={isBusy} style={{ background: "transparent", border: "1px solid var(--border-default)", color: "var(--text-secondary)", borderRadius: 8, fontFamily: "var(--font-body)", fontSize: 13 }}>
             Cancel
           </AlertDialogCancel>
           <AlertDialogAction className="sbd-btn" onClick={handleConfirm} disabled={isBusy} style={{ background: "var(--danger-muted)", border: "1px solid var(--danger-border)", color: "var(--status-error)", borderRadius: 8, fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600 }}>
             {isBusy ? "Deleting..." : "Delete"}
           </AlertDialogAction>
         </AlertDialogFooter>
       </AlertDialogContent>
    </AlertDialog>
  );
}
