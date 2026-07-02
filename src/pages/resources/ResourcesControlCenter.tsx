/**
 * ResourcesControlCenter — Command UI redesign of the Resources hub.
 * Gated behind the `command_ui` feature flag; enabled in ResourceHub.jsx.
 *
 * Owns its own data fetch (the ResourceHub shell does not load resource data).
 * Mirrors the pattern of RfiControlCenter: loads data → buildResourcesSummary →
 * renders PageHero / KpiStrip / DecisionPanel / FilterBar / DataTable.
 *
 * Real data sources:
 *  - entities.Resource.filter({ project_id }) → resources table
 *  - entities.WorkPackage.filter({ project_id }) → work_packages.crew cross-ref
 *
 * No resource_assignments table exists. Utilization is derived from
 * resources.availability (the real status field). Over-Allocated resources are
 * the authoritative conflict signal.
 */
import { useMemo, useState } from "react";
import { Users, AlertTriangle, Gauge, Wrench, HardHat } from "lucide-react";
import "@/styles/command.css";
import {
  PageHero,
  KpiStrip,
  DecisionPanel,
  Pill,
  FilterBar,
  DataTable,
  useCommandSkin,
} from "@/components/command";
import type { Column, KpiCellDef, KpiTone } from "@/components/command";
import { photoFor } from "@/config/launcherConfig";
import { useQuery } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { useProjectId } from "@/hooks/useProjectId";
import {
  buildResourcesSummary,
  getAvailability,
  type ResourceRecord,
} from "./resourcesControlCenter.derive";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_FILTERS = ["All", "Person", "Crew", "Labor", "Equipment", "Bay", "Subcontractor", "Material"];

function availabilityTone(av: string): KpiTone {
  if (av === "Over-Allocated") return "danger";
  if (av === "Allocated" || av === "Committed") return "warn";
  if (av === "Available") return "good";
  if (av === "Partially Available") return "info";
  return "neutral";
}

/** Small inline utilization bar — no SVG ring needed, simpler to maintain. */
function UtilBar({ pct, tone }: { pct: number; tone: KpiTone }) {
  const colors: Record<KpiTone, string> = {
    good: "#22c55e",
    warn: "#f59e0b",
    danger: "#ef4444",
    neutral: "#6b7280",
    info: "#3b82f6",
  };
  const color = colors[tone] ?? colors.neutral;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <div
        style={{
          flex: 1,
          height: 6,
          borderRadius: 3,
          background: "rgba(255,255,255,0.1)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.max(0, Math.min(100, pct))}%`,
            background: color,
            borderRadius: 3,
            transition: "width 0.4s ease",
          }}
        />
      </div>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color,
          minWidth: 34,
          textAlign: "right",
        }}
      >
        {pct}%
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface ResourcesControlCenterProps {
  /** Optional project name for the hero. Falls back to "Project" if not provided. */
  projectName?: string | null;
  /** If provided, opens the resource form. */
  onAddResource?: (() => void) | null;
}

export default function ResourcesControlCenter({
  projectName,
  onAddResource,
}: ResourcesControlCenterProps) {
  useCommandSkin();
  const projectId = useProjectId();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");

  // Load resource data directly (shell doesn't fetch it).
  const { data: resources = [] } = useQuery({
    queryKey: ["resources", projectId],
    queryFn: () =>
      projectId
        ? entities.Resource.filter({ project_id: projectId })
        : entities.Resource.list(),
  }) as { data: ResourceRecord[] };

  // Cross-ref work packages for crew assignment lookup.
  const { data: workPackages = [] } = useQuery({
    queryKey: ["work-packages", projectId],
    queryFn: () =>
      projectId
        ? entities.WorkPackage.filter({ project_id: projectId })
        : entities.WorkPackage.list(),
    staleTime: 2 * 60 * 1000,
  });

  const s = useMemo(() => buildResourcesSummary(resources, workPackages), [resources, workPackages]);

  // Filtered rows for the DataTable.
  const filtered = useMemo(() => {
    const lc = search.toLowerCase();
    return resources.filter((r) => {
      const typeMatch = typeFilter === "All" || r.resource_type === typeFilter;
      const searchMatch =
        !lc ||
        (r.name || "").toLowerCase().includes(lc) ||
        (r.role || "").toLowerCase().includes(lc) ||
        (r.resource_type || "").toLowerCase().includes(lc);
      return typeMatch && searchMatch;
    });
  }, [resources, search, typeFilter]);

  // Hero chips
  const chips = [
    { label: `${s.totalResources} Total` },
    { label: `${s.laborPool} Labor`, tone: "good" as const },
    { label: `${s.overAllocated} Over-Allocated` },
  ];

  // KPI strip — all from real fields
  const kpiCells: KpiCellDef[] = [
    {
      label: "Total Resources",
      value: s.totalResources,
      sublabel: "in project",
      tone: "neutral",
      Icon: Users,
    },
    {
      label: "Labor Pool",
      value: s.laborPool,
      sublabel: "people / crews / labor",
      tone: "good",
      Icon: HardHat,
    },
    {
      label: "Equipment",
      value: s.equipmentCount,
      sublabel: "equipment / bays",
      tone: "neutral",
      Icon: Wrench,
    },
    {
      label: "Utilization",
      value: `${s.utilizationPct}%`,
      sublabel: "allocated / committed",
      tone: s.utilizationTone,
      Icon: Gauge,
    },
    {
      label: "Over-Allocated",
      value: s.overAllocated,
      sublabel: "needs rebalance",
      tone: s.overAllocTone,
      Icon: AlertTriangle,
    },
  ];

  // DataTable columns — all from real DB fields
  const columns: Column<ResourceRecord>[] = [
    {
      key: "name",
      header: "Resource",
      render: (r) => (
        <span style={{ fontWeight: 600 }}>{r.name || "Unnamed"}</span>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (r) => (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {r.resource_type || "—"}
        </span>
      ),
    },
    {
      key: "role",
      header: "Role / Trade",
      render: (r) => r.role || <span className="cmd-row__meta">—</span>,
    },
    {
      key: "availability",
      header: "Status",
      render: (r) => {
        const av = getAvailability(r);
        return <Pill tone={availabilityTone(av)}>{av}</Pill>;
      },
    },
    {
      key: "capacity",
      header: "Capacity",
      align: "right",
      render: (r) =>
        r.capacity != null ? (
          <span className="cmd-row__num">
            {r.capacity}
            {r.unit ? ` ${r.unit}` : "h"}
          </span>
        ) : (
          <span className="cmd-row__meta">—</span>
        ),
    },
    {
      key: "cost_rate",
      header: "Rate",
      align: "right",
      render: (r) =>
        r.cost_rate != null ? (
          <span className="cmd-row__num">${r.cost_rate}/hr</span>
        ) : (
          <span className="cmd-row__meta">—</span>
        ),
    },
  ];

  return (
    <div className="resources-cc">
      <PageHero
        Icon={Users}
        title="Resources"
        subtitle="Manage crews, equipment, and material resources across project activities."
        projectName={projectName || undefined}
        chips={chips}
        photoSrc={photoFor("ResourceHub") ?? undefined}
      />

      <KpiStrip cells={kpiCells} />

      <div className="cmd-panels">
        {/* Panel 1: Labor by Trade */}
        <DecisionPanel title="Labor by Trade">
          {s.laborByTrade.length === 0 ? (
            <div className="cmd-row__meta">No labor resources yet.</div>
          ) : (
            s.laborByTrade.map((row) => (
              <div className="cmd-row" key={row.trade}>
                <div style={{ flex: 1 }}>
                  <div className="cmd-row__num">{row.trade}</div>
                  <div className="cmd-row__meta">
                    {row.count} total · {row.available} available
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <UtilBar
                      pct={row.utilizationPct}
                      tone={
                        row.utilizationPct >= 90
                          ? "danger"
                          : row.utilizationPct >= 70
                          ? "warn"
                          : "good"
                      }
                    />
                  </div>
                </div>
              </div>
            ))
          )}
        </DecisionPanel>

        {/* Panel 2: Equipment Status */}
        <DecisionPanel title="Equipment Status">
          {s.equipmentStatus.length === 0 ? (
            <div className="cmd-row__meta">No equipment or bays yet.</div>
          ) : (
            s.equipmentStatus.map((eq) => (
              <div className="cmd-row" key={eq.id}>
                <div>
                  <div className="cmd-row__num">{eq.name}</div>
                  <div className="cmd-row__meta">
                    {eq.type}
                    {eq.assignedTo ? ` · ${eq.assignedTo}` : ""}
                  </div>
                </div>
                <Pill tone={availabilityTone(eq.availability)}>{eq.availability}</Pill>
              </div>
            ))
          )}
        </DecisionPanel>

        {/* Panel 3: Resource Conflicts (Over-Allocated) */}
        <DecisionPanel title="Resource Conflicts">
          {s.conflicts.length === 0 ? (
            <div className="cmd-row__meta">No over-allocated resources.</div>
          ) : (
            s.conflicts.map((c) => (
              <div className="cmd-row" key={c.id}>
                <div>
                  <div className="cmd-row__num">{c.name}</div>
                  <div className="cmd-row__meta">
                    {c.type}
                    {c.assignedTo ? ` · assigned to ${c.assignedTo}` : ""}
                  </div>
                </div>
                <Pill tone="danger">Over-Allocated</Pill>
              </div>
            ))
          )}
        </DecisionPanel>
      </div>

      <FilterBar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search name, role, or type"
        primaryLabel="New Resource"
        onPrimary={onAddResource ?? null}
        filters={
          <>
            {TYPE_FILTERS.map((t) => (
              <button
                key={t}
                type="button"
                className={`cmd-chip-btn${typeFilter === t ? " is-active" : ""}`}
                onClick={() => setTypeFilter(t)}
              >
                {t}
              </button>
            ))}
          </>
        }
      />

      <DataTable
        columns={columns}
        rows={filtered}
        emptyMessage="No resources match your filters."
      />
    </div>
  );
}
