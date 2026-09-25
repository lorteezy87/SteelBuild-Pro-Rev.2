/**
 * DocumentControl — standalone intake desk for incoming construction documents.
 *
 * Drop a drawing PDF and get the Document Control read on it BEFORE it is
 * logged, transmitted or released: the five title-block fields, where each
 * sheet sits in the project's Master Document Register, what changed against
 * the sheet of record, the seal / signature state, and the database-ready
 * ingestion payload.
 *
 * The page is READ-ONLY on purpose. It uploads nothing and writes nothing —
 * extraction happens in the browser. It is the place to answer "what is this
 * document and is it safe to accept" without the answer being an irreversible
 * act. Logging a revision into a set is still the revision-upload wizard's job.
 *
 * Its register scope is the whole project, which is what makes it different
 * from the wizard: the wizard asks "is this sheet in THIS set", this page asks
 * "is this sheet anywhere on this job".
 */

import { useCallback, useMemo, useRef, useState } from "react";
import type { ComponentType, PropsWithChildren } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { FileUp, Loader2, RefreshCw } from "lucide-react";
import { entities } from "@/api/supabaseClient";
import { useProjectId } from "@/hooks/useProjectId";
import { useAuth } from "@/lib/AuthContext";
import { isPdfFile } from "@/lib/drawingUploadUtils";
import { extractSheetsFromPdf, type PdfExtractionStatus } from "@/lib/pdfSheetExtractor";
import { readPdfPageTexts } from "@/lib/pdfPageText";
import { buildDocControlRecord, nextActionForRecord, normalizeCallouts, toMdrEntry, type MdrEntry } from "@/lib/docControl";
import DocControlReviewPanel, {
  useDocControlAttestations,
} from "@/components/drawings/DocControlReviewPanel";
import ListTruncationNoticeRaw, {
  DEFAULT_LIST_CAP,
} from "@/components/shared/ListTruncationNotice";

// ListTruncationNotice is still .jsx, so TS infers its destructured props as
// required when consumed from .tsx.
type AnyProps = PropsWithChildren<Record<string, unknown>>;
const ListTruncationNotice = ListTruncationNoticeRaw as unknown as ComponentType<AnyProps>;

type DrawingRow = {
  id?: string | null;
  sheet_number?: string | null;
  title?: string | null;
  revision_number?: string | null;
  drawing_set_name?: string | null;
  stage?: string | null;
  is_superseded?: boolean | null;
  callouts?: unknown;
  extracted_text?: string | null;
};

type ExtractionState = {
  setMeta: {
    projectName?: string;
    revision?: string;
    issueDate?: string;
    issuedBy?: string;
    authorizingEngineer?: string;
  } | null;
  sheets: Array<{
    sheetNumber?: string;
    sheetTitle?: string;
    revision?: string;
    date?: string;
    pdfPage?: unknown;
    extractedText?: string;
    callouts?: unknown;
  }>;
  scanned: boolean;
  pageTexts: Record<number, string>;
  fileName: string;
};

export default function DocumentControl() {
  const navigate = useNavigate();
  const projectId = useProjectId();
  const { user } = useAuth();
  const reviewerName = user?.full_name || user?.email || "";

  const [phase, setPhase] = useState<"idle" | "reading" | "done" | "error">("idle");
  const [statusText, setStatusText] = useState("");
  const [errorText, setErrorText] = useState("");
  const [dragging, setDragging] = useState(false);
  const [extraction, setExtraction] = useState<ExtractionState | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const registerQuery = useQuery({
    queryKey: ["doc-control-register", projectId],
    enabled: !!projectId,
    staleTime: 60_000,
    queryFn: async (): Promise<DrawingRow[]> => {
      const rows = await entities.Drawing.filter({ project_id: projectId });
      return Array.isArray(rows) ? (rows as DrawingRow[]) : [];
    },
  });

  const rows = useMemo(() => registerQuery.data ?? [], [registerQuery.data]);

  const register = useMemo<MdrEntry[]>(
    () => rows.filter((row) => !row?.is_superseded).map(toMdrEntry),
    [rows],
  );

  /**
   * A capped read cannot prove a sheet is absent. The comparison is against the
   * EFFECTIVE cap (what the server will actually return), not the requested
   * limit — a detector wired to the requested limit can never fire.
   */
  const registerComplete = rows.length < DEFAULT_LIST_CAP;

  const { attestationsBySheetNumber, attest } = useDocControlAttestations(reviewerName);

  const records = useMemo(() => {
    if (!extraction) return [];
    return extraction.sheets.map((sheet) => {
      const pdfPage = Number(sheet.pdfPage);
      const pageText = Number.isFinite(pdfPage) ? extraction.pageTexts[pdfPage] ?? null : null;
      const sheetKey = String(sheet.sheetNumber ?? "").trim();
      return buildDocControlRecord({
        projectId,
        titleBlock: {
          scanned: extraction.scanned,
          setMeta: extraction.setMeta,
          sheet: {
            sheetNumber: sheet.sheetNumber ?? "",
            revision: sheet.revision ?? "",
            date: sheet.date ?? "",
          },
        },
        attestationSource: { scanned: extraction.scanned, pageText },
        attestationOverrides: sheetKey ? attestationsBySheetNumber[sheetKey] : undefined,
        register,
        registerComplete,
        incoming: {
          title: sheet.sheetTitle ?? null,
          // The sheet's OWN text from the extractor — the same column-aware
          // line format the register stores — so the diff compares like with
          // like. Note this is NOT `pageTexts` below: that copy is whitespace-
          // collapsed for seal detection and would report every sheet as
          // wholly rewritten if it were diffed against a stored page.
          extractedText: typeof sheet.extractedText === "string" ? sheet.extractedText : null,
          callouts: normalizeCallouts(sheet.callouts),
        },
      });
    });
  }, [extraction, projectId, register, registerComplete, attestationsBySheetNumber]);

  const runIntake = useCallback(async (file: File) => {
    setErrorText("");
    if (!isPdfFile(file)) {
      setPhase("error");
      setErrorText("That is not a PDF. Document Control reads drawing PDFs.");
      return;
    }

    setPhase("reading");
    setStatusText("Reading the document…");
    setExtraction(null);

    try {
      // Page text first: it is cheap, local, and if the language-model call is
      // rate-limited we have still read something.
      const pageTexts = await readPdfPageTexts(file);

      const result = await extractSheetsFromPdf(file, {
        onStatus: (status: PdfExtractionStatus) => {
          if (status.phase === "rate-limit-wait") {
            setStatusText(`Rate limited — retrying in ${status.remainingSec}s…`);
          } else {
            setStatusText("Reading title blocks…");
          }
        },
      });

      if (result?.extractFailed) {
        setPhase("error");
        setErrorText(result.error || "Could not read this PDF.");
        return;
      }

      setExtraction({
        setMeta: result?.setMeta ?? null,
        sheets: Array.isArray(result?.sheets) ? result.sheets : [],
        scanned: result?.scanned === true,
        pageTexts,
        fileName: file.name,
      });
      setStatusText("");
      setPhase("done");
    } catch (err) {
      setPhase("error");
      setErrorText((err as Error)?.message || "Could not read this PDF.");
    }
  }, []);

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) void runIntake(file);
  };

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Clear the input so re-picking the same file fires change again.
    event.target.value = "";
    if (file) void runIntake(file);
  };

  const blockers = records.filter((r) => r.disposition === "hold").length;
  const nextActions = useMemo(
    () => records.map((record) => ({
      sheetNumber: record.titleBlock.sheetNumber.value || "Unidentified sheet",
      action: nextActionForRecord(record, registerComplete),
    })),
    [records, registerComplete],
  );

  return (
    <div style={pageStyle}>
      <div style={headerRowStyle}>
        <div>
          <h1 style={titleStyle}>Document Control</h1>
          <p style={subtitleStyle}>
            Read an incoming document against this project&apos;s register before it is logged or
            released. Nothing here writes to the database.
          </p>
        </div>
        {extraction && (
          <button
            type="button"
            style={secondaryButtonStyle}
            onClick={() => {
              setExtraction(null);
              setPhase("idle");
              setErrorText("");
            }}
          >
            <RefreshCw size={12} aria-hidden="true" /> New document
          </button>
        )}
      </div>

      {!projectId && (
        <div style={noticeStyle}>
          Pick a project first — a sheet number means nothing without a register to place it in.
        </div>
      )}

      <ListTruncationNotice count={rows.length} label="drawings" />

      {projectId && !extraction && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop a drawing PDF to run Document Control"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click();
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          style={{
            ...dropZoneStyle,
            borderColor: dragging ? "var(--accent)" : "var(--divider)",
            background: dragging ? "var(--hover-bg)" : "transparent",
          }}
        >
          {phase === "reading" ? (
            <>
              <Loader2 size={20} aria-hidden="true" />
              <div style={dropTitleStyle}>{statusText || "Reading…"}</div>
              <div style={dropHintStyle}>
                Title blocks are read by the extractor, which is rate limited — a large set can take
                a minute.
              </div>
            </>
          ) : (
            <>
              <FileUp size={20} aria-hidden="true" />
              <div style={dropTitleStyle}>Drop a drawing PDF</div>
              <div style={dropHintStyle}>
                {registerQuery.isLoading
                  ? "Loading the register…"
                  : `Checked against ${register.length} live sheet${register.length === 1 ? "" : "s"} on this project.`}
              </div>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={onPick}
            style={{ display: "none" }}
          />
        </div>
      )}

      {phase === "error" && errorText && (
        <div style={{ ...noticeStyle, borderColor: "var(--status-error)" }}>{errorText}</div>
      )}

      {extraction && (
        <>
          <div style={fileRowStyle}>
            <span style={monoStyle}>{extraction.fileName}</span>
            <span style={{ ...monoStyle, color: "var(--text-muted)" }}>
              {records.length} sheet{records.length === 1 ? "" : "s"}
            </span>
            {extraction.scanned && (
              <span style={{ ...monoStyle, color: "var(--status-warning-bright)" }}>
                image-only — nothing could be read from the text layer
              </span>
            )}
            {!registerComplete && (
              <span style={{ ...monoStyle, color: "var(--status-warning-bright)" }}>
                register read was capped — a miss does not mean the sheet is new
              </span>
            )}
            {blockers > 0 && (
              <span style={{ ...monoStyle, color: "var(--status-error-bright)" }}>
                {blockers} on hold
              </span>
            )}
          </div>

          {records.length === 0 ? (
            <div style={noticeStyle}>
              No sheets were identified in this PDF. If it is a scan, the title blocks have to be
              keyed in by hand.
            </div>
          ) : (
            <>
              <DocControlReviewPanel records={records} onAttest={attest} />
              <section aria-label="Document Control next actions" style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                <div style={{ ...monoStyle, color: "var(--text-muted)" }}>Next actions — read-only handoff</div>
                {nextActions.map(({ sheetNumber, action }, index) => (
                  <div key={`${sheetNumber}-${index}`} aria-label={`Next action for ${sheetNumber}`} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid var(--divider)", background: "var(--hover-bg)", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ minWidth: 180, flex: 1 }}>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{action.label}</div>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{action.detail}</div>
                    </div>
                    {action.href ? (
                      <button type="button" style={secondaryButtonStyle} onClick={() => navigate(action.href)}>
                        {action.label}
                      </button>
                    ) : (
                      <span style={{ ...monoStyle, color: "var(--status-warning-bright)" }}>Human review required</span>
                    )}
                  </div>
                ))}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── styles — CSS variables only ──────────────────────────────────────
const pageStyle: React.CSSProperties = { padding: "16px 20px", maxWidth: 1100, margin: "0 auto" };

const headerRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
};

const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: 22,
  fontWeight: 700,
  letterSpacing: "0.03em",
  textTransform: "uppercase",
  color: "var(--text-primary)",
  margin: 0,
};

const subtitleStyle: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 12,
  color: "var(--text-secondary)",
  margin: "4px 0 0",
  maxWidth: 620,
};

const monoStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-secondary)",
};

const noticeStyle: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 12,
  color: "var(--text-secondary)",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid var(--divider)",
  background: "var(--hover-bg)",
  marginBottom: 12,
};

const dropZoneStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "40px 20px",
  borderRadius: 10,
  border: "1px dashed var(--divider)",
  color: "var(--text-secondary)",
  cursor: "pointer",
  marginBottom: 12,
};

const dropTitleStyle: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 13,
  fontWeight: 600,
  color: "var(--text-primary)",
};

const dropHintStyle: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 11,
  color: "var(--text-muted)",
  textAlign: "center",
  maxWidth: 420,
};

const fileRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 10,
};

const secondaryButtonStyle: React.CSSProperties = {
  ...monoStyle,
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid var(--divider)",
  background: "transparent",
  color: "var(--text-secondary)",
  cursor: "pointer",
};
