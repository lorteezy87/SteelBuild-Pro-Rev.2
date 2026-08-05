/**
 * Pure form ↔ entity mapping for ResourceFormModal.
 */
export function fromEntity(e: any) {
  const meta = typeof e.metadata === "object" && e.metadata !== null ? e.metadata : {};
  return {
    project_id: e.project_id || "",
    name: e.name || "",
    resource_type: e.resource_type || "Person",
    role: e.role || "",
    budget_hours: e.capacity ?? "",
    actual_hours: meta.actual_hours ?? "0",
    forecast_hours: meta.forecast_hours ?? "",
    hourly_rate: e.cost_rate ?? "",
    availability_status: e.availability || "Available",
    notes: e.notes || "",
    parent_resource_id: e.parent_resource_id || "",
  };
}

export function toEntity(form: any, projectId: string) {
  return {
    project_id: form.project_id || projectId,
    name: form.name,
    resource_type: form.resource_type,
    role: form.role,
    capacity: form.budget_hours ? parseFloat(form.budget_hours) : 0,
    unit: "hours",
    cost_rate: form.hourly_rate ? parseFloat(form.hourly_rate) : 0,
    availability: form.availability_status || "Available",
    notes: form.notes,
    parent_resource_id: form.parent_resource_id || null,
    metadata: {
      actual_hours: parseFloat(form.actual_hours) || 0,
      forecast_hours: form.forecast_hours ? parseFloat(form.forecast_hours) : 0,
    },
  };
}
