import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Clock3,
  FileStack,
  Link2,
  Search,
  ShieldCheck,
} from "lucide-react";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { STAGE_MAP, WORKFLOW_STAGE_ORDER } from "@/components/drawings/drawingsConfig";
import {
  derivedSetStage,
  isRRStatus,
  pickMostRecentSubmittal,
  submittalStatusToStage,
} from "@/lib/submittalStageMapping";
import { formatDrawingSetNumber } from "@/lib/drawingSetOrdering";
import { formatShortDate } from "@/utils/dates";
// Working-day-aware due dispatcher (Phase 5). The local calendar-day `dueInfo`
// below is retained for DRAWING-set (sheet) dues, which stay calendar-day; only
// SUBMITTAL-governed dues switch to working days when `useWorkdays` is on. Shares
// the SAME tested engine as the Control Board / Approval Matrix so all three agree.
import { dueInfoFor } from "@/pages/drawingSubmittalHub/format";

const surfaceLow = "var(--bg-surface-low)";
const surfaceHigh = "var(--bg-surface-high)";
const border = "var(--border-default)";
const textPrimary = "var(--text-primary)";
const textMuted = "var(--text-muted)";
const mono = "var(--font-mono)";
const success = "var(--status-success)";
const warning = "var(--status-warning)";
const error = "var(--status-error)";
const review = "var(--status-review)";
const accent = "var(--accent)";

const ACTION_STATUSES = new Set(["Rejected", "Revise and Resubmit"]);
const CLOSED_SUBMITTAL_STATUSES = new Set(["Released for Fabrication", "Void"]);

const STAGE_CAPTIONS = {
  "Not Started": "Not started",
  IFA: "In for approval",
  OFA: "Out for approval",
  BFA: "Back from approval",
  OFS: "OFS — Out for Scrub",
  IFC: "Issued for construction",
  Released: "Released for fab",
};

function toLocalDay(input) {
  if (!input) return null;
  if (input instanceof Date) {
    if (!Number.isFinite(input.getTime())) return null;
    return new Date(input.getFullYear(), input.getMonth(), input.getDate());
  }
  if (typeof input === "string") {
    const match = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }
  }
  const parsed = new Date(input);
  if (!Number.isFinite(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function daysUntil(input) {
  const due = toLocalDay(input);
  if (!due) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

// Timezone-safe (matches the toLocalDay-based daysUntil above): a bare
// new Date("2026-06-10") is UTC midnight and renders a day early in MST.
const fmtDate = (input) => formatShortDate(input);

// NOTE: the calendar/working-day due chip now comes from the shared, tested
// `dueInfoFor` engine in drawingSubmittalHub/format.ts (imported above) so the
// Process Board, Control Board, and Approval Matrix all agree. `daysUntil`
// stays — it still backs compareDueDates / earliestDate for the sheet-date
// fallback.

function getSubmittalDueDate(submittal) {
  return submittal?.required_date || submittal?.due_date || submittal?.date_required || null;
}

function getDrawingDueDate(drawing) {
  return drawing?.due_date || drawing?.required_date || drawing?.target_date || null;
}

function compareDueDates(a, b) {
  const ad = daysUntil(a);
  const bd = daysUntil(b);
  if (ad === null && bd === null) return 0;
  if (ad === null) return 1;
  if (bd === null) return -1;
  return ad - bd;
}

function earliestDate(values) {
  return values.filter(Boolean).sort(compareDueDates)[0] || null;
}

function getOwner(submittal, sheets) {
  return (
    submittal?.ball_in_court ||
    submittal?.assigned_to ||
    submittal?.reviewer ||
    sheets.find((drawing) => drawing.ball_in_court || drawing.assigned_to || drawing.reviewer)?.ball_in_court ||
    sheets.find((drawing) => drawing.assigned_to)?.assigned_to ||
    sheets.find((drawing) => drawing.reviewer)?.reviewer ||
    "Unassigned"
  );
}

function getLatestStageSubmittal(submittals) {
  const usable = (submittals || []).filter(
    (submittal) =>
      submittal &&
      !submittal.is_deleted &&
      submittalStatusToStage(submittal.status, submittal.ball_in_court, submittal.approved_date),
  );
  return pickMostRecentSubmittal(usable) || pickMostRecentSubmittal(submittals);
}

function getStageColor(stage) {
  return STAGE_MAP[stage]?.color || textMuted;
}

function buildBoardItems(setPackages, submittals, useWorkdays = false) {
  const packageItems = (setPackages || []).map((pkg) => {
    const latestSubmittal = getLatestStageSubmittal(pkg.submittals);
    const stage = latestSubmittal
      ? submittalStatusToStage(
          latestSubmittal.status,
          latestSubmittal.ball_in_court,
          latestSubmittal.approved_date,
        ) || derivedSetStage(pkg.submittals, pkg.sheets)
      : derivedSetStage(pkg.submittals, pkg.sheets);
    // Prefer the governing submittal's due; only fall back to the earliest sheet
    // due when no submittal governs. Working-day counting applies ONLY to the
    // submittal-governed case (a drawing-set/sheet due stays calendar-day).
    const submittalDue = getSubmittalDueDate(latestSubmittal);
    const dueDate = submittalDue || earliestDate((pkg.sheets || []).map(getDrawingDueDate));
    const closed = stage === "Released" || CLOSED_SUBMITTAL_STATUSES.has(latestSubmittal?.status);
    const due = dueInfoFor(dueDate, { closed, useWorkdays: useWorkdays && !!submittalDue });
    const setNumber = pkg.parent ? formatDrawingSetNumber(pkg.parent) : "";
    const submittalNumber = latestSubmittal?.submittal_number || "";
    return {
      id: `set-${pkg.key}`,
      kind: "Drawing Set",
      title: pkg.name || "Unnamed drawing set",
      stage,
      setNumber,
      submittalNumber,
      status: latestSubmittal?.status || (stage === "Not Started" ? "No submittal" : stage),
      owner: getOwner(latestSubmittal, pkg.sheets || []),
      dueDate,
      due,
      linked: !!latestSubmittal,
      needsAction:
        ACTION_STATUSES.has(latestSubmittal?.status) ||
        (pkg.sheets || []).some((drawing) => ["Rejected", "Revise and Resubmit", "Returned"].includes(drawing.stage)),
      isRR: isRRStatus(latestSubmittal?.status),
      sheetCount: (pkg.sheets || []).length,
      submittalCount: (pkg.submittals || []).length,
      discipline: pkg.parent?.discipline || latestSubmittal?.discipline || "",
      routeTab: latestSubmittal ? "submittals" : "drawings",
    };
  });

  const linkedSubmittalIds = new Set(
    (setPackages || []).flatMap((pkg) => (pkg.submittals || []).map((submittal) => submittal.id).filter(Boolean)),
  );
  const unlinkedItems = (submittals || [])
    .filter((submittal) => submittal && !submittal.is_deleted && !linkedSubmittalIds.has(submittal.id))
    .map((submittal) => {
      const stage =
        submittalStatusToStage(submittal.status, submittal.ball_in_court, submittal.approved_date) ||
        "Not Started";
      const dueDate = getSubmittalDueDate(submittal);
      // Always a submittal due date → working-day-aware when the flag is on.
      const due = dueInfoFor(dueDate, { closed: CLOSED_SUBMITTAL_STATUSES.has(submittal.status), useWorkdays });
      return {
        id: `submittal-${submittal.id}`,
        kind: "Unlinked Submittal",
        title:
          [submittal.submittal_number, submittal.title || submittal.description]
            .filter(Boolean)
            .join(" - ") || "Untitled submittal",
        stage,
        setNumber: "",
        submittalNumber: submittal.submittal_number || "",
        status: submittal.status || "Draft",
        owner: submittal.ball_in_court || submittal.assigned_to || submittal.reviewer || "Unassigned",
        dueDate,
        due,
        linked: false,
        needsAction: ACTION_STATUSES.has(submittal.status),
        isRR: isRRStatus(submittal.status),
        sheetCount: 0,
        submittalCount: 1,
        discipline: submittal.discipline || submittal.submittal_type || "",
        routeTab: "submittals",
      };
    });

  return [...packageItems, ...unlinkedItems].sort((a, b) => {
    if (a.due.overdue !== b.due.overdue) return a.due.overdue ? -1 : 1;
    if (a.needsAction !== b.needsAction) return a.needsAction ? -1 : 1;
    return a.due.sort - b.due.sort || a.title.localeCompare(b.title);
  });
}

function filterItems(items, filter, search) {
  const q = search.trim().toLowerCase();
  return items.filter((item) => {
    if (filter === "overdue" && !item.due.overdue) return false;
    if (filter === "needs-action" && !item.needsAction) return false;
    if (filter === "unlinked" && item.linked) return false;
    if (!q) return true;
    return (
      item.title.toLowerCase().includes(q) ||
      item.status.toLowerCase().includes(q) ||
      item.owner.toLowerCase().includes(q) ||
      item.discipline.toLowerCase().includes(q) ||
      item.submittalNumber.toLowerCase().includes(q) ||
      item.setNumber.toLowerCase().includes(q)
    );
  });
}

export default function SubmittalVisualBoard({
  setPackages = [],
  submittals = [],
  isLoading = false,
  onOpenTab,
  useWorkdays = false,
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const allItems = useMemo(
    () => buildBoardItems(setPackages, submittals, useWorkdays),
    [setPackages, submittals, useWorkdays],
  );
  const boardItems = useMemo(
    () => filterItems(allItems, filter, search),
    [allItems, filter, search],
  );

  const stageBuckets = useMemo(() => {
    const buckets = Object.fromEntries(WORKFLOW_STAGE_ORDER.map((stage) => [stage, []]));
    for (const item of boardItems) {
      const key = WORKFLOW_STAGE_ORDER.includes(item.stage) ? item.stage : "Not Started";
      buckets[key].push(item);
    }
    return buckets;
  }, [boardItems]);

  const summary = useMemo(() => ({
    total: allItems.length,
    overdue: allItems.filter((item) => item.due.overdue).length,
    dueSoon: allItems.filter((item) => item.due.dueSoon).length,
    needsAction: allItems.filter((item) => item.needsAction).length,
    unlinked: allItems.filter((item) => !item.linked).length,
    released: allItems.filter((item) => item.stage === "Released").length,
  }), [allItems]);

  if (isLoading) return <LoadingSkeleton />;

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <SummaryPill icon={FileStack} label="Packages" value={summary.total} color={accent} />
          <SummaryPill icon={AlertTriangle} label="Overdue" value={summary.overdue} color={error} />
          <SummaryPill icon={Clock3} label="Due Soon" value={summary.dueSoon} color={warning} />
          <SummaryPill icon={ShieldCheck} label="Released" value={summary.released} color={success} />
          <SummaryPill icon={Link2} label="Unlinked" value={summary.unlinked} color={summary.unlinked ? warning : textMuted} />
        </div>
        <label style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flex: "1 1 260px",
          maxWidth: 420,
          minHeight: 40,
          padding: "8px 11px",
          borderRadius: 10,
          border: `1px solid ${border}`,
          background: surfaceHigh,
          color: textMuted,
        }}>
          <Search size={15} />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search packages, submittals, owners..."
            style={{
              width: "100%",
              border: 0,
              outline: "none",
              background: "transparent",
              color: textPrimary,
              fontFamily: mono,
              fontSize: 12,
            }}
          />
        </label>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <FilterButton active={filter === "all"} onClick={() => setFilter("all")} label="All" value={summary.total} />
        <FilterButton active={filter === "overdue"} onClick={() => setFilter("overdue")} label="Overdue" value={summary.overdue} tone={error} />
        <FilterButton active={filter === "needs-action"} onClick={() => setFilter("needs-action")} label="Needs Action" value={summary.needsAction} tone={review} />
        <FilterButton active={filter === "unlinked"} onClick={() => setFilter("unlinked")} label="Unlinked" value={summary.unlinked} tone={warning} />
      </div>

      <div style={{
        display: "grid",
        gridAutoFlow: "column",
        gridAutoColumns: "minmax(252px, 294px)",
        gap: 12,
        overflowX: "auto",
        overflowY: "hidden",
        padding: "2px 2px 12px",
        minHeight: 520,
      }}>
        {WORKFLOW_STAGE_ORDER.map((stage) => (
          <ProcessColumn
            key={stage}
            stage={stage}
            items={stageBuckets[stage] || []}
            onOpenTab={onOpenTab}
          />
        ))}
      </div>
    </section>
  );
}

function ProcessColumn({ stage, items, onOpenTab }) {
  const color = getStageColor(stage);
  const caption = STAGE_CAPTIONS[stage] || stage;
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      minHeight: 500,
      borderRadius: 12,
      border: `1px solid ${border}`,
      background: "color-mix(in srgb, var(--bg-surface) 72%, transparent)",
      overflow: "hidden",
    }}>
      <div style={{
        padding: "11px 12px",
        borderTop: `3px solid ${color}`,
        borderBottom: `1px solid ${border}`,
        background: `color-mix(in srgb, ${color} 10%, var(--bg-surface-high) 90%)`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{
              color,
              fontFamily: mono,
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}>
              {STAGE_MAP[stage]?.label || stage}
            </div>
            <div style={{
              marginTop: 3,
              color: textMuted,
              fontSize: 11,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}>
              {caption}
            </div>
          </div>
          <span className="sbd-num" style={{
            flex: "0 0 auto",
            minWidth: 28,
            textAlign: "center",
            padding: "3px 7px",
            borderRadius: 999,
            color,
            background: `color-mix(in srgb, ${color} 15%, transparent)`,
            border: `1px solid color-mix(in srgb, ${color} 34%, transparent)`,
            fontFamily: mono,
            fontSize: 12,
            fontWeight: 900,
          }}>
            {items.length}
          </span>
        </div>
      </div>
      <div style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        flex: 1,
        minHeight: 0,
        padding: 8,
        overflowY: "auto",
      }}>
        {items.length === 0 ? (
          <div style={{
            border: `1px dashed ${border}`,
            borderRadius: 10,
            minHeight: 82,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: textMuted,
            fontFamily: mono,
            fontSize: 10,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
          }}>
            No packages
          </div>
        ) : (
          items.map((item) => (
            <ProcessCard key={item.id} item={item} onOpenTab={onOpenTab} />
          ))
        )}
      </div>
    </div>
  );
}

function ProcessCard({ item, onOpenTab }) {
  const color = item.due.overdue ? error : item.needsAction ? review : item.due.dueSoon ? warning : getStageColor(item.stage);
  const titleMeta = [
    item.setNumber ? `Set ${item.setNumber}` : null,
    item.submittalNumber ? `Sub ${item.submittalNumber}` : null,
  ].filter(Boolean).join(" | ");
  return (
    <button
      type="button"
      onClick={() => onOpenTab?.(item.routeTab || "submittals")}
      style={{
        width: "100%",
        textAlign: "left",
        padding: 10,
        borderRadius: 8,
        border: `1px solid ${item.due.overdue ? "color-mix(in srgb, var(--status-error) 55%, transparent)" : border}`,
        borderLeft: `3px solid ${color}`,
        background: item.due.overdue
          ? "color-mix(in srgb, var(--status-error) 10%, var(--bg-surface-low) 90%)"
          : surfaceLow,
        color: textPrimary,
        cursor: "pointer",
        boxShadow: "0 8px 20px rgba(0,0,0,0.10)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            color: item.kind === "Drawing Set" ? accent : warning,
            fontFamily: mono,
            fontSize: 9,
            fontWeight: 900,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
          }}>
            {item.linked ? <CircleDot size={10} /> : <Link2 size={10} />}
            <span>{item.kind}</span>
          </div>
          <div style={{
            marginTop: 7,
            color: textPrimary,
            fontSize: 13,
            fontWeight: 800,
            lineHeight: 1.25,
            overflowWrap: "anywhere",
          }}>
            {item.title}
          </div>
        </div>
        <ArrowRight size={14} color={textMuted} style={{ flex: "0 0 auto", marginTop: 2 }} />
      </div>

      {titleMeta && (
        <div style={{
          marginTop: 7,
          color: textMuted,
          fontFamily: mono,
          fontSize: 10,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          {titleMeta}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 9 }}>
        <SmallChip label={item.status} color={getStageColor(item.stage)} />
        <DueChip info={item.due} />
        {item.needsAction && <SmallChip label={item.isRR ? "R&R" : "Action"} color={review} icon={AlertTriangle} />}
        {!item.linked && <SmallChip label="Unlinked" color={warning} icon={Link2} />}
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 8,
        marginTop: 10,
      }}>
        <CardMeta label="BIC" value={item.owner} />
        <CardMeta label="Required" value={fmtDate(item.dueDate)} warn={item.due.overdue} />
      </div>

      <div style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 8,
        marginTop: 9,
        paddingTop: 8,
        borderTop: `1px solid ${border}`,
        color: textMuted,
        fontFamily: mono,
        fontSize: 10,
      }}>
        <span>{item.sheetCount} sheets</span>
        <span>{item.submittalCount} submittals</span>
      </div>
    </button>
  );
}

function SummaryPill({ icon: Icon, label, value, color }) {
  return (
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 7,
      minHeight: 36,
      padding: "7px 10px",
      borderRadius: 999,
      background: `color-mix(in srgb, ${color} 10%, var(--bg-surface-low) 90%)`,
      border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      color,
      fontFamily: mono,
      fontSize: 10,
      fontWeight: 900,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      whiteSpace: "nowrap",
    }}>
      <Icon size={13} />
      <span>{label}</span>
      <span className="sbd-num" style={{ color: textPrimary, fontSize: 13 }}>{value}</span>
    </div>
  );
}

function FilterButton({ active, label, value, tone = accent, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        minHeight: 34,
        padding: "7px 11px",
        borderRadius: 999,
        border: `1px solid ${active ? tone : border}`,
        background: active
          ? `color-mix(in srgb, ${tone} 14%, var(--bg-surface-high) 86%)`
          : "transparent",
        color: active ? textPrimary : textMuted,
        fontFamily: mono,
        fontSize: 10,
        fontWeight: 900,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        cursor: "pointer",
      }}
    >
      <span>{label}</span>
      <span className="sbd-num" style={{ color: active ? tone : textMuted }}>{value}</span>
    </button>
  );
}

function SmallChip({ label, color, icon: Icon }) {
  if (!label) return null;
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "3px 6px",
      borderRadius: 999,
      color,
      background: `color-mix(in srgb, ${color} 13%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 34%, transparent)`,
      fontFamily: mono,
      fontSize: 9,
      fontWeight: 900,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      maxWidth: "100%",
    }}>
      {Icon && <Icon size={10} />}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
    </span>
  );
}

function DueChip({ info }) {
  const Icon = info.overdue ? AlertTriangle : info.dueSoon ? CalendarClock : CheckCircle2;
  return <SmallChip label={info.label} color={info.tone} icon={Icon} />;
}

function CardMeta({ label, value, warn = false }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{
        color: textMuted,
        fontFamily: mono,
        fontSize: 8,
        fontWeight: 900,
        letterSpacing: "0.10em",
        textTransform: "uppercase",
        marginBottom: 2,
      }}>
        {label}
      </div>
      <div style={{
        color: warn ? error : textPrimary,
        fontSize: 11,
        fontWeight: 800,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}>
        {value || "-"}
      </div>
    </div>
  );
}
