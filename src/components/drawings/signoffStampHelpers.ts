/** Pure stamp datetime format for SignoffStampPanel. */

export function formatStamp(iso: unknown): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso as any);
    return d.toLocaleString();
  } catch {
    return String(iso);
  }
}

export type StampMeta = {
  label: string;
  color: string;
  bg: string;
  border: string;
};

export const STAMP_META: Record<string, StampMeta> = {
  approved_for_fabrication: {
    label: "Approved for Fab",
    color: "var(--status-success)",
    bg: "rgba(16,185,129,0.12)",
    border: "rgba(16,185,129,0.35)",
  },
  approved_as_noted: {
    label: "Approved as Noted",
    color: "var(--status-success-bright)",
    bg: "rgba(132,204,22,0.12)",
    border: "rgba(132,204,22,0.35)",
  },
  revise_and_resubmit: {
    label: "Revise & Resubmit",
    color: "var(--status-warning)",
    bg: "rgba(245,158,11,0.14)",
    border: "rgba(245,158,11,0.40)",
  },
  rejected: {
    label: "Rejected",
    color: "var(--status-error)",
    bg: "rgba(239,68,68,0.12)",
    border: "rgba(239,68,68,0.35)",
  },
  reviewed: {
    label: "Reviewed",
    color: "var(--status-info)",
    bg: "rgba(59,130,246,0.12)",
    border: "rgba(59,130,246,0.35)",
  },
  for_information_only: {
    label: "For Info Only",
    color: "var(--text-muted)",
    bg: "rgba(107,114,128,0.12)",
    border: "rgba(107,114,128,0.35)",
  },
  void: {
    label: "Void",
    color: "var(--text-muted)",
    bg: "rgba(113,113,122,0.12)",
    border: "rgba(113,113,122,0.35)",
  },
};

export const mono: Record<string, string> = { fontFamily: "var(--font-mono)" };
