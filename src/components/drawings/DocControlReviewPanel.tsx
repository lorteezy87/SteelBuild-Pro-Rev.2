/**
 * DocControlReviewPanel — the Document Control read on an incoming upload.
 *
 * Renders one card per incoming sheet: the five title-block fields, the seal and
 * signature state, the register verdict, the change summary, and the findings.
 * Everything it shows comes from `src/lib/docControl` — this component computes
 * no verdicts of its own, so the panel and the ingestion payload can never
 * disagree.
 *
 * The visual grammar it has to keep: a field the extractor never inspected is
 * drawn differently from a field it read and found blank. Flattening the two to
 * one grey dash is the bug the whole module exists to prevent, and it would be
 * reintroduced here first.
 */

import React, { useCallback, useMemo, useState } from "react";
import { AlertTriangle, Check, Copy, FileWarning, HelpCircle, Stamp } from "lucide-react";
import {
  attestFromHuman,
  buildIntakeRecords,
  type DocControlAttestations,
  type DocControlFinding,
  type DocControlRecord,
  type DocField,
  type IntakeInput,
} from "@/lib/docControl";

export type AttestKind = "stamp" | "signature";

/** Callback shape shared by every caller that lets a reviewer attest. */
export type AttestHandler = (
  sheetNumber: string,
  kind: AttestKind,
  state: "present" | "absent",
) => void;

/**
 * Reviewer attestation state, keyed by exact sheet number.
 *
 * Lives in a hook rather than in the panel so the two surfaces that render the
 * panel — the revision-upload wizard and the Document Control page — build their
 * records from the same attestations without each inventing a store. The panel
 * itself stays presentational: it decides nothing.
 */
export function useDocControlAttestations(reviewerName = "") {
  const [attestationsBySheetNumber, setAttestations] = useState<
    Record<string, Partial<DocControlAttestations>>
  >({});

  const attest = useCallback<AttestHandler>(
    (sheetNumber, kind, state) => {
      setAttestations((prev) => ({
        ...prev,
        [sheetNumber]: { ...prev[sheetNumber], [kind]: attestFromHuman(state, reviewerName) },
      }));
    },
    [reviewerName],
  );

  return { attestationsBySheetNumber, attest };
}

export type DocControlReviewPanelProps = {
  /** Records already built by the caller. The panel computes no verdicts. */
  records: DocControlRecord[];
  /** Omit to render read-only — every attest control disappears. */
  onAttest?: AttestHandler | null;
};

export default function DocControlReviewPanel({ records, onAttest }: DocControlReviewPanelProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const blockers = records.filter((r) => r.disposition === "hold").length;
  const warnings = records.reduce(
    (sum, r) => sum + r.findings.filter((f) => f.severity === "warning").length,
    0,
  );

  const copyJson = () => {
    const payload = JSON.stringify(records, null, 2);
    // `navigator.clipboard` is absent on http origins and in some webviews —
    // the button must not throw the wizard into an error state over it.
    void Promise.resolve(navigator?.clipboard?.writeText?.(payload))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => setCopied(false));
  };

  if (records.length === 0) return null;

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span style={headingStyle}>Document Control</span>
        <span style={mutedMonoStyle}>{records.length} incoming</span>
        <span style={dotStyle}>·</span>
        <span style={{ ...monoStyle, color: blockers ? "var(--status-error-bright)" : "var(--text-muted)" }}>
          {blockers} on hold
        </span>
        <span style={dotStyle}>·</span>
        <span style={{ ...monoStyle, color: warnings ? "var(--status-warning-bright)" : "var(--text-muted)" }}>
          {warnings} to check
        </span>
        <button type="button" onClick={copyJson} style={copyButtonStyle}>
          <Copy size={11} aria-hidden="true" />
          {copied ? "Copied" : "Copy JSON"}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {records.map((record, index) => {
          const sheetNumber = record.titleBlock.sheetNumber.value;
          const key = sheetNumber || `unidentified-${index}`;
          const open = expanded[key] ?? record.disposition === "hold";
          return (
            <SheetCard
              key={key}
              record={record}
              open={open}
              onToggle={() => setExpanded((prev) => ({ ...prev, [key]: !open }))}
              onAttest={
                onAttest && sheetNumber
                  ? (kind, state) => onAttest(sheetNumber, kind, state)
                  : null
              }
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * The revision-upload wizard's adapter: intake input in, panel out.
 *
 * Kept separate from the panel so the Document Control page can cross-reference
 * against the project's whole live register instead of the wizard's set-scoped
 * match verdict, and still render exactly the same review.
 */
export function DocControlIntakePanel({
  intake,
  reviewerName = "",
}: {
  intake: Omit<IntakeInput, "attestationsBySheetNumber">;
  reviewerName?: string;
}) {
  const { attestationsBySheetNumber, attest } = useDocControlAttestations(reviewerName);
  const records = useMemo(
    () => buildIntakeRecords({ ...intake, attestationsBySheetNumber }),
    [intake, attestationsBySheetNumber],
  );
  return <DocControlReviewPanel records={records} onAttest={attest} />;
}

function SheetCard({
  record,
  open,
  onToggle,
  onAttest,
}: {
  record: DocControlRecord;
  open: boolean;
  onToggle: () => void;
  onAttest: ((kind: AttestKind, state: "present" | "absent") => void) | null;
}) {
  const held = record.disposition === "hold";
  const sheetNumber = record.titleBlock.sheetNumber.value;

  return (
    <div style={{ ...cardStyle, borderColor: held ? "rgba(255,61,61,0.28)" : "var(--divider)" }}>
      <button type="button" onClick={onToggle} style={cardHeaderStyle}>
        <span style={{ ...monoStyle, fontSize: 11, color: "var(--text-primary)" }}>
          {sheetNumber || "(no sheet number)"}
        </span>
        <span style={{ ...bodyTextStyle, color: "var(--text-secondary)", flex: 1, textAlign: "left" }}>
          {record.ingest.values.title || "—"}
        </span>
        <span
          style={{
            ...chipStyle,
            color: held ? "var(--status-error-bright)" : "var(--status-success-bright)",
            borderColor: held ? "rgba(255,61,61,0.32)" : "rgba(0,214,143,0.32)",
          }}
        >
          {held ? "HOLD" : "ACCEPT"}
        </span>
      </button>

      {open && (
        <div style={{ padding: "0 12px 12px" }}>
          <SectionLabel>Title block</SectionLabel>
          <div style={fieldGridStyle}>
            <FieldRow label="Project" field={record.titleBlock.projectName} />
            <FieldRow label="Sheet number" field={record.titleBlock.sheetNumber} />
            <FieldRow label="Revision" field={record.titleBlock.revisionNumber} />
            <FieldRow label="Issue date" field={record.titleBlock.issueDate} />
            <FieldRow label="Authorizing engineer" field={record.titleBlock.authorizingEngineer} />
          </div>

          <SectionLabel>Seal &amp; signature</SectionLabel>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <AttestRow
              kind="stamp"
              label="Seal"
              state={record.attestations.stamp.state}
              basis={record.attestations.stamp.basis}
              onAttest={onAttest}
            />
            <AttestRow
              kind="signature"
              label="Signature"
              state={record.attestations.signature.state}
              basis={record.attestations.signature.basis}
              onAttest={onAttest}
            />
          </div>
          {!onAttest && (
            <div style={{ ...bodyTextStyle, color: "var(--text-muted)", marginTop: 6 }}>
              Key in a sheet number before attesting — an attestation has to attach to an identified sheet.
            </div>
          )}

          <SectionLabel>Register</SectionLabel>
          <div style={{ ...bodyTextStyle, color: "var(--text-secondary)" }}>{record.register.note}</div>

          <SectionLabel>
            Change summary
            {record.changeSummary.comparedAgainst ? ` — vs ${record.changeSummary.comparedAgainst}` : ""}
          </SectionLabel>
          <ul style={listStyle}>
            {record.changeSummary.bullets.map((bullet, i) => (
              <li
                key={`${bullet.channel}-${i}`}
                style={{
                  ...bodyTextStyle,
                  color: bullet.comparable ? "var(--text-secondary)" : "var(--text-muted)",
                  marginBottom: 3,
                }}
              >
                <span style={{ ...monoStyle, marginRight: 6 }}>
                  {bullet.comparable ? bullet.channel : `${bullet.channel} · not compared`}
                </span>
                {bullet.text}
              </li>
            ))}
          </ul>

          {record.findings.length > 0 && (
            <>
              <SectionLabel>Findings</SectionLabel>
              <ul style={listStyle}>
                {record.findings.map((finding, i) => (
                  <FindingRow key={`${finding.code}-${i}`} finding={finding} />
                ))}
              </ul>
            </>
          )}

          {record.ingest.withheld.length > 0 && (
            <>
              <SectionLabel>Not written to the register</SectionLabel>
              <ul style={listStyle}>
                {record.ingest.withheld.map((item) => (
                  <li key={item.column} style={{ ...bodyTextStyle, color: "var(--text-muted)", marginBottom: 3 }}>
                    <span style={{ ...monoStyle, marginRight: 6 }}>{item.column}</span>
                    {item.reason}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function FieldRow({ label, field }: { label: string; field: DocField }) {
  // Three visually distinct states, never two: a value, an inspected blank, and
  // an uninspected unknown.
  const known = field.value !== null;
  const text = known ? field.value : field.observed ? "not stated on the sheet" : "not inspected — unknown";
  const color = known
    ? "var(--text-primary)"
    : field.observed
      ? "var(--status-warning-bright)"
      : "var(--text-muted)";

  return (
    <>
      <span style={{ ...monoStyle, color: "var(--text-muted)" }}>{label}</span>
      <span style={{ ...bodyTextStyle, color }}>
        {!known && !field.observed && <HelpCircle size={10} style={{ marginRight: 4 }} aria-hidden="true" />}
        {text}
        {known && (
          <span style={{ ...monoStyle, color: "var(--text-muted)", marginLeft: 6 }}>{field.provenance}</span>
        )}
      </span>
    </>
  );
}

function AttestRow({
  kind,
  label,
  state,
  basis,
  onAttest,
}: {
  kind: AttestKind;
  label: string;
  state: DocControlAttestations[AttestKind]["state"];
  basis: string;
  onAttest: ((kind: AttestKind, state: "present" | "absent") => void) | null;
}) {
  const color =
    state === "present"
      ? "var(--status-success-bright)"
      : state === "absent"
        ? "var(--status-error-bright)"
        : "var(--status-warning-bright)";

  return (
    <div style={attestBoxStyle} title={basis}>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <Stamp size={11} color={color} aria-hidden="true" />
        <span style={{ ...monoStyle, color: "var(--text-muted)" }}>{label}</span>
        <span style={{ ...monoStyle, color }}>{state}</span>
      </div>
      <div style={{ ...bodyTextStyle, color: "var(--text-muted)", marginTop: 3 }}>{basis}</div>
      {onAttest && (
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <button type="button" style={attestButtonStyle} onClick={() => onAttest(kind, "present")}>
            <Check size={10} aria-hidden="true" /> I see it
          </button>
          <button
            type="button"
            style={{ ...attestButtonStyle, color: "var(--status-error-bright)" }}
            onClick={() => onAttest(kind, "absent")}
          >
            <FileWarning size={10} aria-hidden="true" /> It is missing
          </button>
        </div>
      )}
    </div>
  );
}

function FindingRow({ finding }: { finding: DocControlFinding }) {
  const color =
    finding.severity === "blocker"
      ? "var(--status-error-bright)"
      : finding.severity === "warning"
        ? "var(--status-warning-bright)"
        : "var(--text-muted)";

  return (
    <li style={{ ...bodyTextStyle, color: "var(--text-secondary)", marginBottom: 3 }}>
      <AlertTriangle size={10} color={color} style={{ marginRight: 5 }} aria-hidden="true" />
      <span style={{ ...monoStyle, color, marginRight: 6 }}>{finding.severity}</span>
      {finding.message}
    </li>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={sectionLabelStyle}>{children}</div>;
}

// ── styles — CSS variables only, no hardcoded surface/text/border hex ──
const monoStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const mutedMonoStyle: React.CSSProperties = { ...monoStyle, color: "var(--text-muted)" };

const bodyTextStyle: React.CSSProperties = { fontFamily: "var(--font-body)", fontSize: 11 };

const panelStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  background: "var(--hover-bg)",
  border: "1px solid var(--divider)",
  marginBottom: 12,
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 10,
};

const headingStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--text-primary)",
};

const dotStyle: React.CSSProperties = { color: "var(--text-muted)" };

const copyButtonStyle: React.CSSProperties = {
  ...monoStyle,
  marginLeft: "auto",
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "4px 8px",
  borderRadius: 6,
  border: "1px solid var(--divider)",
  background: "transparent",
  color: "var(--text-secondary)",
  cursor: "pointer",
};

const cardStyle: React.CSSProperties = {
  borderRadius: 8,
  border: "1px solid var(--divider)",
  background: "var(--bg-surface)",
};

const cardHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "8px 12px",
  background: "transparent",
  border: "none",
  cursor: "pointer",
};

const chipStyle: React.CSSProperties = {
  ...monoStyle,
  padding: "2px 6px",
  borderRadius: 5,
  border: "1px solid var(--divider)",
};

const fieldGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(110px, auto) 1fr",
  gap: "4px 10px",
  alignItems: "baseline",
};

const sectionLabelStyle: React.CSSProperties = {
  ...monoStyle,
  color: "var(--text-muted)",
  marginTop: 10,
  marginBottom: 4,
};

const listStyle: React.CSSProperties = { margin: 0, paddingLeft: 14 };

const attestBoxStyle: React.CSSProperties = {
  flex: "1 1 220px",
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid var(--divider)",
  background: "var(--hover-bg)",
};

const attestButtonStyle: React.CSSProperties = {
  ...monoStyle,
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "3px 7px",
  borderRadius: 5,
  border: "1px solid var(--divider)",
  background: "transparent",
  color: "var(--text-secondary)",
  cursor: "pointer",
};
