import React from "react";
import {
  DETAILING_STAGE_GATES,
  DETAILING_STAGE_META,
  getActiveStage,
  getEffectiveDueDate,
} from "@/lib/stageDates";
import {
  drawerControlStyle,
  drawerMutedBorder,
  drawerMutedText,
  drawerPanel,
  drawerPanelStrong,
  drawerText,
  drawerBorder,
} from "./taskDetailTokens";

type FormFieldProps = {
  label: string;
  type?: string;
  value?: string | number | null;
  onChange: (value: string | number) => void;
  readOnly?: boolean;
  options?: string[];
};

export function FormField({
  label,
  type = "text",
  value,
  onChange,
  readOnly = false,
  options = [],
}: FormFieldProps) {
  return (
    <div>
      <label
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 11,
          color: drawerMutedText,
          display: "block",
          marginBottom: 5,
        }}
      >
        {label}
      </label>
      {type === "select" ? (
        <select
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          style={{
            ...drawerControlStyle,
          }}
        >
          <option value="">—</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : type === "date" ? (
        <input
          type="date"
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          style={{
            ...drawerControlStyle,
          }}
        />
      ) : type === "slider" ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="range"
            min="0"
            max="100"
            value={(value as number) || 0}
            onChange={(e) => onChange(parseInt(e.target.value, 10))}
            style={{ flex: 1 }}
          />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: drawerMutedText,
              minWidth: 32,
              textAlign: "right",
            }}
          >
            {(value as number) || 0}%
          </span>
        </div>
      ) : (
        <input
          type={type}
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
          readOnly={readOnly}
          style={{
            ...drawerControlStyle,
            background: readOnly ? drawerPanelStrong : drawerControlStyle.background,
            color: readOnly ? drawerMutedText : drawerText,
          }}
        />
      )}
    </div>
  );
}

type ScheduleFlagProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
};

export function ScheduleFlag({ label, checked, onChange, hint }: ScheduleFlagProps) {
  return (
    <label
      title={hint}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        cursor: "pointer",
        userSelect: "none",
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: checked ? "var(--accent)" : drawerMutedText,
      }}
    >
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: "var(--accent)" }}
      />
      {label}
    </label>
  );
}

type DateInputProps = {
  value: string;
  onChange: (iso: string) => void;
  ariaLabel: string;
  placeholder: string;
};

function DateInput({ value, onChange, ariaLabel, placeholder }: DateInputProps) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          fontWeight: 700,
          letterSpacing: "0.10em",
          textTransform: "uppercase",
          color: drawerMutedText,
        }}
      >
        {placeholder}
      </span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        style={{
          ...drawerControlStyle,
          minWidth: 0,
        }}
      />
    </label>
  );
}

type StageGate = (typeof DETAILING_STAGE_GATES)[number];

type StageDatesMap = Record<string, { start?: string | null; end?: string | null } | undefined>;

type StageGateDatesProps = {
  stageDates: StageDatesMap;
  onChange: (next: StageDatesMap) => void;
  derivedStart?: string | null;
  derivedEnd?: string | null;
};

export function StageGateDates({
  stageDates,
  onChange,
  derivedStart,
  derivedEnd,
}: StageGateDatesProps) {
  const setGateField = (gate: StageGate, field: "start" | "end", iso: string) => {
    const next = { ...stageDates };
    const prev = next[gate] || { start: null, end: null };
    next[gate] = { ...prev, [field]: iso || null };
    onChange(next);
  };
  const clearGate = (gate: StageGate) => {
    const next = { ...stageDates };
    next[gate] = { start: null, end: null };
    onChange(next);
  };

  const allDates: string[] = [];
  for (const g of DETAILING_STAGE_GATES) {
    const v = stageDates?.[g];
    if (v?.start) allDates.push(v.start);
    if (v?.end) allDates.push(v.end);
  }
  const sortedAll = allDates.sort();
  const previewStart = sortedAll[0] || null;
  const previewEnd = sortedAll[sortedAll.length - 1] || null;

  const activeGate = getActiveStage(stageDates);
  const dueDate = getEffectiveDueDate(stageDates);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: drawerMutedText,
          }}
        >
          Detailing Stage Dates
        </div>
        {activeGate && (
          <div
            title="The gate the schedule is currently tracking — its end date is the live due date."
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.10em",
              color: DETAILING_STAGE_META[activeGate]?.color || "var(--accent)",
            }}
          >
            ACTIVE · {activeGate}
            {dueDate ? ` · DUE ${dueDate}` : ""}
          </div>
        )}
      </div>

      {DETAILING_STAGE_GATES.map((gate) => {
        const meta = DETAILING_STAGE_META[gate];
        const v = stageDates?.[gate] || { start: null, end: null };
        const start = v.start || "";
        const end = v.end || "";
        const filled = !!(start || end);
        const isActive = gate === activeGate;
        return (
          <div
            key={gate}
            style={{
              display: "grid",
              gridTemplateColumns: "112px minmax(0, 1fr) minmax(0, 1fr) 28px",
              alignItems: "center",
              gap: 8,
              padding: "10px 12px",
              background: filled
                ? `linear-gradient(90deg, color-mix(in srgb, ${meta.color} 16%, ${drawerPanelStrong}) 0%, ${drawerPanelStrong} 70%)`
                : drawerPanel,
              border: `1px solid ${filled ? `color-mix(in srgb, ${meta.color} 48%, ${drawerMutedBorder})` : drawerMutedBorder}`,
              borderLeft: `3px solid ${isActive ? meta.color : filled ? meta.color : drawerBorder}`,
              borderRadius: 8,
              boxShadow: isActive
                ? `0 0 0 1px color-mix(in srgb, ${meta.color} 34%, transparent), var(--shadow-lg)`
                : "none",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  fontWeight: 800,
                  color: meta.color,
                  letterSpacing: "0.08em",
                }}
              >
                {meta.label}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 9,
                  color: drawerMutedText,
                  lineHeight: 1.2,
                }}
              >
                {meta.caption}
              </span>
            </div>
            <DateInput
              ariaLabel={`${gate} start date`}
              placeholder="start"
              value={start}
              onChange={(iso) => setGateField(gate, "start", iso)}
            />
            <DateInput
              ariaLabel={`${gate} end date`}
              placeholder="end"
              value={end}
              onChange={(iso) => setGateField(gate, "end", iso)}
            />
            <button
              type="button"
              onClick={() => clearGate(gate)}
              disabled={!filled}
              aria-label={`Clear ${gate}`}
              style={{
                background: "transparent",
                border: "none",
                color: filled
                  ? drawerMutedText
                  : "color-mix(in srgb, var(--text-muted) 30%, transparent)",
                cursor: filled ? "pointer" : "not-allowed",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                padding: "2px 6px",
              }}
            >
              ✕
            </button>
          </div>
        );
      })}

      <div
        style={{
          marginTop: 2,
          padding: "6px 8px",
          background: drawerPanel,
          border: `1px dashed ${drawerMutedBorder}`,
          borderRadius: 8,
          display: "flex",
          justifyContent: "space-between",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: drawerMutedText,
          letterSpacing: "0.04em",
        }}
      >
        <span>Bar start {previewStart || derivedStart || "—"}</span>
        <span>Bar end {previewEnd || derivedEnd || "—"}</span>
      </div>
    </div>
  );
}
