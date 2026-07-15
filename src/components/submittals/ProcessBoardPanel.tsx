/**
 * ProcessBoardPanel — the on-skin Detailing Process Board (process tab), SP3 of
 * the canonical detailing presentation.
 *
 * Presentation-only. Renders INSIDE the already-shipped DetailingCommandShell
 * light island (whole-<html> [data-skin="command"] + `.detailing-cc` token
 * cascade), so the kit's `cmd-*` classes and the aliased theme tokens resolve
 * light. The hub (DrawingSubmittalHub.tsx) still owns every query, mutation,
 * cache key, and piece of state — this panel receives the exact same
 * setPackages / submittals / onOpenTab / useWorkdays props the legacy
 * `SubmittalVisualBoard` receives, so behavior is preserved.
 *
 * What this converts to kit primitives: the summary/search chrome (kit FilterBar
 * + Pills), the quick-filter chips (`cmd-chip-btn`), and the stage kanban
 * (columns + cards on `cmd-*` chrome). All board math is the pure
 * `processBoard.derive.ts` — byte-identical to the legacy inline compute.
 *
 * ⚠ Working-day due display (`submittal_workday_dues`, Phase 5): `useWorkdays`
 * is threaded straight into `buildBoardItems`, which reuses the shared
 * `dueInfoFor` dispatcher with the same source-gating. No behavior change.
 */
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Clock3,
  FileStack,
  Link2,
  ShieldCheck,
} from "lucide-react";
import LoadingSkeletonRaw from "@/components/shared/LoadingSkeleton";
import type { ComponentType } from "react";
import { STAGE_MAP, STAGE_ORDER } from "@/components/drawings/drawingsConfig";
import { formatShortDate } from "@/utils/dates";
import { FilterBar, Pill } from "@/components/command";
import type { PillTone } from "@/components/command";
import {
  bucketByStage,
  buildBoardItems,
  filterItems,
  summarizeBoard,
} from "./processBoard.derive";
import type { BoardFilter, BoardItem, BoardSummary } from "./processBoard.derive";

type AnyProps = Record<string, any>;
const LoadingSkeleton = LoadingSkeletonRaw as unknown as ComponentType<AnyProps>;

const STAGE_CAPTIONS: Record<string, string> = {
  "Not Started": "Not started",
  IFA: "In for approval",
  OFA: "Out for approval",
  BFA: "Back from approval",
  OFS: "Out for scrub",
  IFC: "Issued for construction",
  Released: "Released for fab",
};

// Timezone-safe short date (matches the legacy board's fmtDate = formatShortDate).
const fmtDate = (input: any) => formatShortDate(input);

function getStageColor(stage: string): string {
  return STAGE_MAP[stage]?.color || "var(--text-muted)";
}

/** Card-level tone: overdue → danger, needs-action → review, due-soon → warn. */
function cardTone(item: BoardItem): PillTone {
  if (item.due.overdue) return "danger";
  if (item.needsAction) return "review";
  if (item.due.dueSoon) return "warn";
  return "neutral";
}

export interface ProcessBoardPanelProps {
  setPackages?: any[];
  submittals?: any[];
  isLoading?: boolean;
  onOpenTab?: (key: string) => void;
  useWorkdays?: boolean;
}

export default function ProcessBoardPanel({
  setPackages = [],
  submittals = [],
  isLoading = false,
  onOpenTab,
  useWorkdays = false,
}: ProcessBoardPanelProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<BoardFilter>("all");

  const allItems = useMemo(
    () => buildBoardItems(setPackages, submittals, useWorkdays),
    [setPackages, submittals, useWorkdays],
  );
  const boardItems = useMemo(
    () => filterItems(allItems, filter, search),
    [allItems, filter, search],
  );
  const stageBuckets = useMemo(
    () => bucketByStage(boardItems, STAGE_ORDER),
    [boardItems],
  );
  const summary = useMemo<BoardSummary>(() => summarizeBoard(allItems), [allItems]);

  if (isLoading) return <LoadingSkeleton />;

  return (
    <section className="detailing-cc" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* ── Summary pills + search (kit FilterBar) ──────────────────────── */}
      <FilterBar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search packages, submittals, owners…"
        filters={
          <>
            <SummaryPill icon={FileStack} label="Packages" value={summary.total} tone="neutral" />
            <SummaryPill icon={AlertTriangle} label="Overdue" value={summary.overdue} tone="danger" />
            <SummaryPill icon={Clock3} label="Due Soon" value={summary.dueSoon} tone="warn" />
            <SummaryPill icon={ShieldCheck} label="Released" value={summary.released} tone="good" />
            <SummaryPill icon={Link2} label="Unlinked" value={summary.unlinked} tone={summary.unlinked ? "warn" : "neutral"} />
          </>
        }
      />

      {/* ── Quick-filter chips ──────────────────────────────────────────── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label="All" value={summary.total} />
        <FilterChip active={filter === "overdue"} onClick={() => setFilter("overdue")} label="Overdue" value={summary.overdue} />
        <FilterChip active={filter === "needs-action"} onClick={() => setFilter("needs-action")} label="Needs Action" value={summary.needsAction} />
        <FilterChip active={filter === "unlinked"} onClick={() => setFilter("unlinked")} label="Unlinked" value={summary.unlinked} />
      </div>

      {/* ── Stage kanban ────────────────────────────────────────────────── */}
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
        {STAGE_ORDER.map((stage) => (
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

// ── Column ──────────────────────────────────────────────────────────────────

function ProcessColumn({ stage, items, onOpenTab }: { stage: string; items: BoardItem[]; onOpenTab?: (k: string) => void }) {
  const color = getStageColor(stage);
  const caption = STAGE_CAPTIONS[stage] || stage;
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      minHeight: 500,
      borderRadius: 12,
      border: "1px solid var(--cmd-border)",
      background: "var(--cmd-surface)",
      overflow: "hidden",
    }}>
      <div style={{
        padding: "11px 12px",
        borderTop: `3px solid ${color}`,
        borderBottom: "1px solid var(--cmd-border)",
        background: `color-mix(in srgb, ${color} 8%, var(--cmd-surface))`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{
              color,
              fontSize: 11,
              fontWeight: 800,
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
              color: "var(--cmd-text-muted)",
              fontSize: 11,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}>
              {caption}
            </div>
          </div>
          <span style={{
            flex: "0 0 auto",
            minWidth: 28,
            textAlign: "center",
            padding: "3px 7px",
            borderRadius: 999,
            color,
            background: `color-mix(in srgb, ${color} 14%, transparent)`,
            border: `1px solid color-mix(in srgb, ${color} 34%, transparent)`,
            fontSize: 12,
            fontWeight: 800,
            fontVariantNumeric: "tabular-nums",
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
            border: "1px dashed var(--cmd-border)",
            borderRadius: 10,
            minHeight: 82,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--cmd-text-muted)",
            fontSize: 10,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
          }}>
            No packages
          </div>
        ) : (
          items.map((item) => <ProcessCard key={item.id} item={item} onOpenTab={onOpenTab} />)
        )}
      </div>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────

function ProcessCard({ item, onOpenTab }: { item: BoardItem; onOpenTab?: (k: string) => void }) {
  const accent = item.due.overdue
    ? "var(--cmd-danger)"
    : item.needsAction
      ? "var(--cmd-review)"
      : item.due.dueSoon
        ? "var(--cmd-warn)"
        : getStageColor(item.stage);
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
        border: item.due.overdue
          ? "1px solid color-mix(in srgb, var(--cmd-danger) 45%, transparent)"
          : "1px solid var(--cmd-border)",
        borderLeft: `3px solid ${accent}`,
        background: item.due.overdue
          ? "color-mix(in srgb, var(--cmd-danger) 7%, var(--cmd-surface))"
          : "var(--cmd-surface)",
        color: "var(--cmd-text)",
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            color: item.kind === "Drawing Set" ? "var(--cmd-gold)" : "var(--cmd-warn)",
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
          }}>
            {item.linked ? <CircleDot size={10} /> : <Link2 size={10} />}
            <span>{item.kind}</span>
          </div>
          <div style={{
            marginTop: 7,
            color: "var(--cmd-text)",
            fontSize: 13,
            fontWeight: 700,
            lineHeight: 1.25,
            overflowWrap: "anywhere",
          }}>
            {item.title}
          </div>
        </div>
        <ArrowRight size={14} color="var(--cmd-text-muted)" style={{ flex: "0 0 auto", marginTop: 2 }} />
      </div>

      {titleMeta && (
        <div style={{
          marginTop: 7,
          color: "var(--cmd-text-muted)",
          fontSize: 10,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          {titleMeta}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 9 }}>
        <Pill tone={statusPillTone(item.stage)}>{item.status}</Pill>
        <DueCardChip item={item} />
        {item.needsAction && <Pill tone="review">{item.isRR ? "R&R" : "Action"}</Pill>}
        {!item.linked && <Pill tone="warn">Unlinked</Pill>}
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
        borderTop: "1px solid var(--cmd-border)",
        color: "var(--cmd-text-muted)",
        fontSize: 10,
        fontVariantNumeric: "tabular-nums",
      }}>
        <span>{item.sheetCount} sheets</span>
        <span>{item.submittalCount} submittals</span>
      </div>
    </button>
  );
}

/** Stage → a kit Pill tone for the status chip (approximates the stage colour
 *  families: released/IFC → good, OFS/BFA → warn, IFA/OFA → info). */
function statusPillTone(stage: string): PillTone {
  switch (stage) {
    case "Released":
    case "IFC":
      return "good";
    case "OFS":
    case "BFA":
      return "warn";
    case "IFA":
    case "OFA":
      return "info";
    default:
      return "neutral";
  }
}

function DueCardChip({ item }: { item: BoardItem }) {
  const tone: PillTone = item.due.overdue ? "danger" : item.due.dueSoon ? "warn" : "good";
  const Icon = item.due.overdue ? AlertTriangle : item.due.dueSoon ? CalendarClock : CheckCircle2;
  return (
    <span className={`cmd-pill cmd-pill--${tone}`} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <Icon size={10} />
      {item.due.label}
    </span>
  );
}

// ── Leaf chrome ──────────────────────────────────────────────────────────────

function SummaryPill({ icon: Icon, label, value, tone }: { icon: ComponentType<{ size?: number | string }>; label: string; value: number; tone: PillTone }) {
  return (
    <span className={`cmd-pill cmd-pill--${tone}`} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <Icon size={12} />
      <span style={{ textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 10 }}>{label}</span>
      <span style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </span>
  );
}

function FilterChip({ active, label, value, onClick }: { active: boolean; label: string; value: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cmd-chip-btn${active ? " is-active" : ""}`}
      style={{ display: "inline-flex", alignItems: "center", gap: 7 }}
    >
      <span>{label}</span>
      <span style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </button>
  );
}

function CardMeta({ label, value, warn = false }: { label: string; value: any; warn?: boolean }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{
        color: "var(--cmd-text-muted)",
        fontSize: 8,
        fontWeight: 800,
        letterSpacing: "0.10em",
        textTransform: "uppercase",
        marginBottom: 2,
      }}>
        {label}
      </div>
      <div style={{
        color: warn ? "var(--cmd-danger)" : "var(--cmd-text)",
        fontSize: 11,
        fontWeight: 700,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}>
        {value || "-"}
      </div>
    </div>
  );
}
