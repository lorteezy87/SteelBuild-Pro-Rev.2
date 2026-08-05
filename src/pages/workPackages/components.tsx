import type { ComponentType, PropsWithChildren, ReactNode } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Gauge,
  Package,
  Pencil,
  Search,
  ShipWheel,
  Trash2,
  Users,
} from "lucide-react";
import {
  Button as ButtonRaw,
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
  VIEW_OPTIONS,
  formatHours,
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
  heroActionStyle,
  heroMetaStyle,
  heroStyle,
  heroTitleStyle,
  iconButtonStyle,
  laborLabelStyle,
  laneCountStyle,
  laneDescriptionStyle,
  laneEmptyStyle,
  laneHeaderStyle,
  laneIconStyle,
  laneStyle,
  metricCardStyle,
  metricLabelStyle,
  miniLabelStyle,
  mono,
  packageCardStyle,
  packageNameStyle,
  panelHeaderStyle,
  panelTitleStyle,
  phaseBadgeStyle,
  phaseFlowStyle,
  phaseMetricStyle,
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
  summaryGridStyle,
  viewButtonStyle,
  viewToggleStyle,
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
const Button = ButtonRaw as unknown as ComponentType<AnyProps>;
const ProgressBar = ProgressBarRaw as unknown as ComponentType<AnyProps>;
const StatusPill = StatusPillRaw as unknown as ComponentType<AnyProps>;
const EmptyState = EmptyStateRaw as unknown as ComponentType<AnyProps>;

type WPHandler = (wp: WorkPackage) => void;
type WPActionHandler = ((wp: WorkPackage) => void) | null;

interface HeroProps {
  projectName: string;
  metrics: WorkPackageMetrics;
  view: string;
  onViewChange: (view: string) => void;
  onExport: () => void;
  onBulkAdd: () => void;
  onCreate: () => void;
  canCreate: boolean;
}

export function Hero({ projectName, metrics, view, onViewChange, onExport, onBulkAdd, onCreate, canCreate }: HeroProps) {
  return (
    <section className="wp-hero" style={heroStyle}>
      <div style={{ minWidth: 0 }}>
        <div style={eyebrowStyle}>Work Package Control</div>
        <div style={heroTitleStyle}>Production Flow</div>
        <div style={heroMetaStyle}>
          <span>{projectName}</span>
          <span>{metrics.totalCount} packages</span>
          <span>{formatTons(metrics.totalTons)}</span>
          <span>{metrics.progress}% weighted progress</span>
        </div>
      </div>

      <div style={heroActionStyle}>
        <div style={viewToggleStyle}>
          {VIEW_OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = view === option.id;
            return (
              <button key={option.id} type="button" onClick={() => onViewChange(option.id)} style={viewButtonStyle(active)}>
                {Icon && <Icon size={13} />}
                {option.label}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Button variant="secondary" icon="download" onClick={onExport}>CSV</Button>
          <Button variant="outline" icon="upload" onClick={onBulkAdd} disabled={!canCreate}>Bulk Add</Button>
          <Button variant="primary" icon="plus" onClick={onCreate} disabled={!canCreate}>New WP</Button>
        </div>
      </div>
    </section>
  );
}

interface SummaryStripProps {
  metrics: WorkPackageMetrics;
  phaseFilter: string;
  onPhaseFilter: (phase: string) => void;
}

export function SummaryStrip({ metrics, phaseFilter, onPhaseFilter }: SummaryStripProps) {
  return (
    <section style={summaryGridStyle}>
      <MetricCard icon={Package} label="Total Tons" value={formatTons(metrics.totalTons)} sub={`${metrics.totalCount} packages`} tone="var(--accent)" />
      <MetricCard icon={Gauge} label="Labor Burn" value={`${metrics.laborBurn}%`} sub={`${formatHours(metrics.totalActualHours)} / ${formatHours(metrics.totalBudgetHours)}`} tone={metrics.laborBurn > 100 ? "var(--status-error)" : "var(--status-info)"} />
      <MetricCard icon={AlertTriangle} label="Exceptions" value={metrics.highRisk.length} sub={`${metrics.mediumRisk.length} warnings`} tone={metrics.highRisk.length ? "var(--status-error)" : "var(--status-success)"} />
      <MetricCard icon={ShipWheel} label="Ready To Ship" value={metrics.readyForShip.length} sub={`${metrics.fieldReady.length} field ready`} tone="var(--phase-delivery)" />
      {metrics.phaseRollup.map((row) => (
        <button key={row.phase} type="button" onClick={() => onPhaseFilter(phaseFilter === row.phase ? "all" : row.phase)} style={phaseMetricStyle(row.phase, phaseFilter === row.phase)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <span style={metricLabelStyle}>{PHASE_META[row.phase].short}</span>
            <span style={{ color: phaseColor(row.phase), ...mono, fontSize: 10, fontWeight: 800 }}>{row.count}</span>
          </div>
          <div style={{ marginTop: 12 }}>
            <ProgressBar value={row.progress} color={phaseColor(row.phase)} height={5} sub={`${formatTons(row.tons)} - ${row.progress}%`} />
          </div>
        </button>
      ))}
    </section>
  );
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
          placeholder="Search WP #, package, crew, status, notes..."
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

      <FilterGroup label="Risk">
        {RISK_FILTERS.map((risk) => (
          <FilterButton
            key={risk.id}
            active={riskFilter === risk.id}
            tone={risk.id === "high" ? "var(--status-error)" : risk.id === "medium" ? "var(--status-warning)" : risk.id === "clear" ? "var(--status-success)" : "var(--accent)"}
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
  onPhaseFilter: (phase: string) => void;
  onOpen: WPHandler;
}

export function ExceptionPanel({ metrics, onRiskFilter, onStatusFilter, onPhaseFilter, onOpen }: ExceptionPanelProps) {
  // metrics.highRisk / mediumRisk come straight from buildWorkPackageMetrics,
  // so every element carries `_signals` — narrow to the enriched shape.
  const watchList = [
    ...metrics.highRisk,
    ...metrics.mediumRisk.filter((wp) => !metrics.highRisk.some((h) => h.id === wp.id)),
  ].slice(0, 6) as EnrichedWorkPackage[];

  return (
    <aside style={sideRailStyle}>
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
      <button type="button" onClick={() => onRiskFilter("high")} style={railStatStyle("var(--status-warning)")}>
        <span>Drawing gaps</span>
        <strong>{metrics.drawingGaps.length}</strong>
      </button>
      <button type="button" onClick={() => onPhaseFilter("Detailing")} style={railStatStyle("var(--status-success)")}>
        <span>Ready for fab</span>
        <strong>{metrics.readyForFab.length}</strong>
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
          <section key={phase} style={laneStyle(phase)}>
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
                  onEdit={() => onEdit?.(wp)}
                  onDelete={() => onDelete?.(wp)}
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
}

export function StatusBoardView({ rows, onOpen, onEdit, onDelete }: StatusBoardViewProps) {
  if (!rows.length) return <NoPackages />;

  return (
    <div style={statusBoardStyle}>
      {STATUS_OPTIONS.map((status) => {
        const items = rows.filter((wp) => wp._signals.status === status);
        const tons = items.reduce((sum, wp) => sum + num(wp.tonnage), 0);
        return (
          <section key={status} style={statusColumnStyle(status)}>
            <div style={statusColumnHeaderStyle}>
              <span>{status}</span>
              <strong>{items.length} / {formatTons(tons)}</strong>
            </div>
            <div style={{ display: "grid", gap: 9 }}>
              {items.map((wp) => (
                <CompactPackageCard key={wp.id} wp={wp} onOpen={() => onOpen(wp)} onEdit={() => onEdit?.(wp)} onDelete={() => onDelete?.(wp)} />
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
}

export function RegisterView({ rows, selectedWPs, onToggleSelect, onOpen, onEdit, onDelete }: RegisterViewProps) {
  if (!rows.length) return <NoPackages />;

  return (
    <section style={registerShellStyle}>
      <div style={registerHeaderStyle}>
        <span />
        <span>WP</span>
        <span>Package</span>
        <span>Phase</span>
        <span>Status</span>
        <span>Progress</span>
        <span>Readiness</span>
        <span>Labor</span>
        <span />
      </div>
      {rows.map((wp) => (
        <div key={wp.id} onClick={() => onOpen(wp)} style={registerRowStyle(wp._signals.risk)}>
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
            <span style={subLineStyle}>{wp.crew || "No crew"} / {formatTons(wp.tonnage)}</span>
          </span>
          <PhaseBadge phase={wp._signals.phase} />
          <StatusPill label={wp._signals.status} />
          <ProgressBar value={wp._signals.progress} color={phaseColor(wp._signals.phase)} height={4} sub={`${wp._signals.progress}%`} />
          <Readiness value={wp._signals.readinessScore} />
          <span style={laborLabelStyle(wp._signals.hourBurn)}>{wp._signals.totalBudgetHours ? `${wp._signals.hourBurn}%` : "-"}</span>
          <RowActions onEdit={(event) => { event.stopPropagation(); onEdit?.(wp); }} onDelete={(event) => { event.stopPropagation(); onDelete?.(wp); }} />
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
  onEdit: () => void;
  onDelete: () => void;
}

function WorkPackageCard({ wp, selected, onToggle, onOpen, onEdit, onDelete }: WorkPackageCardProps) {
  const signals = wp._signals;
  return (
    <article onClick={onOpen} style={packageCardStyle(signals.risk, selected)}>
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
        <StatusPill label={signals.status} size="xs" />
      </div>
      <div style={packageNameStyle}>{wp.name || "Unnamed package"}</div>
      <div style={cardMetaGridStyle}>
        <Fact icon={Package} label="Tons" value={formatTons(wp.tonnage)} />
        <Fact icon={Users} label="Crew" value={wp.crew || "Open"} />
        <Fact icon={CalendarDays} label="Plan" value={formatDateShort(wp.scheduled_end_date || wp.due_date)} />
      </div>
      <ProgressBar value={signals.progress} color={phaseColor(signals.phase)} height={5} sub={`${signals.progress}% complete`} />
      <div style={flagWrapStyle}>
        <Readiness value={signals.readinessScore} />
        {signals.flags.slice(0, 2).map((flag) => <Flag key={flag.key} flag={flag} />)}
        {!signals.flags.length && <Flag flag={{ label: "No blockers", severity: "clear" }} />}
      </div>
      <div style={cardFooterStyle}>
        <span style={subLineStyle}>{signals.drawing.approvedCount}/{signals.drawing.linkedCount || 0} drawings released</span>
        <RowActions onEdit={(event) => { event.stopPropagation(); onEdit(); }} onDelete={(event) => { event.stopPropagation(); onDelete(); }} />
      </div>
    </article>
  );
}

interface CompactPackageCardProps {
  wp: EnrichedWorkPackage;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function CompactPackageCard({ wp, onOpen, onEdit, onDelete }: CompactPackageCardProps) {
  const signals = wp._signals;
  return (
    <article onClick={onOpen} style={compactCardStyle(signals.risk)}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={wpNumberStyle}>{wp.wp_number || "WP"}</span>
        <PhaseBadge phase={signals.phase} />
      </div>
      <div style={packageNameStyle}>{wp.name || "Unnamed package"}</div>
      <ProgressBar value={signals.progress} color={phaseColor(signals.phase)} height={4} sub={`${formatTons(wp.tonnage)} - ${signals.progress}%`} />
      <div style={cardFooterStyle}>
        <span style={subLineStyle}>{signals.flags[0]?.label || wp.crew || "No blockers"}</span>
        <RowActions onEdit={(event) => { event.stopPropagation(); onEdit(); }} onDelete={(event) => { event.stopPropagation(); onDelete(); }} />
      </div>
    </article>
  );
}

interface MetricCardProps {
  icon: ComponentType<{ size?: number | string; color?: string }>;
  label: string;
  value: ReactNode;
  sub: ReactNode;
  tone: string;
}

function MetricCard({ icon: Icon, label, value, sub, tone }: MetricCardProps) {
  return (
    <div style={metricCardStyle(tone)}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <span style={metricLabelStyle}>{label}</span>
        <Icon size={15} color={tone} />
      </div>
      <div style={{ ...mono, fontSize: 25, lineHeight: 1, fontWeight: 900, color: tone, marginTop: 10 }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>{sub}</div>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={filterGroupStyle}>
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
    <button type="button" onClick={onClick} style={filterButtonStyle(active, tone)}>
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

function PhaseBadge({ phase }: { phase: string }) {
  const Icon = PHASE_META[phase]?.icon || Package;
  return (
    <span style={phaseBadgeStyle(phase)}>
      <Icon size={10} />
      {PHASE_META[phase]?.short || phase || "Phase"}
    </span>
  );
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
      : "var(--status-success)";
  return <span style={flagStyle(tone)}>{flag.label}</span>;
}

interface RowActionsProps {
  onEdit?: (event: any) => void;
  onDelete?: (event: any) => void;
}

function RowActions({ onEdit, onDelete }: RowActionsProps) {
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
      body="Adjust the search, phase, status, or risk filters to bring packages back into view."
    />
  );
}
