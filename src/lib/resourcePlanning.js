import { wpBudgetHoursForResource } from "@/lib/wpHoursForResource";

export const RESOURCE_PERSONNEL_TYPES = ["Person", "Crew", "Labor", "Subcontractor"];
export const RESOURCE_EQUIPMENT_TYPES = ["Equipment", "Bay", "Material"];

export function normalizeResourceType(resource) {
  return resource?.resource_type || "Person";
}

export function isPersonnelResource(resource) {
  const type = normalizeResourceType(resource);
  return RESOURCE_PERSONNEL_TYPES.includes(type) || Boolean(resource?.parent_resource_id);
}

export function resourceAvailability(resource) {
  return resource?.availability || resource?.availability_status || "Available";
}

export function isUnavailableResource(resource) {
  return ["On Leave", "Unavailable"].includes(resourceAvailability(resource));
}

export function resourceCapacityHours(resource, effectiveCapacityById = {}) {
  const effective = effectiveCapacityById?.[resource?.id];
  const raw = effective !== undefined && !resource?.parent_resource_id
    ? effective
    : resource?.capacity;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function resourceActualHours(resource) {
  const metadata = typeof resource?.metadata === "object" && resource.metadata !== null ? resource.metadata : {};
  const parsed = Number(metadata.actual_hours ?? resource?.actual_hours);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function assignedWorkPackagesForResource(resource, resources, scheduledWorkPackages) {
  const names = new Set([String(resource?.name || "").trim()].filter(Boolean));
  for (const candidate of resources || []) {
    if (candidate.parent_resource_id === resource?.id && candidate.name) {
      names.add(String(candidate.name).trim());
    }
  }
  return (scheduledWorkPackages || []).filter((wp) => names.has(String(wp.crew || "").trim()));
}

function bookingStartDate(workPackage) {
  const raw = workPackage?.scheduled_start_date || workPackage?.released_date || workPackage?.start_date;
  if (!raw) return null;
  const parsed = new Date(`${String(raw).slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function sortByNextBooking(a, b) {
  if (a.issueRank !== b.issueRank) return b.issueRank - a.issueRank;
  if (!a.nextBookingDate && b.nextBookingDate) return 1;
  if (a.nextBookingDate && !b.nextBookingDate) return -1;
  if (a.nextBookingDate && b.nextBookingDate) return a.nextBookingDate - b.nextBookingDate;
  return String(a.resource.name || "").localeCompare(String(b.resource.name || ""));
}

export function buildResourceGuruPlanning({
  resources = [],
  workPackages = [],
  scheduledWorkPackages = [],
  effectiveCapacityById = {},
} = {}) {
  const scheduled = scheduledWorkPackages.length
    ? scheduledWorkPackages
    : workPackages.filter((wp) => (wp.scheduled_start_date || wp.released_date) && wp.scheduled_end_date);
  const unscheduled = workPackages.filter((wp) => !(wp.scheduled_start_date || wp.released_date) || !wp.scheduled_end_date || !wp.crew);

  const resourceRows = (resources || []).map((resource) => {
    const assigned = assignedWorkPackagesForResource(resource, resources, scheduled);
    const assignedHours = assigned.reduce((sum, wp) => sum + wpBudgetHoursForResource(wp), 0);
    const capacityHours = resourceCapacityHours(resource, effectiveCapacityById);
    const actualHours = resourceActualHours(resource);
    const utilizationPct = capacityHours > 0 ? Math.round((assignedHours / capacityHours) * 100) : 0;
    const actualUtilizationPct = capacityHours > 0 ? Math.round((actualHours / capacityHours) * 100) : 0;
    const remainingHours = Math.max(0, capacityHours - assignedHours);
    const status = resourceAvailability(resource);
    const nextBooking = [...assigned]
      .map((wp) => ({ wp, date: bookingStartDate(wp) }))
      .filter((item) => item.date)
      .sort((a, b) => a.date - b.date)[0] || null;
    const overAllocated = capacityHours > 0 && assignedHours > capacityHours;
    const unavailable = isUnavailableResource(resource);
    const nearCapacity = !overAllocated && capacityHours > 0 && utilizationPct >= 85;
    const flags = [
      overAllocated ? "Booking clash" : null,
      unavailable ? "Unavailable" : null,
      nearCapacity ? "Tight capacity" : null,
      assigned.length === 0 && !unavailable ? "Open" : null,
    ].filter(Boolean);
    const issueRank = overAllocated ? 4 : unavailable ? 3 : nearCapacity ? 2 : assigned.length === 0 ? 1 : 0;

    return {
      resource,
      type: normalizeResourceType(resource),
      status,
      isPersonnel: isPersonnelResource(resource),
      isEquipment: RESOURCE_EQUIPMENT_TYPES.includes(normalizeResourceType(resource)),
      capacityHours,
      actualHours,
      assignedHours,
      remainingHours,
      utilizationPct,
      actualUtilizationPct,
      assignedCount: assigned.length,
      assignedTons: assigned.reduce((sum, wp) => sum + (Number(wp.tonnage) || 0), 0),
      assignedWorkPackages: assigned,
      nextBooking: nextBooking?.wp || null,
      nextBookingDate: nextBooking?.date || null,
      overAllocated,
      unavailable,
      nearCapacity,
      flags,
      issueRank,
    };
  }).sort(sortByNextBooking);

  const rowById = new Map(resourceRows.map((row) => [row.resource.id, row]));
  const personnelRows = resourceRows.filter((row) => row.isPersonnel);
  const equipmentRows = resourceRows.filter((row) => row.isEquipment);
  const issueRows = resourceRows.filter((row) => row.overAllocated || row.unavailable || row.nearCapacity);
  const waitingList = [
    ...resourceRows
      .filter((row) => row.overAllocated)
      .map((row) => ({
        key: `resource:${row.resource.id}`,
        type: "clash",
        label: row.resource.name || "Unnamed resource",
        reason: `${row.assignedHours}h booked against ${row.capacityHours}h capacity`,
        resourceId: row.resource.id,
      })),
    ...unscheduled.map((wp) => ({
      key: `wp:${wp.id || wp.wp_number || wp.name}`,
      type: "unassigned",
      label: wp.wp_number ? `${wp.wp_number} - ${wp.name || "Work package"}` : wp.name || "Work package",
      reason: !wp.crew ? "No assigned person, crew, or resource" : "Missing schedule window",
      workPackageId: wp.id,
    })),
  ];

  const totalCapacityHours = resourceRows.reduce((sum, row) => sum + row.capacityHours, 0);
  const totalAssignedHours = resourceRows.reduce((sum, row) => sum + row.assignedHours, 0);

  return {
    resourceRows,
    rowById,
    personnelRows,
    equipmentRows,
    issueRows,
    waitingList,
    personnelCount: personnelRows.length,
    equipmentCount: equipmentRows.length,
    onLeaveCount: resourceRows.filter((row) => row.unavailable).length,
    clashCount: resourceRows.filter((row) => row.overAllocated).length,
    nearCapacityCount: resourceRows.filter((row) => row.nearCapacity).length,
    openCapacityHours: resourceRows.reduce((sum, row) => sum + row.remainingHours, 0),
    totalCapacityHours,
    totalAssignedHours,
    utilizationPct: totalCapacityHours > 0 ? Math.round((totalAssignedHours / totalCapacityHours) * 100) : 0,
  };
}
