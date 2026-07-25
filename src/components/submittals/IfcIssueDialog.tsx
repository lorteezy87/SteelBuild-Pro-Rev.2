/**
 * IfcIssueDialog — OFS → IFC scrub-completion gate (Slice 4).
 *
 * OFS is Out for Scrub (post-approval cleanup), not a resubmittal. Issuing
 * for construction requires the fixed checklist (or an audited override).
 *
 * Uses the same Dialog primitive as other submittal modals (no <form>).
 */
import { useState } from "react";
import type { ComponentType, PropsWithChildren } from "react";
import {
  Dialog as DialogRaw,
  DialogContent as DialogContentRaw,
  DialogFooter as DialogFooterRaw,
  DialogHeader as DialogHeaderRaw,
  DialogTitle as DialogTitleRaw,
} from "@/components/ui/dialog";
import {
  OFS_CHECKLIST_ITEMS,
  isOfsChecklistComplete,
  type OfsChecklistState,
} from "@/lib/ofsCompletionGate";

// ui/dialog is still .jsx forwardRef — cast for typed children/className.
type AnyProps = PropsWithChildren<Record<string, any>>;
const Dialog = DialogRaw as unknown as ComponentType<AnyProps>;
const DialogContent = DialogContentRaw as unknown as ComponentType<AnyProps>;
const DialogFooter = DialogFooterRaw as unknown as ComponentType<AnyProps>;
const DialogHeader = DialogHeaderRaw as unknown as ComponentType<AnyProps>;
const DialogTitle = DialogTitleRaw as unknown as ComponentType<AnyProps>;

export interface IfcIssueDialogProps {
  open: boolean;
  submittalNumber?: string | null;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (args: {
    checklist: OfsChecklistState;
    overrideReason: string | null;
  }) => void;
}

export default function IfcIssueDialog({
  open,
  submittalNumber,
  busy = false,
  onClose,
  onConfirm,
}: IfcIssueDialogProps) {
  const [checklist, setChecklist] = useState<OfsChecklistState>({});
  const [overrideReason, setOverrideReason] = useState("");
  const [showOverride, setShowOverride] = useState(false);

  const complete = isOfsChecklistComplete(checklist);
  const override = overrideReason.trim();
  const canIssue = complete || override.length > 0;

  const toggle = (key: keyof OfsChecklistState) => {
    setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleClose = () => {
    if (busy) return;
    setChecklist({});
    setOverrideReason("");
    setShowOverride(false);
    onClose();
  };

  const handleConfirm = () => {
    if (busy || !canIssue) return;
    onConfirm({
      checklist,
      overrideReason: complete ? null : override,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => !o && handleClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            Issue for Construction{submittalNumber ? ` · ${submittalNumber}` : ""}
          </DialogTitle>
        </DialogHeader>

        <p
          style={{
            margin: "0 0 12px",
            fontFamily: "var(--font-body, inherit)",
            fontSize: 13,
            color: "var(--text-secondary)",
            lineHeight: 1.45,
          }}
        >
          This package is <strong style={{ color: "var(--text-primary)" }}>OFS — Out for Scrub</strong>.
          Scrub is post-approval cleanup, not a resubmittal. Complete the checklist
          before issuing for construction.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {OFS_CHECKLIST_ITEMS.map((item) => {
            const checked = checklist[item.key] === true;
            return (
              <label
                key={item.key}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  padding: "10px 12px",
                  border: "1px solid var(--divider)",
                  borderRadius: 2,
                  background: checked ? "rgba(255,107,26,0.08)" : "var(--bg-surface, transparent)",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(item.key)}
                  disabled={busy}
                  style={{ marginTop: 2, accentColor: "var(--color-primary)" }}
                />
                <span>
                  <span
                    style={{
                      display: "block",
                      fontFamily: "var(--font-display)",
                      fontSize: 13,
                      fontWeight: 700,
                      color: "var(--text-primary)",
                    }}
                  >
                    {item.label}
                  </span>
                  <span
                    style={{
                      display: "block",
                      marginTop: 2,
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: "var(--text-muted)",
                      letterSpacing: "0.02em",
                    }}
                  >
                    {item.hint}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        {!complete && (
          <div style={{ marginTop: 14 }}>
            {!showOverride ? (
              <button
                type="button"
                onClick={() => setShowOverride(true)}
                disabled={busy}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: "var(--accent)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                Issue with audited override…
              </button>
            ) : (
              <div>
                <label
                  style={{
                    display: "block",
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--text-muted)",
                    marginBottom: 6,
                  }}
                >
                  Override reason (required)
                </label>
                <textarea
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  disabled={busy}
                  rows={3}
                  placeholder="Why is this package issuing for construction without a completed scrub checklist?"
                  style={{
                    width: "100%",
                    resize: "vertical",
                    borderRadius: 2,
                    border: "1px solid var(--divider)",
                    background: "var(--bg-surface, transparent)",
                    color: "var(--text-primary)",
                    fontFamily: "var(--font-body, inherit)",
                    fontSize: 13,
                    padding: "8px 10px",
                  }}
                />
              </div>
            )}
          </div>
        )}

        <DialogFooter style={{ marginTop: 16, gap: 8 }}>
          <button
            type="button"
            className="sbd-btn-ghost"
            onClick={handleClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="sbd-btn-primary"
            onClick={handleConfirm}
            disabled={busy || !canIssue}
            style={{ opacity: busy || !canIssue ? 0.55 : 1 }}
          >
            {busy ? "Issuing…" : "Issue for Construction"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
