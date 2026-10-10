import { localToday } from "@/utils/dates";

interface ReusableDailyLogDefaults {
  crew_name?: string | null;
  headcount?: number | string | null;
  superintendent?: string | null;
  equipment_used?: string | null;
}

/** A new day's draft. Copy only crew/equipment defaults, never yesterday's evidence or identity. */
export function createDailyLogDraft(
  projectId: string | null | undefined,
  previous?: ReusableDailyLogDefaults | null,
) {
  return {
    project_id: projectId,
    date: localToday(),
    superintendent: previous?.superintendent || "",
    crew_name: previous?.crew_name || "",
    headcount: previous?.headcount ?? "",
    hours_worked: "",
    weather_description: "",
    temperature: "",
    wind_speed: "",
    activities: "",
    equipment_used: previous?.equipment_used || "",
    materials_received: "",
    delays: "",
    delay_hours: "",
    safety_incidents: 0,
    safety_notes: "",
    photos: [] as string[],
    related_action_item_ids: [] as string[],
    related_rfi_ids: [] as string[],
    delivery_ids: [] as string[],
    metadata: {} as Record<string, unknown>,
  };
}
