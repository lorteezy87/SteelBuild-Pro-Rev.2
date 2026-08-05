/**
 * Confirm attaching a just-uploaded revision to an open linked submittal.
 * Event glue — never silent; Attach / Not now only.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/pages/submittals/uiCompat";
import type { LinkableSubmittal } from "@/lib/submittalLinkGlue";

export interface AttachRevisionToSubmittalModalProps {
  open: boolean;
  setName?: string | null;
  revisionLabel?: string | null;
  candidates: LinkableSubmittal[];
  busy?: boolean;
  onAttach: (submittalId: string) => void | Promise<void>;
  onDismiss: () => void;
}

function labelFor(s: LinkableSubmittal): string {
  const num = s.submittal_number ? `SUB-${s.submittal_number}` : "Submittal";
  const title = (s.title || "").trim();
  return title ? `${num} — ${title}` : num;
}

export default function AttachRevisionToSubmittalModal({
  open,
  setName,
  revisionLabel,
  candidates,
  busy = false,
  onAttach,
  onDismiss,
}: AttachRevisionToSubmittalModalProps) {
  const [pickedId, setPickedId] = useState<string | null>(candidates[0]?.id ?? null);
  useEffect(() => {
    setPickedId(candidates[0]?.id ?? null);
  }, [candidates]);
  const selectedId = pickedId || candidates[0]?.id || null;
  const single = candidates.length === 1;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onDismiss()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Attach revision to open submittal?</DialogTitle>
        </DialogHeader>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.45 }}>
          {revisionLabel ? (
            <>Revision <strong style={{ color: "var(--text-primary)" }}>{revisionLabel}</strong></>
          ) : (
            "This revision"
          )}
          {setName ? <> for set <strong style={{ color: "var(--text-primary)" }}>{setName}</strong></> : null}
          {" "}has open linked submittal{candidates.length === 1 ? "" : "s"}. Confirm to keep the link current.
        </div>

        {single ? (
          <div style={{
            marginTop: 14,
            padding: "10px 12px",
            border: "1px solid var(--border-default)",
            borderRadius: 2,
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--text-primary)",
          }}>
            {labelFor(candidates[0]!)}
          </div>
        ) : (
          <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
            {candidates.map((c) => {
              const id = c.id || "";
              const checked = selectedId === id;
              return (
                <label
                  key={id}
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    padding: "10px 12px",
                    border: checked ? "1px solid var(--color-primary)" : "1px solid var(--border-default)",
                    borderRadius: 2,
                    cursor: busy ? "default" : "pointer",
                    background: checked ? "color-mix(in srgb, var(--color-primary) 8%, transparent)" : "transparent",
                  }}
                >
                  <input
                    type="radio"
                    name="attach-submittal"
                    checked={checked}
                    disabled={busy}
                    onChange={() => setPickedId(id)}
                    style={{ marginTop: 2 }}
                  />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{labelFor(c)}</span>
                </label>
              );
            })}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <button type="button" className="sbd-btn-ghost" disabled={busy} onClick={onDismiss}>
            Not now
          </button>
          <button
            type="button"
            className="sbd-btn-primary"
            disabled={busy || !selectedId}
            onClick={() => selectedId && void onAttach(selectedId)}
          >
            {busy ? "Attaching…" : "Attach"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
