import type { ComponentType, CSSProperties, PropsWithChildren } from "react";
import { CheckCircle2, Filter, MapPin, Truck, Warehouse, Weight } from "lucide-react";
import { StatusPill, Button as ButtonRaw, ProgressBar as ProgressBarRaw } from "@/components/design-system";
import { getDeliveryDisplayName } from "./analytics";
import {
  LANE_ORDER,
  STATUS_COLOR,
  display,
  formatDate,
  formatPieces,
  formatTons,
  mergeDeliveryLists,
  mono,
  num,
  riskColor,
} from "./format";
import type { DeliveryMetrics, DeliveryRecord, FilterOption, ProjectMap, WorkPackageMap } from "./types";

// The design-system primitives are still .jsx, so TS infers `any`/unknown for
// their props. These casts are removable once design-system is typed.
type AnyProps = PropsWithChildren<Record<string, unknown>>;
const Button = ButtonRaw as unknown as ComponentType<AnyProps>;
const ProgressBar = ProgressBarRaw as unknown as ComponentType<AnyProps>;

type OpenHandler = (delivery: DeliveryRecord) => void;
type StatusHandler = (delivery: DeliveryRecord, status: string) => void;

interface HeroMetricProps {
  label: string;
  value: number | string;
  sub: string;
  color: string;
  icon: ComponentType<{ size?: number | string }>;
}

export function HeroMetric({ label, value, sub, color, icon: Icon }: HeroMetricProps) {
  return (
    <div className="delivery-hero-metric" style={{ "--metric-color": color } as CSSProperties}>
      <div className="delivery-hero-icon">
        <Icon size={17} />
      </div>
      <div className="delivery-metric-label">{label}</div>
      <div className="delivery-metric-value" style={mono}>{value}</div>
      <div className="delivery-metric-sub">{sub}</div>
    </div>
  );
}

interface ReceivingQuickPanelProps {
  metrics: DeliveryMetrics;
  projectMap: ProjectMap;
  workPackageMap: WorkPackageMap;
  onOpen: OpenHandler;
  onExit: () => void;
  onFilter: (filter: string) => void;
  onScheduleLoad: () => void;
}

export function ReceivingQuickPanel({
  metrics,
  projectMap,
  workPackageMap,
  onOpen,
  onExit,
  onFilter,
  onScheduleLoad,
}: ReceivingQuickPanelProps) {
  const focusLoads = mergeDeliveryLists(metrics.overdue, metrics.dueToday, metrics.readyToReceive).slice(0, 6);
  return (
    <section className="delivery-receive-panel" aria-label="Delivery receiving quick workflow">
      <div className="delivery-receive-copy">
        <div className="delivery-section-label">Field Receiving</div>
        <h2 style={display}>Confirm trucks without hunting through the register.</h2>
        <p>
          Review late, due-today, and ready-to-receive loads. Opening a load keeps the human approval step in the
          detail drawer before any status change is written.
        </p>
      </div>

      <div className="delivery-receive-actions">
        <button type="button" onClick={() => onFilter("late")}>
          <span>Late</span>
          <strong>{metrics.overdue.length}</strong>
        </button>
        <button type="button" onClick={() => onFilter("today")}>
          <span>Due Today</span>
          <strong>{metrics.dueToday.length}</strong>
        </button>
        <button type="button" onClick={() => onFilter("ready")}>
          <span>Ready</span>
          <strong>{metrics.readyToReceive.length}</strong>
        </button>
        <button type="button" onClick={onScheduleLoad}>
          <span>New</span>
          <strong>+</strong>
        </button>
      </div>

      <div className="delivery-receive-list">
        {focusLoads.length > 0 ? (
          focusLoads.map((delivery, index) => {
            const wp = workPackageMap[delivery.work_package_id as string];
            return (
              <button key={delivery.id || `${delivery.po_number}-${delivery.description}-${index}`} type="button" onClick={() => onOpen(delivery)}>
                <div>
                  <strong>{getDeliveryDisplayName(delivery, wp)}</strong>
                  <span>{delivery.vendor || "Vendor TBD"} - {projectMap[delivery.project_id as string] || delivery.project_name || "Project TBD"}</span>
                </div>
                <StatusPill label={delivery._signals.status} color={STATUS_COLOR[delivery._signals.status]} size="xs" />
              </button>
            );
          })
        ) : (
          <div className="delivery-receive-empty">No late, due-today, or ready loads in the current project.</div>
        )}
      </div>

      <button type="button" className="delivery-receive-exit" onClick={onExit}>
        Exit receiving mode
      </button>
    </section>
  );
}

interface FilterSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
}

export function FilterSelect({ value, onChange, options }: FilterSelectProps) {
  return (
    <div className="delivery-filter-select">
      <Filter size={13} />
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

interface ExceptionRailProps {
  metrics: DeliveryMetrics;
  projectMap: ProjectMap;
  workPackageMap: WorkPackageMap;
  onOpen: OpenHandler;
  onFilterLate: () => void;
}

export function ExceptionRail({ metrics, projectMap, workPackageMap, onOpen, onFilterLate }: ExceptionRailProps) {
  const watchList = metrics.exceptions.slice(0, 8);
  return (
    <aside className="delivery-rail">
      <div className="delivery-rail-header">
        <div>
          <div className="delivery-section-label">Exceptions</div>
          <div className="delivery-muted">Late, blocked, partial, rejected, or missing logistics.</div>
        </div>
        <button type="button" onClick={onFilterLate}>
          Late
        </button>
      </div>

      <div className="delivery-rail-kpis">
        <MiniStat label="Late" value={metrics.overdue.length} color="var(--status-error)" />
        <MiniStat label="7 Days" value={metrics.dueNext7.length} color="var(--status-warning)" />
        <MiniStat label="Long Lead" value={metrics.longLeadOpen.length} color="var(--accent)" />
      </div>

      <div className="delivery-watch-list">
        {watchList.length > 0 ? (
          watchList.map((delivery) => {
            const wp = workPackageMap[delivery.work_package_id as string];
            return (
              <button key={delivery.id} type="button" className="delivery-watch-card" onClick={() => onOpen(delivery)}>
                <div className="delivery-watch-top">
                  <StatusPill label={delivery._signals.risk === "high" ? "Exception" : "Warning"} color={riskColor(delivery._signals.risk)} size="xs" />
                  <span>{formatDate(delivery.scheduled_date)}</span>
                </div>
                <strong>{getDeliveryDisplayName(delivery, wp)}</strong>
                <small>
                  {delivery.vendor || "No vendor"} - {projectMap[delivery.project_id as string] || "Project TBD"}
                </small>
                <div className="delivery-flag-row">
                  {delivery._signals.flags.slice(0, 3).map((flag) => (
                    <span key={flag.key}>{flag.label}</span>
                  ))}
                </div>
              </button>
            );
          })
        ) : (
          <div className="delivery-rail-empty">
            <CheckCircle2 size={18} />
            No delivery exceptions in the current filter set.
          </div>
        )}
      </div>
    </aside>
  );
}

interface MiniStatProps {
  label: string;
  value: number | string;
  color: string;
}

export function MiniStat({ label, value, color }: MiniStatProps) {
  return (
    <div className="delivery-mini-stat">
      <span>{label}</span>
      <strong style={{ color }}>{value}</strong>
    </div>
  );
}

interface DispatchBoardProps {
  laneGroups: Record<string, DeliveryRecord[]>;
  projectMap: ProjectMap;
  workPackageMap: WorkPackageMap;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onOpen: OpenHandler;
  onSetStatus: StatusHandler;
}

export function DispatchBoard({ laneGroups, projectMap, workPackageMap, selectedIds, onToggle, onOpen, onSetStatus }: DispatchBoardProps) {
  return (
    <div className="delivery-lane-scroll">
      <div className="delivery-lanes">
        {LANE_ORDER.map((lane) => {
          const items = laneGroups[lane] || [];
          const tons = items.reduce((sum, delivery) => sum + num(delivery.weight_tons), 0);
          return (
            <section key={lane} className="delivery-lane" style={{ "--lane-color": STATUS_COLOR[lane] || "var(--accent)" } as CSSProperties}>
              <div className="delivery-lane-head">
                <div>
                  <div className="delivery-lane-title">{lane}</div>
                  <span>{items.length} loads - {formatTons(tons)}</span>
                </div>
              </div>
              <div className="delivery-lane-body">
                {items.slice(0, 24).map((delivery) => (
                  <DeliveryLoadCard
                    key={delivery.id}
                    delivery={delivery}
                    projectMap={projectMap}
                    workPackageMap={workPackageMap}
                    selected={selectedIds.has(delivery.id as string)}
                    onToggle={() => onToggle(delivery.id as string)}
                    onOpen={() => onOpen(delivery)}
                    onSetStatus={onSetStatus}
                  />
                ))}
                {items.length === 0 && <div className="delivery-lane-empty">No loads</div>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

interface DeliveryLoadCardProps {
  delivery: DeliveryRecord;
  projectMap: ProjectMap;
  workPackageMap: WorkPackageMap;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onSetStatus: StatusHandler;
}

export function DeliveryLoadCard({ delivery, projectMap, workPackageMap, selected, onToggle, onOpen, onSetStatus }: DeliveryLoadCardProps) {
  const wp = workPackageMap[delivery.work_package_id as string];
  const title = getDeliveryDisplayName(delivery, wp);
  const flags = delivery._signals.flags;
  return (
    <article className={`delivery-load-card ${selected ? "is-selected" : ""}`} onClick={onOpen}>
      <div className="delivery-card-top">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          onClick={(event) => event.stopPropagation()}
          aria-label={`Select ${title}`}
        />
        <StatusPill label={delivery._signals.status} color={STATUS_COLOR[delivery._signals.status]} size="xs" />
        <span className="delivery-card-date">{formatDate(delivery.scheduled_date)}</span>
      </div>
      <h3>{title}</h3>
      <div className="delivery-card-meta">
        <span>{delivery.vendor || "Vendor TBD"}</span>
        <span>{delivery.po_number || delivery.load_number || "PO TBD"}</span>
      </div>
      <div className="delivery-card-grid">
        <MetaMini icon={Weight} label="Tons" value={formatTons(delivery.weight_tons)} />
        <MetaMini icon={Warehouse} label="Pieces" value={formatPieces(delivery.pieces)} />
        <MetaMini icon={Truck} label="Carrier" value={(delivery.carrier as string) || (delivery.tracking_number as string) || "TBD"} />
        <MetaMini icon={MapPin} label="Receive" value={(delivery.receiving_location as string) || "TBD"} />
      </div>
      <ProgressBar
        value={delivery._signals.readinessScore}
        color={riskColor(delivery._signals.risk)}
        height={4}
        sub={`${delivery._signals.readinessScore}% receiving readiness`}
      />
      {flags.length > 0 && (
        <div className="delivery-flag-row">
          {flags.slice(0, 3).map((flag) => (
            <span key={flag.key}>{flag.label}</span>
          ))}
        </div>
      )}
      <div className="delivery-card-actions" onClick={(event) => event.stopPropagation()}>
        {delivery._signals.status === "Scheduled" && (
          <button type="button" onClick={() => onSetStatus(delivery, "In Transit")}>
            Start Transit
          </button>
        )}
        {delivery._signals.status !== "Delivered" && (
          <button type="button" onClick={() => onSetStatus(delivery, "Delivered")}>
            Delivered
          </button>
        )}
      </div>
      <div className="delivery-card-project">{projectMap[delivery.project_id as string] || delivery.project_name || "Project TBD"}</div>
    </article>
  );
}

interface MetaMiniProps {
  icon: ComponentType<{ size?: number | string }>;
  label: string;
  value: string;
}

export function MetaMini({ icon: Icon, label, value }: MetaMiniProps) {
  return (
    <div className="delivery-meta-mini">
      <Icon size={12} />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

interface ScheduleViewProps {
  metrics: DeliveryMetrics;
  filtered: DeliveryRecord[];
  projectMap: ProjectMap;
  workPackageMap: WorkPackageMap;
  onOpen: OpenHandler;
}

export function ScheduleView({ metrics, filtered, projectMap, workPackageMap, onOpen }: ScheduleViewProps) {
  return (
    <div className="delivery-schedule">
      <div className="delivery-calendar">
        {metrics.calendarDays.map((day) => (
          <section key={day.iso} className="delivery-day">
            <div className="delivery-day-head">
              <strong>{day.label}</strong>
              <span>{day.items.length} loads - {formatTons(day.tons)}</span>
            </div>
            <div className="delivery-day-list">
              {day.items.length > 0 ? (
                day.items.map((delivery) => {
                  const wp = workPackageMap[delivery.work_package_id as string];
                  return (
                    <button key={delivery.id} type="button" onClick={() => onOpen(delivery)}>
                      <span style={{ background: STATUS_COLOR[delivery._signals.status] || "var(--accent)" }} />
                      <strong>{getDeliveryDisplayName(delivery, wp)}</strong>
                      <small>{delivery.vendor || "Vendor TBD"} - {formatTons(delivery.weight_tons)}</small>
                    </button>
                  );
                })
              ) : (
                <div className="delivery-day-empty">No scheduled loads</div>
              )}
            </div>
          </section>
        ))}
      </div>

      <aside className="delivery-next-loads">
        <div className="delivery-section-label">Next Up</div>
        <div className="delivery-muted">Sorted by exception risk, then scheduled date.</div>
        {(metrics.nextLoads.length ? metrics.nextLoads : filtered.slice(0, 8)).map((delivery) => {
          const wp = workPackageMap[delivery.work_package_id as string];
          return (
            <button key={delivery.id} type="button" onClick={() => onOpen(delivery)}>
              <div>
                <strong>{getDeliveryDisplayName(delivery, wp)}</strong>
                <span>{projectMap[delivery.project_id as string] || delivery.project_name || "Project TBD"}</span>
              </div>
              <StatusPill label={delivery._signals.status} color={STATUS_COLOR[delivery._signals.status]} size="xs" />
            </button>
          );
        })}
      </aside>
    </div>
  );
}

interface RegisterViewProps {
  deliveries: DeliveryRecord[];
  projectMap: ProjectMap;
  workPackageMap: WorkPackageMap;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  onOpen: OpenHandler;
  onEdit: (delivery: DeliveryRecord) => void;
  allSelected: boolean;
}

export function RegisterView({
  deliveries,
  projectMap,
  workPackageMap,
  selectedIds,
  onToggle,
  onToggleAll,
  onOpen,
  onEdit,
  allSelected,
}: RegisterViewProps) {
  return (
    <div className="delivery-register-wrap">
      <table className="delivery-register">
        <thead>
          <tr>
            <th>
              <input type="checkbox" checked={allSelected} onChange={(event) => onToggleAll(event.target.checked)} />
            </th>
            <th>Load</th>
            <th>Vendor</th>
            <th>Schedule</th>
            <th>Material</th>
            <th>Carrier</th>
            <th>Receiving</th>
            <th>Status</th>
            <th>Risk</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {deliveries.map((delivery) => {
            const wp = workPackageMap[delivery.work_package_id as string];
            return (
              <tr key={delivery.id} className={selectedIds.has(delivery.id as string) ? "is-selected" : ""} onClick={() => onOpen(delivery)}>
                <td onClick={(event) => event.stopPropagation()}>
                  <input type="checkbox" checked={selectedIds.has(delivery.id as string)} onChange={() => onToggle(delivery.id as string)} />
                </td>
                <td>
                  <strong>{getDeliveryDisplayName(delivery, wp)}</strong>
                  <span>{wp?.wp_number || wp?.name || projectMap[delivery.project_id as string] || "No work package"}</span>
                </td>
                <td>
                  <strong>{delivery.vendor || "Vendor TBD"}</strong>
                  <span>{delivery.po_number || delivery.procurement_category || "PO TBD"}</span>
                </td>
                <td>
                  <strong>{formatDate(delivery.scheduled_date)}</strong>
                  <span>Need {formatDate(delivery.required_date)}</span>
                </td>
                <td>
                  <strong>{formatTons(delivery.weight_tons)}</strong>
                  <span>{formatPieces(delivery.pieces)} pcs</span>
                </td>
                <td>
                  <strong>{delivery.carrier || "Carrier TBD"}</strong>
                  <span>{delivery.tracking_number || delivery.truck_number || "Tracking TBD"}</span>
                </td>
                <td>
                  <strong>{delivery.receiving_location || "Location TBD"}</strong>
                  <span>{delivery.received_by || "Receiver TBD"}</span>
                </td>
                <td><StatusPill label={delivery._signals.status} color={STATUS_COLOR[delivery._signals.status]} size="xs" /></td>
                <td><StatusPill label={delivery._signals.risk} color={riskColor(delivery._signals.risk)} size="xs" /></td>
                <td onClick={(event) => event.stopPropagation()}>
                  <button type="button" onClick={() => onEdit(delivery)}>Edit</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface DeliveryDetailModalProps {
  delivery: DeliveryRecord | null;
  projectMap: ProjectMap;
  workPackageMap: WorkPackageMap;
  onClose: () => void;
  onEdit: ((delivery: DeliveryRecord) => void) | null;
  onDelete: ((delivery: DeliveryRecord) => void) | null;
  onSetStatus: StatusHandler;
}

export function DeliveryDetailModal({ delivery, projectMap, workPackageMap, onClose, onEdit, onDelete, onSetStatus }: DeliveryDetailModalProps) {
  if (!delivery) return null;
  const wp = workPackageMap[delivery.work_package_id as string];
  const title = getDeliveryDisplayName(delivery, wp);
  return (
    <div className="delivery-detail-backdrop" onClick={onClose}>
      <aside className="delivery-detail" onClick={(event) => event.stopPropagation()}>
        <div className="delivery-detail-head">
          <div>
            <div className="delivery-kicker">
              <Truck size={13} />
              {delivery.load_number || delivery.delivery_number || delivery.po_number || "Delivery"}
            </div>
            <h2 style={display}>{title}</h2>
            <p>{projectMap[delivery.project_id as string] || delivery.project_name || "Project TBD"}</p>
          </div>
          <button type="button" onClick={onClose}>Close</button>
        </div>

        <div className="delivery-detail-status">
          <StatusPill label={delivery._signals.status} color={STATUS_COLOR[delivery._signals.status]} />
          <StatusPill label={`${delivery._signals.readinessScore}% Ready`} color={riskColor(delivery._signals.risk)} />
          {delivery.inspection_required && <StatusPill label="Inspection" color="var(--status-warning)" />}
          {delivery.is_long_lead && <StatusPill label="Long Lead" color="var(--accent)" />}
        </div>

        {delivery._signals.flags.length > 0 && (
          <div className="delivery-detail-flags">
            {delivery._signals.flags.map((flag) => (
              <span key={flag.key}>{flag.label}</span>
            ))}
          </div>
        )}

        <div className="delivery-detail-grid">
          <DetailCell label="Vendor" value={delivery.vendor as string} />
          <DetailCell label="PO / Load" value={(delivery.po_number as string) || (delivery.load_number as string)} />
          <DetailCell label="Work Package" value={(wp?.wp_number as string) || (wp?.name as string)} />
          <DetailCell label="Scheduled" value={formatDate(delivery.scheduled_date)} />
          <DetailCell label="Required" value={formatDate(delivery.required_date)} />
          <DetailCell label="Actual" value={formatDate(delivery.actual_date, "Not received")} />
          <DetailCell label="Pieces" value={formatPieces(delivery.pieces)} />
          <DetailCell label="Weight" value={formatTons(delivery.weight_tons)} />
          <DetailCell label="Carrier" value={delivery.carrier as string} />
          <DetailCell label="Tracking" value={(delivery.tracking_number as string) || (delivery.truck_number as string)} />
          <DetailCell label="Receiving" value={delivery.receiving_location as string} />
          <DetailCell label="Received By" value={delivery.received_by as string} />
        </div>

        {(delivery.notes || delivery.special_instructions || delivery.shipping_ticket_name) && (
          <div className="delivery-detail-notes">
            {delivery.special_instructions && (
              <div>
                <strong>Special Instructions</strong>
                <p>{delivery.special_instructions}</p>
              </div>
            )}
            {delivery.notes && (
              <div>
                <strong>Notes</strong>
                <p>{delivery.notes}</p>
              </div>
            )}
            {delivery.shipping_ticket_name && (
              <div>
                <strong>Shipping Ticket</strong>
                <p>{delivery.shipping_ticket_name}</p>
              </div>
            )}
          </div>
        )}

        <div className="delivery-detail-actions">
          {delivery._signals.status !== "In Transit" && delivery._signals.status !== "Delivered" && (
            <Button variant="secondary" icon="arrow" onClick={() => onSetStatus(delivery, "In Transit")}>
              In Transit
            </Button>
          )}
          {delivery._signals.status !== "Delivered" && (
            <Button variant="primary" icon="check" onClick={() => onSetStatus(delivery, "Delivered")}>
              Mark Delivered
            </Button>
          )}
          <Button variant="secondary" onClick={() => onSetStatus(delivery, "Partial")}>
            Partial
          </Button>
          <Button variant="secondary" onClick={() => onEdit?.(delivery)}>
            Edit
          </Button>
          <Button variant="danger" icon="x" onClick={() => onDelete?.(delivery)}>
            Delete
          </Button>
        </div>
      </aside>
    </div>
  );
}

interface DetailCellProps {
  label: string;
  value?: string;
}

export function DetailCell({ label, value }: DetailCellProps) {
  return (
    <div className="delivery-detail-cell">
      <span>{label}</span>
      <strong>{value || "TBD"}</strong>
    </div>
  );
}
