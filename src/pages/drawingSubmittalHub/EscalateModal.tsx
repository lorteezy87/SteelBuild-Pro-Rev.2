/**
 * EscalateModal — contextual escalation from the Detailing control board.
 *
 * Converts a problematic drawing-set package / rejected submittal straight
 * into a draft RFI or a potential change order (PCO, a Draft change_orders
 * row) without leaving the hub. The created record carries
 * metadata.origin so the escalation stays traceable back to the package.
 *
 * Human-driven end to end: the user reviews the prefilled draft and clicks
 * create — nothing is auto-submitted (§17/§23).
 */
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CircleDollarSign, FileQuestion } from "lucide-react";
// uiCompat: the shadcn .jsx primitives need permissive casts for .tsx callers.
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../submittals/uiCompat";
import { entities } from "@/api/supabaseClient";
import { getNextFormattedNumber } from "@/components/shared/numberSequencing";
import { invalidateEntity } from "@/services/cacheRegistry";
import { toUserErrorMessage, withProjectId } from "@/lib/mutations/standardMutation";
import { usePermissions } from "@/services/permissions";
import { border, error as errorTone, fmtDate, mono, surface2, textMuted, textPrimary } from "./format";

export type EscalationKind = "rfi" | "pco";

const RFI_PRIORITIES = ["Critical", "High", "Medium", "Low"];
const PCO_REASONS = ["Design Change", "Owner Request", "Differing Conditions", "Scope Gap", "Error & Omission", "Other"];

interface EscalateModalProps {
  item: any;                       // triage item from the hub read-model
  initialKind?: EscalationKind;
  projectId: string | undefined;
  projectName: string;
  onClose: () => void;
}

function buildContextBody(item: any): string {
  return [
    `Escalated from Detailing Control — ${item.kind || "Drawing Set"}: ${item.title}`,
    `Current status: ${item.status || "—"}`,
    `Ball in court: ${item.owner || "Unassigned"}`,
    item.dueDate ? `Required date: ${fmtDate(item.dueDate)}` : null,
    item.group ? `Package: ${item.group}` : null,
    "",
    "Issue / question:",
    "",
  ].filter((line) => line !== null).join("\n");
}

export default function EscalateModal({ item, initialKind = "rfi", projectId, projectName, onClose }: EscalateModalProps) {
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canRfi = can("create", "rfi");
  const canPco = can("create", "change_order");

  const [kind, setKind] = useState<EscalationKind>(
    initialKind === "pco" ? (canPco ? "pco" : "rfi") : (canRfi ? "rfi" : "pco"),
  );
  const [title, setTitle] = useState(`${item.title} — ${item.status || "detailing issue"}`.slice(0, 180));
  const [body, setBody] = useState(() => buildContextBody(item));
  const [priority, setPriority] = useState(item?.due?.overdue ? "High" : "Medium");
  const [reasonCode, setReasonCode] = useState("Design Change");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const origin = useMemo(() => ({
    source: "detailing-escalation",
    item_kind: item.kind || null,
    submittal_id: item._submittalId || null,
    drawing_set_id: item._drawingSetId || null,
    package_title: item.title || null,
  }), [item]);

  const create = async () => {
    if (!projectId) { toast.error("No active project"); return; }
    if (!title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      if (kind === "rfi") {
        const rfiNumber = await getNextFormattedNumber({
          projectId, recordType: "RFI", entityName: "RFI", fieldName: "rfi_number", prefix: "RFI #",
        });
        await entities.RFI.create(withProjectId({
          project_name: projectName || null,
          rfi_number: rfiNumber,
          title: title.trim(),
          question: body,
          status: "Open",
          priority,
          ball_in_court: "EOR",
          drawing_set_id: item._drawingSetId || null,
          date_required: item.dueDate ? String(item.dueDate).slice(0, 10) : null,
          metadata: { origin },
        }, projectId) as any);
        await invalidateEntity(qc, "rfi", projectId);
        toast.success(`${rfiNumber} drafted from "${item.title}" — see RFIs`);
      } else {
        const coNumber = await getNextFormattedNumber({
          projectId, recordType: "CO", entityName: "ChangeOrder", fieldName: "co_number", prefix: "CO #",
        });
        await entities.ChangeOrder.create(withProjectId({
          project_name: projectName || null,
          co_number: coNumber,
          title: title.trim(),
          description: body,
          status: "Draft",
          reason_code: reasonCode,
          co_amount: amount !== "" && Number.isFinite(Number(amount)) ? Number(amount) : null,
          metadata: { origin, pco: true },
        }, projectId) as any);
        await invalidateEntity(qc, "change_order", projectId);
        toast.success(`${coNumber} drafted as a potential CO — see Change Orders`);
      }
      onClose();
    } catch (err: any) {
      toast.error(`Failed to create draft: ${toUserErrorMessage(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const kindOptions: Array<{ key: EscalationKind; label: string; icon: typeof FileQuestion; enabled: boolean; hint: string }> = [
    { key: "rfi", label: "Draft RFI", icon: FileQuestion, enabled: canRfi, hint: "Question for the design team" },
    { key: "pco", label: "Draft PCO", icon: CircleDollarSign, enabled: canPco, hint: "Potential change order (Draft)" },
  ];

  return (
    <Dialog open onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent className="detailing-cc" style={{
        maxWidth: 560,
        background: "var(--bg-surface-secondary)",
        border: `1px solid ${border}`,
      }}>
        <DialogHeader>
          <DialogTitle>
            <span style={{ fontFamily: "var(--font-body)", fontSize: 16, fontWeight: 700, color: textPrimary }}>
              Escalate: {item.title}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 4 }}>
          {/* Kind toggle */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {kindOptions.map(({ key, label, icon: Icon, enabled, hint }) => (
              <button
                key={key}
                type="button"
                disabled={!enabled || saving}
                onClick={() => setKind(key)}
                title={enabled ? hint : "You don't have permission for this"}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3,
                  padding: "10px 12px", borderRadius: 10, cursor: enabled ? "pointer" : "not-allowed",
                  border: `1px solid ${kind === key ? "var(--accent)" : border}`,
                  background: kind === key ? "color-mix(in srgb, var(--accent) 13%, transparent)" : surface2,
                  color: kind === key ? "var(--accent)" : textMuted,
                  opacity: enabled ? 1 : 0.45,
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: mono, fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  <Icon size={14} /> {label}
                </span>
                <span style={{ fontSize: 11, color: textMuted }}>{hint}</span>
              </button>
            ))}
          </div>

          {/* Title */}
          <label style={{ display: "block" }}>
            <span style={{ fontFamily: mono, fontSize: 9, color: textMuted, letterSpacing: "0.1em", textTransform: "uppercase" }}>Title *</span>
            <input
              className="sbd-input"
              value={title}
              disabled={saving}
              onChange={(e) => setTitle(e.target.value)}
              style={{ width: "100%", marginTop: 4 }}
            />
          </label>

          {/* Body */}
          <label style={{ display: "block" }}>
            <span style={{ fontFamily: mono, fontSize: 9, color: textMuted, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              {kind === "rfi" ? "Question" : "Description"}
            </span>
            <textarea
              className="sbd-textarea"
              rows={7}
              value={body}
              disabled={saving}
              onChange={(e) => setBody(e.target.value)}
              style={{ width: "100%", marginTop: 4, resize: "vertical", fontSize: 12, lineHeight: 1.5 }}
            />
          </label>

          {/* Kind-specific fields */}
          {kind === "rfi" ? (
            <label style={{ display: "block", maxWidth: 220 }}>
              <span style={{ fontFamily: mono, fontSize: 9, color: textMuted, letterSpacing: "0.1em", textTransform: "uppercase" }}>Priority</span>
              <select className="sbd-select" value={priority} disabled={saving} onChange={(e) => setPriority(e.target.value)} style={{ width: "100%", marginTop: 4 }}>
                {RFI_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={{ display: "block" }}>
                <span style={{ fontFamily: mono, fontSize: 9, color: textMuted, letterSpacing: "0.1em", textTransform: "uppercase" }}>Reason code</span>
                <select className="sbd-select" value={reasonCode} disabled={saving} onChange={(e) => setReasonCode(e.target.value)} style={{ width: "100%", marginTop: 4 }}>
                  {PCO_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <label style={{ display: "block" }}>
                <span style={{ fontFamily: mono, fontSize: 9, color: textMuted, letterSpacing: "0.1em", textTransform: "uppercase" }}>Rough order ($, optional)</span>
                <input
                  className="sbd-input"
                  type="number"
                  min="0"
                  value={amount}
                  disabled={saving}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  style={{ width: "100%", marginTop: 4 }}
                />
              </label>
            </div>
          )}

          {item?.due?.overdue && (
            <div style={{ fontFamily: mono, fontSize: 10, color: errorTone, letterSpacing: "0.04em" }}>
              ⚠ This package is past due — the draft carries its context automatically.
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, borderTop: `1px solid ${border}`, paddingTop: 12 }}>
            <button type="button" className="sbd-btn-ghost" disabled={saving} onClick={onClose} style={{ minHeight: 36 }}>
              Cancel
            </button>
            <button
              type="button"
              className="sbd-btn-primary"
              disabled={saving || !title.trim() || (kind === "rfi" ? !canRfi : !canPco)}
              onClick={create}
              style={{ minHeight: 36, display: "inline-flex", alignItems: "center", gap: 7 }}
            >
              {saving ? "Creating…" : kind === "rfi" ? "Create draft RFI" : "Create draft PCO"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
