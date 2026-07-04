// Bulk "Set Parent" picker modal for the Schedule page. Extracted from
// Schedule.tsx, where the two return paths were identical EXCEPT the backdrop
// `background` value (command_ui: "rgba(1,4,10,0.6)"; legacy:
// "color-mix(in srgb, var(--bg-base) 60%, transparent)"). That single
// byte-level difference is parameterized via the `backdrop` prop so each path
// renders exactly what it did before.
import type { ScheduleTask } from "./types";

interface BulkParentModalProps {
  /** Backdrop `background` CSS value — differs per render path. */
  backdrop: string;
  count: number;
  options: ScheduleTask[];
  onClose: () => void;
  onSelectParent: (newParentId: string | null) => void;
}

export default function BulkParentModal({ backdrop, count, options, onClose, onSelectParent }: BulkParentModalProps) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: backdrop, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--bg-surface-high)", border: "1px solid var(--accent-border)", borderRadius: 14, padding: 20, width: 420 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--accent)", marginBottom: 12 }}>
          SET PARENT FOR {count} TASK{count !== 1 ? "S" : ""}
        </div>
        <select
          className="sbd-select"
          defaultValue=""
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            onSelectParent(v === "__root__" ? null : v);
          }}
          style={{ width: "100%" }}
        >
          <option value="" disabled>— Select a parent… —</option>
          <option value="__root__">Top level (no parent)</option>
          {options.map((t: any) => (
            <option key={t.id} value={t.id}>
              {t.wbs_code ? `${t.wbs_code} — ` : ""}{t.task_name}
            </option>
          ))}
        </select>
        <div style={{ marginTop: 14, textAlign: "right" }}>
          <button className="sbd-btn sbd-btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
