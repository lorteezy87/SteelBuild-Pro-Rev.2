import type { ComponentType, ReactNode } from "react";
import {
  mono,
  textPrimary,
} from "./format";
export { ApprovalMatrix } from "./approvalMatrix";
export { LeadTimesModal } from "./leadTimesModal";
export { RevisionImpactBoard } from "./revisionImpactBoard";
export { DrawingRegisterTable } from "./drawingRegisterTable";
export { FleetHealthStrip } from "./fleetHealthStrip";
export { TriageBoard } from "./triageBoard";

type IconType = ComponentType<{ size?: number | string; color?: string }>;

interface HeaderSignalProps {
  icon: IconType;
  label: string;
  value: ReactNode;
  tone: string;
}

export function HeaderSignal({ icon: Icon, label, value, tone }: HeaderSignalProps) {
  return (
    <div className="sbp-header-signal" style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      minHeight: 36,
      padding: "7px 10px",
      borderRadius: 10,
      background: `color-mix(in srgb, ${tone} 12%, transparent)`,
      border: `1px solid color-mix(in srgb, ${tone} 32%, transparent)`,
      color: tone,
      fontFamily: mono,
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      whiteSpace: "nowrap",
    }}>
      <Icon size={14} />
      <span>{label}</span>
      <span className="sbd-num" style={{ color: textPrimary, fontSize: 13 }}>
        {value}
      </span>
    </div>
  );
}
