import type { ComponentType, KeyboardEvent, MouseEvent, PropsWithChildren, ReactNode } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Package,
  Pencil,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import {
  EmptyState as EmptyStateRaw,
  ProgressBar as ProgressBarRaw,
  StatusPill as StatusPillRaw,
} from "@/components/design-system";
import { formatDateShort } from "@/components/shared/formatters";
import { PHASE_ORDER } from "./analytics";
import {
  PHASE_META,
  RISK_FILTERS,
  STATUS_OPTIONS,
  STATUS_TONE,
  formatTons,
  num,
  phaseColor,
} from "./format";
import {
  cardFooterStyle,
  cardMetaGridStyle,
  cardTopStyle,
  clearButtonStyle,
  compactCardStyle,
  controlPanelStyle,
  countLabelStyle,
  display,
  emptyRailStyle,
  eyebrowStyle,
  factLabelStyle,
  factStyle,
  factValueStyle,
  filterButtonStyle,
  filterGroupStyle,
  filterLabelStyle,
  flagStyle,
  flagWrapStyle,
  iconButtonStyle,
  laborLabelStyle,
  laneCountStyle,
  laneDescriptionStyle,
  laneEmptyStyle,
  laneHeaderStyle,
  laneIconStyle,
  laneStyle,
  miniLabelStyle,
  mono,
  packageCardStyle,
  packageNameStyle,
  panelHeaderStyle,
  panelTitleStyle,
  phaseBadgeStyle,
  phaseFlowStyle,
  railStatStyle,
  readinessStyle,
  registerHeaderStyle,
  registerRowStyle,
  registerShellStyle,
  riskDotStyle,
  searchBoxStyle,
  searchInputStyle,
  sideRailStyle,
  statusBoardStyle,
  statusColumnHeaderStyle,
  statusColumnStyle,
  subLineStyle,
  watchItemStyle,
  watchMetaStyle,
  watchTitleStyle,
  wpNumberStyle,
} from "./styles";
import type { PhaseRollupRow, WorkPackage, WorkPackageMetrics, WorkPackageSignals } from "./types";

/**
 * A WorkPackage after buildWorkPackageMetrics has attached its computed
 * `_signals` block. The view/card components below only ever receive enriched
 * rows (everything routed through metrics.enriched / the risk arrays), so
 * `_signals` is guaranteed present here even though it is optional on the base
 * WorkPackage type (which also models raw, pre-enrichment stubs elsewhere).
 */
type EnrichedWorkPackage = WorkPackage & { _signals: WorkPackageSignals };

// design-system primitives are still .jsx; cast at the boundary
// (removable once the shared layer is typed).
type AnyProps = PropsWithChildren<Record<string, unknown>>;
const ProgressBar = ProgressBarRaw as unknown as ComponentType<AnyProps>;
const StatusPill = StatusPillRaw as unknown as ComponentType<AnyProps>;
const EmptyState = EmptyStateRaw as unknown as ComponentType<AnyProps>;

type WPHandler = (wp: WorkPackage) => void;
type WPActionHandler = ((wp: WorkPackage) => void) | null;

export type RegisterSortDirection = "asc" | "desc";
export interface RegisterSort {
  key: string | null;
  direction: RegisterSortDirection;
}

/** Open a row from the keyboard the same way a click would. */
function activateOnKey(handler: () => void) {
  return (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handler();
    }
  };
}

interface ControlPanelProps {
  search: string;
  onSearch: (value: string) => void;
  phaseFilter: string;
  onPhaseFilter: (phase: string) => void;
  statusFilter: string;
  onStatusFilter: (status: string) => void;
  riskFilter: string;
  onRiskFilter: (risk: string) => void;
  filteredCount: number;
  totalCount: number;
  onClear: () => void;
}

export function ControlPanel({
  search,
  onSearch,
  phaseFilter,
  onPhaseFilter,
  statusFilter,
  onStatusFilter,
  riskFilter,
  onRiskFilter,
  filteredCount,
  totalCount,
  onClear,
}: ControlPanelProps) {
  const activeCount = [search, phaseFilter !== "all", statusFilter !== "all", riskFilter !== "all"].filter(Boolean).length;
  return (
    <section style={controlPanelStyle}>
      <div style={searchBoxStyle}>
        <Search size={14} color="var(--text-muted)" />
        <input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search WP #, package, crew, area, sequence, status, notes..."
          aria-label="Search work packages"
          style={searchInputStyle}
        />
      </div>

      <FilterGroup label="Phase">
        <FilterButton active={phaseFilter === "all"} onClick={() => onPhaseFilter("all")}>All</FilterButton>
        {PHASE_ORDER.map((phase) => (
          <FilterButton key={phase} active={phaseFilter === phase} tone={phaseColor(phase)} onClick={() => onPhaseFilter(phase)}>
            {PHASE_META[phase].short}
          </FilterButton>
        ))}
      </FilterGroup>

      <FilterGroup label="Status">
        <FilterButton active={statusFilter === "all"} onClick={() => onStatusFilter("all")}>All</FilterButton>
        {STATUS_OPTIONS.map((status) => (
          <FilterButton key={status} active={statusFilter === status} tone={STATUS_TONE[status]} onClick={() => onStatusFilter(status)}>
            {status}
          </FilterButton>
        ))}
      </FilterGroup>

      <FilterGroup label="Focus">
        {RISK_FILTERS.map((risk) => (
          <FilterButton
            key={risk.id}
            active={riskFilter === risk.id}
            tone={risk.tone}
            onClick={() => onRiskFilter(risk.id)}
          >
            {risk.label}
          </FilterButton>
        ))}
      </FilterGroup>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={countLabelStyle}>{filteredCount} of {totalCount}</span>
        {activeCount > 0 && (
          <button type="button" onClick={onClear} style={clearButtonStyle}>Clear</button>
        )}
      </div>
    </section>
  );
}

interface ExceptionPanelProps {
  metrics: WorkPackageMetrics;
  onRiskFilter: (risk: string) => void;
  onStatusFilter: (status: string) => void;
  onOpen: WPHandler;
}

/**
 * Exception rail. Every count routes to the Focus filter that produces exactly
 * that set — "Drawing gaps" used to map to plain `high`, and "Ready for fab"
 * to the Detailing phase filter, so the rail's numbers never matched the list.
 */
export function ExceptionPanel({ metrics, onRiskFilter, onStatusFilter, onOpen }: ExceptionPanelProps) {
  // metrics.highRisk / mediumRisk come straight from buildWorkPackageMetrics,
  // so every element carries `_signals` — narrow to the enriched shape.
  const watchList = [
    ...metrics.highRisk,
    ...metrics.mediumRisk.filter((wp) => !metrics.highRisk.some((h) => h.id === wp.id)),
  ].slice(0, 6) as EnrichedWorkPackage[];
  const released = metrics.released?.length ?? 0;
  const exceptions = metrics.exceptionReleases?.length ?? 0;

  return (
    <aside style={sideRailStyle} aria-label="Package exceptions">
      <div style={panelHeaderStyle}>
        <div>
          <div style={eyebrowStyle}>Next Attention</div>
          <div style={panelTitleStyle}>Exceptions</div>
        </div>
        <AlertTriangle size={18} color={metrics.highRisk.length ? "var(--status-error)" : "var(--status-success)"} />
      </div>

      <button type="button" onClick={() => onRiskFilter("high")} style={railStatStyle("var(--status-error)")}>
        <span>High risk</span>
        <strong>{metrics.highRisk.length}</strong>
      </button>
      <button type="button" onClick={() => onStatusFilter("On Hold")} style={railStatStyle("var(--status-error)")}>
        <span>On hold</span>
        <strong>{metrics.onHold.length}</strong>
      </button>
      <button type="button" onClick={() => onRiskFilter("overdue")} style={railStatStyle("var(--status-error)")}>
        <span>Past plan date</span>
        <strong>{metrics.overdue?.length ?? 0}</strong>
      </button>
      <button type="button" onClick={() => onRiskFilter("drawing_gaps")} style={railStatStyle("var(--status-warning)")}>
        <span>Drawing gaps</span>
        <strong>{metrics.drawingGaps.length}</strong>
      </button>
      <button type="button" onClick={() => onRiskFilter("ready_fab")} style={railStatStyle("var(--status-success)")}>
        <span>Ready for fab</span>
        <strong>{metrics.readyForFab.length}</strong>
      </button>
      <button type="button" onClick={() => onRiskFilter("released")} style={railStatStyle("var(--phase-fab)")}>
        <span>Released</span>
        <strong>{released}{exceptions ? ` · ${exceptions} exc` : ""}</strong>
      </button>

      <div style={{ borderTop: "1px solid var(--divider)", paddingTop: 12 }}>
        <div style={miniLabelStyle}>Watch list</div>
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {watchList.length ? watchList.map((wp) => (
            <button key={wp.id} type="button" onClick={() => onOpen(wp)} style={watchItemStyle(wp._signals.risk)}>
              <span style={{ minWidth: 0 }}>
                <span style={watchTitleStyle}>{wp.wp_number || "WP"} - {wp.name || "Unnamed package"}</span>
                <span style={watchMetaStyle}>
                  {wp._signals.flags[0]?.label || "Review"} / {wp._signals.phase} / {formatTons(wp.tonnage)}
                </span>
              </span>
              <span style={riskDotStyle(wp._signals.risk)} />
            </button>
          )) : (
            <div style={emptyRailStyle}>No active package exceptions.</div>
          )}
        </div>
      </div>
    </aside>
  );
}

interface PhaseFlowViewProps {
  rows: EnrichedWorkPackage[];
  phaseRollup: PhaseRollupRow[];
  onOpen: WPHandler;
  onEdit: WPActionHandler;
  onDelete: WPActionHandler;
  selectedWPs: Set<string>;
  onToggleSelect: (id: string) => void;
}

export function PhaseFlowView({ rows, phaseRollup, onOpen, onEdit, onDelete, selectedWPs, onToggleSelect }: PhaseFlowViewProps) {
  if (!rows.length) return <NoPackages />;

  return (
    <div className="wp-phase-flow" style={phaseFlowStyle}>
      {PHASE_ORDER.map((phase) => {
        const items = rows.filter((wp) => wp._signals.phase === phase);
        const rollup = phaseRollup.find((row) => row.phase === phase);
        const Icon = PHASE_META[phase].icon;
        return (
          <section key={phase} style={laneStyle(phase)} aria-label={`${PHASE_META[phase].label} lane`}>
            <div style={laneHeaderStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={laneIconStyle(phase)}><Icon size={15} /></span>
                <div>
                  <div style={{ ...display, fontSize: 15, fontWeight: 900, color: "var(--text-primary)" }}>{PHASE_META[phase].label}</div>
                  <div style={laneDescriptionStyle}>{PHASE_META[phase].description}</div>
                </div>
              </div>
              <div style={laneCountStyle(phase)}>{items.length}</div>
            </div>

            <div style={{ marginBottom: 10 }}>
              <ProgressBar value={rollup?.progress || 0} color={phaseColor(phase)} height={5} sub={`${formatTons(rollup?.tons || 0)} - ${rollup?.progress || 0}%`} />
            </div>

            <div style={{ display: "grid", gap: 9 }}>
              {items.map((wp) => (
                <WorkPackageCard
                  key={wp.id}
                  wp={wp}
                  selected={selectedWPs.has(wp.id as string)}
                  onToggle={() => onToggleSelect(wp.id as string)}
                  onOpen={() => onOpen(wp)}
                  onEdit={onEdit ? () => onEdit(wp) : null}
                  onDelete={onDelete ? () => onDelete(wp) : null}
                />
              ))}
              {!items.length && <div style={laneEmptyStyle}>No packages in this phase</div>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

interface StatusBoardViewProps {
  rows: EnrichedWorkPackage[];
  onOpen: WPHandler;
  onEdit: WPActionHandler;
  onDelete: WPActionHandler;
  selectedWPs: Set<string>;
  onToggleSelect: (id: string) => void;
}

export function StatusBoardView({ rows, onOpen, onEdit, onDelete, selectedWPs, onToggleSelect }: StatusBoardViewProps) {
  if (!rows.length) return <NoPackages />;

  return (
    <div style={statusBoardStyle}>
      {STATUS_OPTIONS.map((status) => {
        const items = rows.filter((wp) => wp._signals.status === status);
        const tons = items.reduce((sum, wp) => sum + num(wp.tonnage), 0);
        return (
          <section key={status} style={statusColumnStyle(status)} aria-label={`${status} column`}>
            <div style={statusColumnHeaderStyle}>
              <span>{status}</span>
              <strong>{items.length} / {formatTons(tons)}</strong>
            </div>
            <div style={{ display: "grid", gap: 9 }}>
              {items.map((wp) => (
                <CompactPackageCard
                  key={wp.id}
                  wp={wp}
                  selected={selectedWPs.has(wp.id as string)}
                  onToggle={() => onToggleSelect(wp.id as string)}
                  onOpen={() => onOpen(wp)}
                  onEdit={onEdit ? () => onEdit(wp) : null}
                  onDelete={onDelete ? () => onDelete(wp) : null}
                />
              ))}
              {!items.length && <div style={laneEmptyStyle}>No packages</div>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

interface RegisterViewProps {
  rows: EnrichedWorkPackage[];
  selectedWPs: Set<string>;
  onToggleSelect: (id: string) => void;
  onOpen: WPHandler;
  onEdit: WPActionHandler;
  onDelete: WPActionHandler;
  sort: RegisterSort;
  onSort: (key: string) => void;
}

const REGISTER_COLUMNS: Array<{ key: string | null; label: string }> = [
  { key: "wp_number", label: "WP" },
  { key: "name", label: "Description" },
  { key: null, label: "Sequence" },
  { key: "tonnage", label: "Tons" },
  { key: null, label: "Pieces" },
  { key: null, label: "Drawing Status" },
  { key: null, label: "Material" },
  { key: "progress", label: "Fab" },
  { key: null, label: "Ship" },
  { key: null, label: "Field" },
  { key: null, label: "Risk" },
];

function pieceStageCount(
  pieces: EnrichedWorkPackage["_signals"]["pieces"],
  stage: "fab" | "ship" | "field",
): { primary: string; detail: string } {
  if (!pieces) return { primary: "Unknown", detail: "No piece evidence" };
  const total = pieces.leafCount || 0;
  if (stage === "fab") {
    const complete = pieces.fabricated + pieces.shipped + pieces.delivered + pieces.erected;
    return {
      primary: `${complete}/${total} fabricated`,
      detail: pieces.inFabrication ? `${pieces.inFabrication} in fab` : "No active fab count",
    };
  }
  if (stage === "ship") {
    const shipped = pieces.shipped + pieces.delivered + pieces.erected;
    return { primary: `${shipped}/${total} shipped`, detail: `${pieces.delivered + pieces.erected} delivered+` };
  }
  return { primary: `${pieces.erected}/${total} erected`, detail: `${pieces.delivered} delivered` };
}

function drawingRegisterStatus(signals: EnrichedWorkPackage["_signals"]): {
  primary: string;
  detail: string;
  tone: string;
} {
  if (signals.released) {
    return {
      primary: "Released",
      detail: signals.release?.releaseNumber || "Fab release recorded",
      tone: "var(--status-success)",
    };
  }
  const drawing = signals.drawing;
  if (!drawing.hasAny) {
    return { primary: "No drawings", detail: "Evidence missing", tone: "var(--status-error)" };
  }
  const blocked = drawing.blockedCount ?? 0;
  const ready = drawing.fabReadyCount ?? drawing.approvedCount ?? 0;
  if (blocked > 0) {
    return {
      primary: `${blocked} blocked`,
      detail: `${ready}/${drawing.linkedCount} fab-ready`,
      tone: "var(--status-error)",
    };
  }
  return {
    primary: `${ready}/${drawing.linkedCount} ready`,
    detail: "Drawing gate clear",
    tone: "var(--status-success)",
  };
}

function materialRegisterStatus(wp: EnrichedWorkPackage): {
  primary: string;
  detail: string;
  tone: string;
} {
  const direct = wp.material_status ?? wp.material_state ?? null;
  if (typeof direct === "string" && direct.trim()) {
    return {
      primary: direct.trim(),
      detail: "Recorded package value",
      tone: "var(--text-secondary)",
    };
  }
  if (wp.material_ready === true || wp.material_on_hand === true) {
    return { primary: "Ready", detail: "Material evidence", tone: "var(--status-success)" };
  }
  if (wp.material_ready === false || wp.material_on_hand === false) {
    return { primary: "Not ready", detail: "Material evidence", tone: "var(--status-warning)" };
  }
  return { primary: "Unknown", detail: "No material evidence", tone: "var(--text-muted)" };
}

function RegisterCell({
  primary,
  detail,
  color = "var(--text-primary)",
}: {
  primary: ReactNode;
  detail?: ReactNode;
  color?: string;
}) {
  return (
    <span style={{ display: "grid", minWidth: 0, gap: 2 }}>
      <span style={{ ...mono, fontSize: 10, fontWeight: 800, color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {primary}
      </span>
      {detail ? <span style={subLineStyle}>{detail}</span> : null}
    </span>
  );
}

export function RegisterView({ rows, selectedWPs, onToggleSelect, onOpen, onEdit, onDelete, sort, onSort }: RegisterViewProps) {
  if (!rows.length) return <NoPackages />;

  return (
    <section style={registerShellStyle}>
      <div style={registerHeaderStyle} role="row">
        <span />
        {REGISTER_COLUMNS.map((column) => {
          const active = sort.key === column.key;
          const ariaSort = active ? (sort.direction === "asc" ? "ascending" : "descending") : "none";
          return (
            <button
              key={column.label}
              type="button"
              onClick={() => column.key && onSort(column.key)}
              aria-sort={ariaSort}
              title={`Sort by ${column.label.toLowerCase()}`}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                color: active ? "var(--accent)" : "inherit",
                font: "inherit",
                letterSpacing: "inherit",
                textTransform: "inherit",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                justifyContent: "flex-start",
              }}
            >
              <span data-testid="wp-register-column">{column.label}</span>
              {active && (sort.direction === "asc" ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
            </button>
          );
        })}
        <span />
      </div>
      {rows.map((wp) => (
        <div
          key={wp.id}
          role="button"
          tabIndex={0}
          onClick={() => onOpen(wp)}
          onKeyDown={activateOnKey(() => onOpen(wp))}
          aria-label={`Open ${wp.wp_number || "work package"}`}
          style={registerRowStyle(wp._signals.risk)}
        >
          <input
            type="checkbox"
            checked={selectedWPs.has(wp.id as string)}
            onClick={(event) => event.stopPropagation()}
            onChange={() => onToggleSelect(wp.id as string)}
            aria-label={`Select ${wp.wp_number || "work package"}`}
          />
          <span style={wpNumberStyle}>{wp.wp_number || "-"}</span>
          <span style={{ minWidth: 0 }}>
            <span style={packageNameStyle}>{wp.name || "Unnamed package"}</span>
            <span style={subLineStyle}>{wp.crew || "No crew"} · {wp._signals.status}</span>
          </span>
          <RegisterCell
            primary={wp.sequence_number || wp.area || "Unknown"}
            detail={wp.area && wp.sequence_number ? `Area ${wp.area}` : "Sequence evidence"}
          />
          <RegisterCell
            primary={num(wp.tonnage) > 0 ? formatTons(wp.tonnage) : "Unknown"}
            detail={num(wp.tonnage) > 0 ? "Package tonnage" : "Tonnage missing"}
          />
          <RegisterCell
            primary={wp._signals.pieces ? String(wp._signals.pieces.leafCount) : "Unknown"}
            detail={wp._signals.pieces ? `${wp._signals.pieces.onHold} held` : "Piece control unavailable"}
          />
          {(() => {
            const drawing = drawingRegisterStatus(wp._signals);
            return <RegisterCell primary={drawing.primary} detail={drawing.detail} color={drawing.tone} />;
          })()}
          {(() => {
            const material = materialRegisterStatus(wp);
            return <RegisterCell primary={material.primary} detail={material.detail} color={material.tone} />;
          })()}
          {(() => {
            const fab = pieceStageCount(wp._signals.pieces, "fab");
            return <RegisterCell primary={fab.primary} detail={fab.detail} color={wp._signals.risk === "high" ? "var(--status-error)" : "var(--text-primary)"} />;
          })()}
          {(() => {
            const ship = pieceStageCount(wp._signals.pieces, "ship");
            return <RegisterCell primary={ship.primary} detail={ship.detail} />;
          })()}
          {(() => {
            const field = pieceStageCount(wp._signals.pieces, "field");
            return <RegisterCell primary={field.primary} detail={field.detail} />;
          })()}
          <RegisterCell
            primary={wp._signals.risk === "clear" ? "Clear" : wp._signals.risk === "high" ? "High" : "Watch"}
            detail={wp._signals.flags[0]?.label || `${wp._signals.readinessScore}% ready`}
            color={wp._signals.risk === "high" ? "var(--status-error)" : wp._signals.risk === "medium" ? "var(--status-warning)" : "var(--status-success)"}
          />
          <RowActions
            onEdit={onEdit ? (event) => { event.stopPropagation(); onEdit(wp); } : undefined}
            onDelete={onDelete ? (event) => { event.stopPropagation(); onDelete(wp); } : undefined}
          />
        </div>
      ))}
    </section>
  );
}

interface WorkPackageCardProps {
  wp: EnrichedWorkPackage;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onEdit: (() => void) | null;
  onDelete: (() => void) | null;
}

function WorkPackageCard({ wp, selected, onToggle, onOpen, onEdit, onDelete }: WorkPackageCardProps) {
  const signals = wp._signals;
  const drawingCaption = signals.released
    ? `Released${signals.release?.releaseNumber ? ` · ${signals.release.releaseNumber}` : ""}`
    : `${signals.drawing.fabReadyCount ?? signals.drawing.approvedCount}/${signals.drawing.linkedCount || 0} sheets fab-ready`;
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={activateOnKey(onOpen)}
      aria-label={`Open ${wp.wp_number || "work package"}`}
      style={packageCardStyle(signals.risk, selected)}
    >
      <div style={cardTopStyle}>
        <input
          type="checkbox"
          checked={selected}
          onClick={(event) => event.stopPropagation()}
          onChange={onToggle}
          aria-label={`Select ${wp.wp_number || "work package"}`}
        />
        <span style={wpNumberStyle}>{wp.wp_number || "WP"}</span>
        <div style={{ flex: 1 }} />
        <ReleasePill signals={signals} compact />
        <StatusPill label={signals.status} size="xs" />
      </div>
      <div style={packageNameStyle}>{wp.name || "Unnamed package"}</div>
      <div style={cardMetaGridStyle}>
        <Fact icon={Package} label="Tons" value={num(wp.tonnage) > 0 ? formatTons(wp.tonnage) : "—"} />
        <Fact icon={Users} label="Crew" value={wp.crew || "Open"} />
        <Fact icon={CalendarDays} label="Plan" value={wp.scheduled_end_date ? formatDateShort(wp.scheduled_end_date) : "—"} />
      </div>
      <ProgressBar value={signals.progress} color={phaseColor(signals.phase)} height={5} sub={`${signals.progress}% complete`} />
      <div style={flagWrapStyle}>
        <Readiness value={signals.readinessScore} />
        {signals.flags.slice(0, 2).map((flag) => <Flag key={flag.key} flag={flag} />)}
        {!signals.flags.length && <Flag flag={{ label: "No blockers", severity: "clear" }} />}
      </div>
      <div style={cardFooterStyle}>
        <span style={subLineStyle}>{drawingCaption}</span>
        <RowActions
          onEdit={onEdit ? (event) => { event.stopPropagation(); onEdit(); } : undefined}
          onDelete={onDelete ? (event) => { event.stopPropagation(); onDelete(); } : undefined}
        />
      </div>
    </article>
  );
}

interface CompactPackageCardProps {
  wp: EnrichedWorkPackage;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onEdit: (() => void) | null;
  onDelete: (() => void) | null;
}

function CompactPackageCard({ wp, selected, onToggle, onOpen, onEdit, onDelete }: CompactPackageCardProps) {
  const signals = wp._signals;
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={activateOnKey(onOpen)}
      aria-label={`Open ${wp.wp_number || "work package"}`}
      style={compactCardStyle(signals.risk)}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="checkbox"
          checked={selected}
          onClick={(event) => event.stopPropagation()}
          onChange={onToggle}
          aria-label={`Select ${wp.wp_number || "work package"}`}
        />
        <span style={wpNumberStyle}>{wp.wp_number || "WP"}</span>
        <div style={{ flex: 1 }} />
        <ReleasePill signals={signals} compact />
        <PhaseBadge phase={signals.phase} mismatch={signals.phaseMismatch} />
      </div>
      <div style={packageNameStyle}>{wp.name || "Unnamed package"}</div>
      <ProgressBar value={signals.progress} color={phaseColor(signals.phase)} height={4} sub={`${formatTons(wp.tonnage)} - ${signals.progress}%`} />
      <div style={cardFooterStyle}>
        <span style={subLineStyle}>{signals.flags[0]?.label || wp.crew || "No blockers"}</span>
        <RowActions
          onEdit={onEdit ? (event) => { event.stopPropagation(); onEdit(); } : undefined}
          onDelete={onDelete ? (event) => { event.stopPropagation(); onDelete(); } : undefined}
        />
      </div>
    </article>
  );
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={filterGroupStyle} role="group" aria-label={`${label} filter`}>
      <span style={filterLabelStyle}>{label}</span>
      {children}
    </div>
  );
}

interface FilterButtonProps {
  active: boolean;
  tone?: string;
  onClick: () => void;
  children: ReactNode;
}

function FilterButton({ active, tone = "var(--accent)", onClick, children }: FilterButtonProps) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} style={filterButtonStyle(active, tone)}>
      {children}
    </button>
  );
}

interface FactProps {
  icon: ComponentType<{ size?: number | string; color?: string }>;
  label: string;
  value: ReactNode;
}

function Fact({ icon: Icon, label, value }: FactProps) {
  return (
    <div style={factStyle}>
      <Icon size={12} color="var(--text-muted)" />
      <span>
        <span style={factLabelStyle}>{label}</span>
        <span style={factValueStyle}>{value}</span>
      </span>
    </div>
  );
}

function PhaseBadge({ phase, mismatch }: { phase: string; mismatch?: boolean }) {
  const Icon = PHASE_META[phase]?.icon || Package;
  return (
    <span
      style={phaseBadgeStyle(phase)}
      title={mismatch ? "Phase derived from piece status; the stored phase disagrees" : undefined}
    >
      <Icon size={10} />
      {PHASE_META[phase]?.short || phase || "Phase"}
      {mismatch ? "*" : ""}
    </span>
  );
}

/**
 * What Fab Release says about the package. Blank when no live release row
 * exists, so a package that was never released does not read as "pending".
 */
function ReleasePill({ signals, compact = false }: { signals: WorkPackageSignals; compact?: boolean }) {
  const release = signals.release;
  if (!release) return compact ? null : <span style={{ ...subLineStyle, fontSize: 9 }}>—</span>;
  const exception = Boolean(release.isException);
  const tone = !release.released
    ? "var(--text-muted)"
    : exception ? "var(--status-warning)" : "var(--status-success)";
  const label = !release.released ? "Pending" : exception ? "Exception" : "Released";
  const title = [
    release.releaseNumber ? `Release ${release.releaseNumber}` : "Fab release",
    release.releaseDate ? `on ${formatDateShort(release.releaseDate)}` : null,
    exception ? "(exception release)" : null,
  ].filter(Boolean).join(" ");
  return <span style={flagStyle(tone)} title={title}>{label}</span>;
}

function Readiness({ value }: { value: number }) {
  const tone = value >= 80 ? "var(--status-success)" : value >= 55 ? "var(--status-warning)" : "var(--status-error)";
  return <span style={readinessStyle(tone)}>{value}% ready</span>;
}

function Flag({ flag }: { flag: { label: string; severity: string } }) {
  const tone = flag.severity === "high"
    ? "var(--status-error)"
    : flag.severity === "medium"
      ? "var(--status-warning)"
      : flag.severity === "low"
        ? "var(--text-muted)"
        : "var(--status-success)";
  return <span style={flagStyle(tone)}>{flag.label}</span>;
}

interface RowActionsProps {
  onEdit?: (event: MouseEvent<HTMLButtonElement>) => void;
  onDelete?: (event: MouseEvent<HTMLButtonElement>) => void;
}

/** Edit / Delete icons — rendered only for the actions the user may take. */
function RowActions({ onEdit, onDelete }: RowActionsProps) {
  if (!onEdit && !onDelete) return <span />;
  return (
    <span style={{ display: "inline-flex", gap: 5 }}>
      {onEdit && (
        <button type="button" onClick={onEdit} title="Edit" aria-label="Edit work package" style={iconButtonStyle}>
          <Pencil size={12} />
        </button>
      )}
      {onDelete && (
        <button type="button" onClick={onDelete} title="Delete" aria-label="Delete work package" style={iconButtonStyle}>
          <Trash2 size={12} />
        </button>
      )}
    </span>
  );
}

function NoPackages() {
  return (
    <EmptyState
      icon="wp"
      title="No work packages match this view"
      body="Adjust the search, phase, status, or focus filters to bring packages back into view."
    />
  );
}
