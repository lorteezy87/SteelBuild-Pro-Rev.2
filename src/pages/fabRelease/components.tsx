import type { ComponentType, CSSProperties, MouseEvent, PropsWithChildren, ReactNode } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Factory,
  Filter,
  Gauge,
  Hammer,
  PackageCheck,
  Pencil,
  Search,
  ShieldCheck,
  Trash2,
  Truck,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { StatusPill, Button as ButtonRaw, ProgressBar as ProgressBarRaw } from "@/components/design-system";
import {
  BOARD_LANES,
  FAB_STAGES,
  STATUS_ORDER,
  getWorkPackageDisplayName,
} from "./analytics";
import {
  BOARD_TONE,
  RISK_FILTERS,
  STAGE_FILTERS,
  STATUS_TONE,
  VIEW_OPTIONS,
  display,
  drawingPackageLabel,
  formatDate,
  formatHours,
  formatTons,
  mono,
  num,
  riskColor,
  stageColor,
  stageMeta,
} from "./format";
import type {
  EnrichedWorkPackage,
  FabMetrics,
  FilterOption,
  RiskLevel,
  StageRollup,
  ViewId,
} from "./types";

type IconType = ComponentType<{ size?: number | string; color?: string }>;
type WpHandler = (wp: EnrichedWorkPackage) => void;
type ActionHandler = (event: MouseEvent<HTMLButtonElement>) => void;

// The design-system primitives are still .jsx, so TS infers all of their
// destructured props as required when consumed from .tsx. Until the design
// system itself is typed, treat them as permissive components.
type AnyProps = PropsWithChildren<Record<string, unknown>>;
const Button = ButtonRaw as unknown as ComponentType<AnyProps>;
const ProgressBar = ProgressBarRaw as unknown as ComponentType<AnyProps>;

interface HeroProps {
  projectName: string;
  metrics: FabMetrics;
  view: ViewId | string;
  onViewChange: (view: string) => void;
  onExport: () => void;
  onCreate: (() => void) | null;
}

export function Hero({ projectName, metrics, view, onViewChange, onExport, onCreate }: HeroProps) {
  return (
    <section className="fab-hero">
      <div className="fab-hero-copy">
        <div className="fab-kicker">
          <Factory size={15} />
          Shop Release Control - {projectName}
        </div>
        <h1 style={display}>Fab Release</h1>
        <p>
          Track drawing readiness, release blockers, shop progress, labor burn, and ready-to-ship steel in one visual control board.
        </p>
        <div className="fab-hero-actions">
          <Button variant="secondary" icon="download" onClick={onExport}>CSV</Button>
          {onCreate && <Button variant="primary" icon="plus" onClick={onCreate}>New Package</Button>}
        </div>
      </div>
      <div className="fab-hero-grid">
        <HeroMetric
          label="Ready For Release"
          value={metrics.readyForRelease.length}
          sub={`${formatTons(metrics.readyForRelease.reduce((sum, wp) => sum + num(wp.tonnage), 0))} can move`}
          color="var(--status-success)"
          icon={CheckCircle2}
        />
        <HeroMetric
          label="In Shop"
          value={metrics.activeShop.length}
          sub={`${formatTons(metrics.releasedTons)} released`}
          color="var(--phase-fab)"
          icon={Hammer}
        />
        <HeroMetric
          label="Exceptions"
          value={metrics.exceptions.length}
          sub={`${metrics.drawingGaps.length} drawing gaps`}
          color={metrics.exceptions.length ? "var(--status-error)" : "var(--status-success)"}
          icon={AlertTriangle}
        />
        <HeroMetric
          label="Ready To Ship"
          value={metrics.readyToShip.length}
          sub={`${metrics.weightedProgress}% weighted progress`}
          color="var(--phase-delivery)"
          icon={Truck}
        />
      </div>
      <div className="fab-view-toggle fab-hero-view-toggle">
        {VIEW_OPTIONS.map((option) => {
          const Icon = option.icon as IconType;
          return (
            <button
              key={option.id}
              type="button"
              className={view === option.id ? "is-active" : ""}
              onClick={() => onViewChange(option.id)}
            >
              <Icon size={14} />
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

interface HeroMetricProps {
  label: string;
  value: ReactNode;
  sub: ReactNode;
  color: string;
  icon: IconType;
}

function HeroMetric({ label, value, sub, color, icon: Icon }: HeroMetricProps) {
  return (
    <div className="fab-hero-metric" style={{ "--metric-color": color } as CSSProperties}>
      <div className="fab-hero-icon">
        <Icon size={17} />
      </div>
      <div className="fab-metric-label">{label}</div>
      <div className="fab-metric-value" style={mono}>{value}</div>
      <div className="fab-metric-sub">{sub}</div>
    </div>
  );
}

interface SummaryStripProps {
  metrics: FabMetrics;
  stageFilter: string;
  onStageFilter: (stage: string) => void;
}

export function SummaryStrip({ metrics, stageFilter, onStageFilter }: SummaryStripProps) {
  return (
    <section className="fab-summary-grid">
      <SummaryCard icon={PackageCheck} label="Total Tonnage" value={formatTons(metrics.totalTons)} sub={`${metrics.totalCount} packages`} color="var(--accent)" />
      <SummaryCard icon={Wrench} label="Shop Hours" value={`${metrics.laborBurn}%`} sub={`${formatHours(metrics.totalActualHours)} / ${formatHours(metrics.totalBudgetHours)}`} color={metrics.laborBurn > 100 ? "var(--status-error)" : "var(--status-info)"} />
      <SummaryCard icon={ShieldCheck} label="Release Blocked" value={metrics.releaseBlocked.length} sub={`${metrics.onHold.length} on hold`} color={metrics.releaseBlocked.length ? "var(--status-error)" : "var(--status-success)"} />
      <SummaryCard icon={Clock3} label="Released Tons" value={formatTons(metrics.releasedTons)} sub={`${metrics.activeShop.length} active shop packages`} color="var(--phase-fab)" />
      {metrics.stageRollup.slice(0, 4).map((stage) => (
        <button
          key={stage.id}
          type="button"
          className={`fab-stage-summary ${stageFilter === stage.id ? "is-active" : ""}`}
          style={{ "--stage-color": stage.color } as CSSProperties}
          onClick={() => onStageFilter(stageFilter === stage.id ? "all" : stage.id)}
        >
          <span>{stage.short}</span>
          <strong>{stage.count}</strong>
          <ProgressBar value={stage.progress} color={stage.color} height={5} sub={`${formatTons(stage.cumulativeTons)} through`} />
        </button>
      ))}
    </section>
  );
}

interface SummaryCardProps {
  icon: IconType;
  label: string;
  value: ReactNode;
  sub: ReactNode;
  color: string;
}

function SummaryCard({ icon: Icon, label, value, sub, color }: SummaryCardProps) {
  return (
    <div className="fab-summary-card" style={{ "--summary-color": color } as CSSProperties}>
      <div className="fab-summary-top">
        <span>{label}</span>
        <Icon size={15} />
      </div>
      <strong style={mono}>{value}</strong>
      <small>{sub}</small>
    </div>
  );
}

interface StageFlowStripProps {
  metrics: FabMetrics;
  stageFilter: string;
  onStageFilter: (stage: string) => void;
}

export function StageFlowStrip({ metrics, stageFilter, onStageFilter }: StageFlowStripProps) {
  return (
    <section className="fab-stage-strip">
      <div className="fab-section-head">
        <div>
          <div className="fab-section-label">Release Pipeline</div>
          <div className="fab-muted">Visual stage flow from approved drawings through ready-to-ship packages.</div>
        </div>
        <div className="fab-flow-total" style={mono}>{formatTons(metrics.totalTons)} total</div>
      </div>
      <div className="fab-stage-steps">
        {metrics.stageRollup.map((stage) => (
          <button
            key={stage.id}
            type="button"
            className={`fab-stage-step ${stageFilter === stage.id ? "is-active" : ""}`}
            style={{ "--stage-color": stage.color } as CSSProperties}
            onClick={() => onStageFilter(stageFilter === stage.id ? "all" : stage.id)}
          >
            <span>{stage.label}</span>
            <strong>{stage.count}</strong>
            <small>{formatTons(stage.tons)} here</small>
            <ProgressBar value={stage.progress} color={stage.color} height={4} />
          </button>
        ))}
      </div>
    </section>
  );
}

interface ToolbarProps {
  search: string;
  onSearch: (value: string) => void;
  stageFilter: string;
  onStageFilter: (stage: string) => void;
  riskFilter: string;
  onRiskFilter: (risk: string) => void;
  view: ViewId | string;
  onViewChange: (view: string) => void;
  filteredCount: number;
  totalCount: number;
  onClear: () => void;
}

export function Toolbar({
  search,
  onSearch,
  stageFilter,
  onStageFilter,
  riskFilter,
  onRiskFilter,
  view,
  onViewChange,
  filteredCount,
  totalCount,
  onClear,
}: ToolbarProps) {
  const activeFilters = [search.trim(), stageFilter !== "all", riskFilter !== "all"].filter(Boolean).length;
  return (
    <section className="fab-toolbar">
      <div className="fab-search">
        <Search size={15} />
        <input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search WP, drawing set, crew, status, flag..."
        />
      </div>
      <FilterSelect value={stageFilter} onChange={onStageFilter} options={STAGE_FILTERS} />
      <FilterSelect value={riskFilter} onChange={onRiskFilter} options={RISK_FILTERS} />
      <div className="fab-view-toggle">
        {VIEW_OPTIONS.map((option) => {
          const Icon = option.icon as IconType;
          return (
            <button
              key={option.id}
              type="button"
              className={view === option.id ? "is-active" : ""}
              onClick={() => onViewChange(option.id)}
            >
              <Icon size={14} />
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
      <div className="fab-toolbar-count" style={mono}>
        {filteredCount} of {totalCount}
      </div>
      {activeFilters > 0 && (
        <Button variant="ghost" size="sm" onClick={onClear}>Clear</Button>
      )}
    </section>
  );
}

interface FilterSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
}

function FilterSelect({ value, onChange, options }: FilterSelectProps) {
  return (
    <label className="fab-filter-select">
      <Filter size={13} />
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

interface ExceptionRailProps {
  metrics: FabMetrics;
  onOpen: WpHandler;
  onFilterRisk: (risk: string) => void;
  onFilterStage: (stage: string) => void;
}

export function ExceptionRail({ metrics, onOpen, onFilterRisk, onFilterStage }: ExceptionRailProps) {
  const watchList = [
    ...metrics.exceptions,
    ...metrics.warnings.filter((wp) => !metrics.exceptions.some((item) => item.id === wp.id)),
  ].slice(0, 8);

  return (
    <aside className="fab-rail">
      <div className="fab-rail-header">
        <div>
          <div className="fab-section-label">Next Attention</div>
          <div className="fab-muted">Blocked release items and shop risks.</div>
        </div>
        <AlertTriangle size={18} color={metrics.exceptions.length ? "var(--status-error)" : "var(--status-success)"} />
      </div>

      <div className="fab-rail-kpis">
        <MiniStat label="Exceptions" value={metrics.exceptions.length} color="var(--status-error)" onClick={() => onFilterRisk("high")} />
        <MiniStat label="Warnings" value={metrics.warnings.length} color="var(--status-warning)" onClick={() => onFilterRisk("medium")} />
        <MiniStat label="Ready" value={metrics.readyForRelease.length} color="var(--status-success)" onClick={() => onFilterStage("material_on_hand")} />
        <MiniStat label="RTS" value={metrics.readyToShip.length} color="var(--phase-delivery)" onClick={() => onFilterStage("ready_to_ship")} />
      </div>

      <div className="fab-watch-list">
        {watchList.length ? watchList.map((wp) => (
          <button key={wp.id} type="button" className="fab-watch-card" onClick={() => onOpen(wp)}>
            <div className="fab-watch-top">
              <StatusPill label={wp._signals.risk === "high" ? "Exception" : "Warning"} color={riskColor(wp._signals.risk)} size="xs" />
              <span>{stageMeta(wp._signals.stage).short}</span>
            </div>
            <strong>{wp.wp_number || "WP"} - {getWorkPackageDisplayName(wp)}</strong>
            <small>{wp._signals.flags[0]?.label || "Review"} / {formatTons(wp.tonnage)}</small>
          </button>
        )) : (
          <div className="fab-rail-empty">No active fab release exceptions.</div>
        )}
      </div>
    </aside>
  );
}

interface MiniStatProps {
  label: string;
  value: ReactNode;
  color: string;
  onClick: () => void;
}

function MiniStat({ label, value, color, onClick }: MiniStatProps) {
  return (
    <button type="button" className="fab-mini-stat" style={{ "--mini-color": color } as CSSProperties} onClick={onClick}>
      <span>{label}</span>
      <strong style={mono}>{value}</strong>
    </button>
  );
}

interface ViewHeaderProps {
  view: ViewId | string;
  filteredCount: number;
  totalCount: number;
  onClear: () => void;
}

export function ViewHeader({ view, filteredCount, totalCount, onClear }: ViewHeaderProps) {
  const title = view === "flow"
    ? "Stage Flow"
    : view === "board"
      ? "Release Board"
      : view === "hours"
        ? "Shop Hours"
        : "Fab Register";
  const subtitle = view === "hours"
    ? "Budget and actual shop-hour visibility by package and status."
    : "Open each card for drawing packages, blockers, dates, labor, and status actions.";
  return (
    <div className="fab-view-header">
      <div>
        <div className="fab-section-label">{title}</div>
        <div className="fab-muted">{filteredCount} of {totalCount} packages shown. {subtitle}</div>
      </div>
      <Button variant="ghost" size="sm" onClick={onClear}>Clear Filters</Button>
    </div>
  );
}

interface FlowViewProps {
  rows: EnrichedWorkPackage[];
  stageRollup: StageRollup[];
  onOpen: WpHandler;
  onEdit: WpHandler;
  onComplete: WpHandler;
  isCompleting: boolean;
}

export function FlowView({ rows, stageRollup, onOpen, onEdit, onComplete, isCompleting }: FlowViewProps) {
  if (!rows.length) return null;
  return (
    <div className="fab-stage-lanes">
      {FAB_STAGES.map((stage) => {
        const items = rows.filter((wp) => wp._signals.stage === stage.id);
        const rollup = stageRollup.find((item) => item.id === stage.id);
        return (
          <section key={stage.id} className="fab-lane" style={{ "--lane-color": stage.color } as CSSProperties}>
            <div className="fab-lane-head">
              <span>
                <strong>{stage.label}</strong>
                <small>{stage.description}</small>
              </span>
              <em>{items.length}</em>
            </div>
            <ProgressBar value={rollup?.progress || 0} color={stage.color} height={5} sub={`${formatTons(rollup?.tons || 0)} at stage`} />
            <div className="fab-card-list">
              {items.length ? items.map((wp) => (
                <FabPackageCard
                  key={wp.id}
                  wp={wp}
                  onOpen={() => onOpen(wp)}
                  onEdit={() => onEdit(wp)}
                  onComplete={() => onComplete(wp)}
                  isCompleting={isCompleting}
                />
              )) : (
                <div className="fab-lane-empty">No packages here</div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

interface BoardViewProps {
  laneGroups: Record<string, EnrichedWorkPackage[]>;
  onOpen: WpHandler;
  onEdit: WpHandler;
  onComplete: WpHandler;
  isCompleting: boolean;
}

export function BoardView({ laneGroups, onOpen, onEdit, onComplete, isCompleting }: BoardViewProps) {
  return (
    <div className="fab-board">
      {BOARD_LANES.map((lane) => {
        const items = laneGroups[lane] || [];
        const tons = items.reduce((sum, wp) => sum + num(wp.tonnage), 0);
        return (
          <section key={lane} className="fab-board-lane" style={{ "--lane-color": BOARD_TONE[lane] } as CSSProperties}>
            <div className="fab-board-head">
              <span>{lane}</span>
              <strong>{items.length} / {formatTons(tons)}</strong>
            </div>
            <div className="fab-card-list">
              {items.length ? items.map((wp) => (
                <FabPackageCard
                  key={wp.id}
                  wp={wp}
                  compact
                  onOpen={() => onOpen(wp)}
                  onEdit={() => onEdit(wp)}
                  onComplete={() => onComplete(wp)}
                  isCompleting={isCompleting}
                />
              )) : (
                <div className="fab-lane-empty">No packages</div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

interface RegisterViewProps {
  rows: EnrichedWorkPackage[];
  onOpen: WpHandler;
  onEdit: WpHandler;
  onComplete: WpHandler;
  isCompleting: boolean;
}

export function RegisterView({ rows, onOpen, onEdit, onComplete, isCompleting }: RegisterViewProps) {
  if (!rows.length) return null;
  return (
    <section className="fab-register-shell">
      <table className="fab-register-table">
        <thead>
          <tr>
            <th>WP</th>
            <th>Package</th>
            <th>Stage</th>
            <th>Status</th>
            <th>Drawings</th>
            <th>Progress</th>
            <th>Readiness</th>
            <th>Released</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((wp) => (
            <tr key={wp.id} onClick={() => onOpen(wp)} className={`risk-${wp._signals.risk}`}>
              <td><span className="fab-wp-number">{wp.wp_number || "-"}</span></td>
              <td>
                <strong>{getWorkPackageDisplayName(wp)}</strong>
                <small>{wp.crew || "No shop owner"} / {formatTons(wp.tonnage)}</small>
              </td>
              <td><StageBadge stage={wp._signals.stage} /></td>
              <td><StatusPill label={wp._signals.status} color={STATUS_TONE[wp._signals.status]} size="xs" /></td>
              <td>{wp._signals.drawing.releasedCount}/{wp._signals.drawing.linkedCount || 0}</td>
              <td><ProgressBar value={wp._signals.progress} color={stageColor(wp._signals.stage)} height={4} sub={`${wp._signals.progress}%`} /></td>
              <td><Readiness value={wp._signals.readinessScore} risk={wp._signals.risk} /></td>
              <td>{formatDate(wp.released_date)}</td>
              <td>
                <CardActions
                  wp={wp}
                  onEdit={(event) => { event.stopPropagation(); onEdit(wp); }}
                  onComplete={(event) => { event.stopPropagation(); onComplete(wp); }}
                  isCompleting={isCompleting}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

interface HoursViewProps {
  rows: EnrichedWorkPackage[];
  metrics: FabMetrics;
  statusGroups: Record<string, EnrichedWorkPackage[]>;
  onOpen: WpHandler;
}

export function HoursView({ rows, metrics, statusGroups, onOpen }: HoursViewProps) {
  if (!rows.length) return null;
  return (
    <div className="fab-hours-view">
      <section className="fab-hours-summary">
        <SummaryCard icon={Gauge} label="Shop Burn" value={`${metrics.laborBurn}%`} sub={`${formatHours(metrics.totalActualHours)} actual`} color={metrics.laborBurn > 100 ? "var(--status-error)" : "var(--status-info)"} />
        <SummaryCard icon={Clock3} label="Budget Hours" value={formatHours(metrics.totalBudgetHours)} sub="Total planned shop hours" color="var(--accent)" />
        <SummaryCard icon={Wrench} label="Actual Hours" value={formatHours(metrics.totalActualHours)} sub="Posted shop hours" color="var(--phase-fab)" />
        <SummaryCard icon={AlertTriangle} label="Over Budget" value={rows.filter((wp) => wp._signals.hourBurn > 100).length} sub="Packages over shop budget" color="var(--status-error)" />
      </section>

      <section className="fab-status-hours">
        {STATUS_ORDER.map((status) => {
          const items = statusGroups[status] || [];
          const budget = items.reduce((sum, wp) => sum + wp._signals.totalBudgetHours, 0);
          const actual = items.reduce((sum, wp) => sum + wp._signals.totalActualHours, 0);
          const burn = budget > 0 ? Math.round((actual / budget) * 100) : 0;
          return (
            <div key={status} className="fab-hour-bucket" style={{ "--bucket-color": STATUS_TONE[status] } as CSSProperties}>
              <div className="fab-hour-bucket-head">
                <span>{status}</span>
                <strong>{items.length}</strong>
              </div>
              <ProgressBar value={burn} color={STATUS_TONE[status]} height={5} sub={`${formatHours(actual)} / ${formatHours(budget)}`} />
            </div>
          );
        })}
      </section>

      <section className="fab-hours-table">
        {rows.map((wp) => (
          <button key={wp.id} type="button" className="fab-hour-row" onClick={() => onOpen(wp)}>
            <span>
              <strong>{wp.wp_number || "WP"} - {getWorkPackageDisplayName(wp)}</strong>
              <small>{stageMeta(wp._signals.stage).label} / {wp.crew || "No shop owner"}</small>
            </span>
            <span>{formatHours(wp._signals.totalActualHours)} actual</span>
            <span>{formatHours(wp._signals.totalBudgetHours)} budget</span>
            <Readiness value={wp._signals.hourBurn || 0} risk={wp._signals.hourBurn > 100 ? "high" : "clear"} suffix="% burn" />
          </button>
        ))}
      </section>
    </div>
  );
}

interface FabPackageCardProps {
  wp: EnrichedWorkPackage;
  compact?: boolean;
  onOpen: () => void;
  onEdit: ActionHandler;
  onComplete: ActionHandler;
  isCompleting: boolean;
}

function FabPackageCard({ wp, compact = false, onOpen, onEdit, onComplete, isCompleting }: FabPackageCardProps) {
  const signals = wp._signals;
  const firstFlag = signals.flags[0];
  return (
    <article className={`fab-package-card risk-${signals.risk} ${compact ? "is-compact" : ""}`} onClick={onOpen}>
      <div className="fab-card-top">
        <span className="fab-wp-number">{wp.wp_number || "WP"}</span>
        <StageBadge stage={signals.stage} />
      </div>
      <h3>{getWorkPackageDisplayName(wp)}</h3>
      {!compact && (
        <div className="fab-card-facts">
          <Fact icon={PackageCheck} label="Tons" value={formatTons(wp.tonnage)} />
          <Fact icon={Users} label="Owner" value={wp.crew || "Open"} />
          <Fact icon={CalendarDays} label="Release" value={formatDate(wp.released_date)} />
        </div>
      )}
      <ProgressBar value={signals.progress} color={stageColor(signals.stage)} height={5} sub={`${signals.progress}% complete`} />
      <div className="fab-card-pills">
        <Readiness value={signals.readinessScore} risk={signals.risk} />
        <Flag label={firstFlag?.label || "No blockers"} severity={firstFlag?.severity || "clear"} />
      </div>
      <div className="fab-card-drawings">
        {signals.drawing.releasedCount}/{signals.drawing.linkedCount || 0} released drawings
        {signals.drawing.packageNames[0] ? ` / ${signals.drawing.packageNames[0]}` : ""}
      </div>
      <div className="fab-card-actions">
        <CardActions wp={wp} onEdit={onEdit} onComplete={onComplete} isCompleting={isCompleting} />
      </div>
    </article>
  );
}

interface CardActionsProps {
  wp: EnrichedWorkPackage;
  onEdit: ActionHandler;
  onComplete: ActionHandler;
  isCompleting: boolean;
}

function CardActions({ wp, onEdit, onComplete, isCompleting }: CardActionsProps) {
  return (
    <span className="fab-row-actions">
      <button type="button" onClick={onEdit} title="Edit package" aria-label="Edit package">
        <Pencil size={12} />
      </button>
      {wp._signals.stage !== "ready_to_ship" && (
        <button type="button" onClick={onComplete} disabled={isCompleting} title="Mark ready to ship" aria-label="Mark ready to ship">
          <Check size={12} />
        </button>
      )}
    </span>
  );
}

function StageBadge({ stage }: { stage: string }) {
  const meta = stageMeta(stage);
  return (
    <span className="fab-stage-badge" style={{ "--badge-color": meta.color } as CSSProperties}>
      {meta.short}
    </span>
  );
}

interface ReadinessProps {
  value: number;
  risk?: RiskLevel | string;
  suffix?: string;
}

function Readiness({ value, risk, suffix = "% ready" }: ReadinessProps) {
  const tone = riskColor(risk || (value >= 80 ? "clear" : value >= 55 ? "medium" : "high"));
  return <span className="fab-readiness" style={{ "--readiness-color": tone } as CSSProperties}>{value}{suffix}</span>;
}

function Flag({ label, severity }: { label: string; severity: RiskLevel | string }) {
  return <span className="fab-flag" style={{ "--flag-color": riskColor(severity) } as CSSProperties}>{label}</span>;
}

interface FactProps {
  icon: IconType;
  label: string;
  value: ReactNode;
}

function Fact({ icon: Icon, label, value }: FactProps) {
  return (
    <span className="fab-fact">
      <Icon size={12} />
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
      </span>
    </span>
  );
}

interface DetailPanelProps {
  wp: EnrichedWorkPackage;
  onClose: () => void;
  onEdit: (() => void) | null;
  onDelete: (() => void) | null;
  onComplete: () => void;
  isCompleting: boolean;
}

export function DetailPanel({ wp, onClose, onEdit, onDelete, onComplete, isCompleting }: DetailPanelProps) {
  const signals = wp._signals;
  const packageLabels = signals.drawing.packages.map(drawingPackageLabel);
  return (
    <div className="fab-detail-backdrop" role="presentation" onClick={onClose}>
      <aside className="fab-detail-panel" role="dialog" aria-modal="true" aria-label="Fab package details" onClick={(event) => event.stopPropagation()}>
        <div className="fab-detail-head">
          <div>
            <div className="fab-kicker">
              <Factory size={14} />
              {wp.wp_number || "WP"} / {stageMeta(signals.stage).label}
            </div>
            <h2 style={display}>{getWorkPackageDisplayName(wp)}</h2>
          </div>
          <button type="button" className="fab-close" onClick={onClose} aria-label="Close details">
            <X size={18} />
          </button>
        </div>

        <div className="fab-detail-pills">
          <StageBadge stage={signals.stage} />
          <StatusPill label={signals.status} color={STATUS_TONE[signals.status]} />
          <StatusPill label={signals.risk === "high" ? "Exception" : signals.risk === "medium" ? "Warning" : "Clear"} color={riskColor(signals.risk)} />
          <Readiness value={signals.readinessScore} risk={signals.risk} />
        </div>

        <section className="fab-detail-section">
          <div className="fab-section-label">Release Status</div>
          <div className="fab-detail-grid">
            <DetailStat label="Tonnage" value={formatTons(wp.tonnage)} />
            <DetailStat label="Progress" value={`${signals.progress}%`} />
            <DetailStat label="Released" value={formatDate(wp.released_date)} />
            <DetailStat label="Crew / Owner" value={wp.crew || "Open"} />
            <DetailStat label="VIF" value={wp.vif_confirmed ? "Confirmed" : "Open"} />
            <DetailStat label="Load List" value={wp.load_list_complete ? "Complete" : "Open"} />
          </div>
        </section>

        <section className="fab-detail-section">
          <div className="fab-section-label">Drawing Packages</div>
          {packageLabels.length ? (
            <div className="fab-detail-list">
              {packageLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
          ) : (
            <div className="fab-detail-empty">No linked drawing packages.</div>
          )}
          <div className="fab-muted">
            {signals.drawing.releasedCount}/{signals.drawing.linkedCount || 0} linked drawings released for fabrication.
          </div>
        </section>

        <section className="fab-detail-section">
          <div className="fab-section-label">Blockers</div>
          {signals.flags.length ? (
            <div className="fab-detail-flags">
              {signals.flags.map((flag) => (
                <Flag key={flag.key} label={flag.label} severity={flag.severity} />
              ))}
            </div>
          ) : (
            <div className="fab-detail-empty">No blockers currently flagged.</div>
          )}
        </section>

        {signals.readinessBreakdown && (
          <section className="fab-detail-section">
            <div className="fab-section-label">Release Readiness Breakdown</div>
            <div style={{ marginTop: 10, display: "grid", gap: 4 }}>
              {signals.readinessBreakdown.map((gate) => (
                <div key={gate.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    width: 16, height: 16, borderRadius: 4, display: "flex", alignItems: "center",
                    justifyContent: "center", fontSize: 9, fontWeight: 900, flexShrink: 0,
                    background: gate.pass ? "var(--status-success)" : "var(--status-error)", color: "#fff",
                  }}>
                    {gate.pass ? "✓" : "✗"}
                  </span>
                  <span style={{
                    flex: 1, fontSize: 11,
                    color: gate.pass ? "var(--text-secondary)" : "var(--text-primary)",
                  }}>
                    {gate.label}
                  </span>
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 900,
                    color: gate.pass ? "var(--status-success)" : "var(--text-muted)",
                  }}>
                    {gate.earned}/{gate.weight}
                  </span>
                </div>
              ))}
              <div style={{
                display: "flex", justifyContent: "flex-end", marginTop: 4, paddingTop: 6,
                borderTop: "1px solid var(--divider)",
              }}>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 900,
                  color: signals.readinessScore >= 80 ? "var(--status-success)"
                    : signals.readinessScore >= 55 ? "var(--status-warning)" : "var(--status-error)",
                }}>
                  {signals.readinessScore}/100
                </span>
              </div>
            </div>
          </section>
        )}

        <section className="fab-detail-section">
          <div className="fab-section-label">Shop Hours</div>
          <ProgressBar
            value={signals.hourBurn}
            color={signals.hourBurn > 100 ? "var(--status-error)" : "var(--phase-fab)"}
            height={7}
            sub={`${formatHours(signals.totalActualHours)} actual / ${formatHours(signals.totalBudgetHours)} budget`}
          />
        </section>

        <div className="fab-detail-actions">
          {onEdit && <Button variant="secondary" icon="edit" onClick={onEdit}>Edit</Button>}
          {signals.stage !== "ready_to_ship" && (
            <Button variant="primary" icon="check" onClick={onComplete} disabled={isCompleting}>Mark RTS</Button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              style={{
                background: "var(--danger-muted)", border: "1px solid var(--danger-border)",
                color: "var(--status-error)", borderRadius: "var(--radius-btn)",
                padding: "6px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              <Trash2 size={13} /> Delete
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="fab-detail-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
