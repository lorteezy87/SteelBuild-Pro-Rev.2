// Inline quick-action controls for the Detailing Control Center "Next decision"
// card — extracted from triageBoard.tsx (behavior-preserving move).
import { useEffect, useRef, useState } from "react";
import { CalendarDays, ClipboardList, User } from "lucide-react";
import { DRAFTING_STATES } from "@/lib/detailingPackageState";
import {
  BIC_CHOICES,
  accent,
  border,
  error,
  fmtDate,
  getOperationalStateColor,
  mono,
  surface1,
  surface2,
  textMuted,
  textPrimary,
  toDateInputValue,
  warning,
} from "./format";

interface InlineOwnerControlProps {
  currentOwner: string;
  onAssign: (owner: string) => void;
  disabled: boolean;
  label?: string;
}

export function InlineOwnerControl({ currentOwner, onAssign, disabled, label = "Owner" }: InlineOwnerControlProps) {
  const [open, setOpen] = useState(false);
  const isUnassigned = !currentOwner || currentOwner === "Unassigned";

  return (
    <div style={{
      padding: "10px 12px",
      borderRadius: 10,
      background: surface1,
      border: `1px solid ${isUnassigned ? "color-mix(in srgb, var(--status-warning) 46%, transparent)" : border}`,
      position: "relative",
    }}>
      <div style={{
        fontFamily: mono, fontSize: 8, color: textMuted,
        letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4,
        display: "flex", alignItems: "center", gap: 5,
      }}>
        <User size={10} />
        {label}
      </div>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={disabled}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            width: "100%",
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: disabled ? "not-allowed" : "pointer",
            color: isUnassigned ? warning : textPrimary,
            fontSize: 12,
            fontWeight: 700,
            fontFamily: "inherit",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            textAlign: "left",
          }}
          title={`Click to assign ${label.toLowerCase()}`}
        >
          {isUnassigned ? "Assign..." : currentOwner}
        </button>
      ) : (
        <select
          autoFocus
          value=""
          disabled={disabled}
          onChange={(e) => {
            if (e.target.value) {
              onAssign(e.target.value);
              setOpen(false);
            }
          }}
          onBlur={() => setOpen(false)}
          style={{
            width: "100%",
            background: surface2,
            border: `1px solid ${accent}`,
            borderRadius: 6,
            padding: "3px 6px",
            color: textPrimary,
            fontFamily: mono,
            fontSize: 11,
            fontWeight: 700,
            outline: "none",
            cursor: "pointer",
          }}
        >
          <option value="" disabled>Select owner...</option>
          {BIC_CHOICES.map((choice) => (
            <option key={choice} value={choice}>{choice}</option>
          ))}
        </select>
      )}
    </div>
  );
}

interface InlineDateControlProps {
  currentDate: string | null;
  isOverdue: boolean;
  onSetDate: (date: string) => void;
  disabled: boolean;
}

export function InlineDateControl({ currentDate, isOverdue, onSetDate, disabled }: InlineDateControlProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => toDateInputValue(currentDate));
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasDate = !!currentDate;

  useEffect(() => {
    if (open) setDraft(toDateInputValue(currentDate));
  }, [open, currentDate]);

  useEffect(() => () => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
  }, []);

  const commit = (value: string) => {
    if (!value) return;
    if (blurTimer.current) {
      clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
    onSetDate(value);
    setOpen(false);
  };

  return (
    <div style={{
      padding: "10px 12px",
      borderRadius: 10,
      background: surface1,
      border: `1px solid ${isOverdue ? "color-mix(in srgb, var(--status-error) 46%, transparent)" : !hasDate ? "color-mix(in srgb, var(--status-warning) 46%, transparent)" : border}`,
      position: "relative",
    }}>
      <div style={{
        fontFamily: mono, fontSize: 8, color: textMuted,
        letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4,
        display: "flex", alignItems: "center", gap: 5,
      }}>
        <CalendarDays size={10} />
        Required
      </div>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={disabled}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            width: "100%",
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: disabled ? "not-allowed" : "pointer",
            color: isOverdue ? error : !hasDate ? warning : textPrimary,
            fontSize: 12,
            fontWeight: 700,
            fontFamily: "inherit",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            textAlign: "left",
          }}
          title="Click to set due date"
        >
          {hasDate ? fmtDate(currentDate) : "Set date..."}
        </button>
      ) : (
        <input
          type="date"
          autoFocus
          disabled={disabled}
          value={draft}
          onChange={(e) => {
            const next = e.target.value;
            setDraft(next);
            // Native pickers often fire change once a day is chosen — commit
            // immediately so a following blur cannot discard the selection.
            if (next) commit(next);
          }}
          onBlur={() => {
            // Opening the native calendar can blur the input before change
            // fires. Delay close so the selected day still commits.
            if (blurTimer.current) clearTimeout(blurTimer.current);
            blurTimer.current = setTimeout(() => {
              setOpen(false);
              blurTimer.current = null;
            }, 250);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              if (blurTimer.current) clearTimeout(blurTimer.current);
              setOpen(false);
            }
            if (e.key === "Enter" && draft) {
              e.preventDefault();
              commit(draft);
            }
          }}
          style={{
            width: "100%",
            background: surface2,
            border: `1px solid ${accent}`,
            borderRadius: 6,
            padding: "3px 6px",
            color: textPrimary,
            // Keep native calendar readable under command dark/light skins.
            colorScheme: "light dark",
            fontFamily: mono,
            fontSize: 11,
            fontWeight: 700,
            outline: "none",
            cursor: "pointer",
          }}
        />
      )}
    </div>
  );
}

interface InlineDetailingControlProps {
  current: string | null | undefined;
  onAdvance: (next: string) => void;
  disabled: boolean;
}

export function InlineDetailingControl({ current, onAdvance, disabled }: InlineDetailingControlProps) {
  return (
    <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: surface1, border: `1px solid ${border}` }}>
      <div style={{
        fontFamily: mono, fontSize: 8, color: textMuted,
        letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8,
        display: "flex", alignItems: "center", gap: 5,
      }}>
        <ClipboardList size={10} />
        Detailing state
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {DRAFTING_STATES.map((s) => {
          const isCurrent = current === s;
          const color = getOperationalStateColor(s);
          return (
            <button
              key={s}
              type="button"
              disabled={disabled || isCurrent}
              onClick={() => onAdvance(s)}
              title={isCurrent ? `Already ${s}` : `Set to ${s}`}
              style={{
                padding: "5px 9px",
                borderRadius: 8,
                fontFamily: mono,
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.04em",
                cursor: disabled || isCurrent ? "default" : "pointer",
                color: isCurrent ? "#0b0e14" : color,
                background: isCurrent ? color : `color-mix(in srgb, ${color} 12%, transparent)`,
                border: `1px solid color-mix(in srgb, ${color} 42%, transparent)`,
                opacity: disabled && !isCurrent ? 0.6 : 1,
              }}
            >
              {s}
            </button>
          );
        })}
      </div>
    </div>
  );
}
