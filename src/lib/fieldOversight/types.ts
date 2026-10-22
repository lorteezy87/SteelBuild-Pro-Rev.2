/**
 * fieldOversight — the erector's pre-mobilization and standby records.
 *
 * Three questions an erection PM answers every day, and the narrow record
 * shapes this module reads to answer them:
 *
 *   1. Is the site ready for the crew and crane?   → site readiness (action_items)
 *   2. What did standing by cost us, and is it noticed? → delay log (change_requests)
 *   3. Did the crew file a daily for every field day?  → daily_logs
 *
 * No new tables: readiness rides `action_items` (category SITE_READINESS,
 * checklist in metadata) and delays ride `change_requests` (reason
 * "Delay / standby", cost inputs in metadata), so both inherit the existing
 * RLS, audit trigger and the CR → CO conversion path.
 *
 * Every reader here treats a NULL as unknown, never as "no" or zero
 * (CLAUDE.md, "Absence is not evidence").
 */
import type { Json } from "@/types/supabase";

export type IsoDate = string;

/** The subset of an `action_items` row this module reads. */
export interface ActionItemLike {
  id: string;
  project_id?: string | null;
  title?: string | null;
  description?: string | null;
  category?: string | null;
  status?: string | null;
  due_date?: string | null;
  assigned_to?: string | null;
  source_entity_type?: string | null;
  source_entity_id?: string | null;
  metadata?: Json | null;
  is_deleted?: boolean | null;
}

/** The subset of a `change_requests` row this module reads. */
export interface ChangeRequestLike {
  id: string;
  project_id?: string | null;
  cr_number?: string | null;
  title?: string | null;
  description?: string | null;
  reason?: string | null;
  status?: string | null;
  request_date?: string | null;
  requested_by?: string | null;
  estimated_cost_impact?: number | null;
  estimated_schedule_impact_days?: number | null;
  change_order_id?: string | null;
  metadata?: Json | null;
  is_deleted?: boolean | null;
}

/** The subset of a `schedule_tasks` row this module reads. */
export interface ScheduleTaskLike {
  id: string;
  task_name?: string | null;
  phase?: string | null;
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  crew_name?: string | null;
  resource_names?: string | null;
  assigned_to?: string | null;
  is_summary?: boolean | null;
  is_deleted?: boolean | null;
}

/** The subset of a `deliveries` row this module reads. */
export interface DeliveryLike {
  id: string;
  delivery_number?: string | null;
  delivery_title?: string | null;
  status?: string | null;
  scheduled_date?: string | null;
  vendor?: string | null;
  weight_tons?: number | null;
  is_deleted?: boolean | null;
}

/** The subset of a `daily_logs` row this module reads. */
export interface DailyLogLike {
  id: string;
  project_id?: string | null;
  date?: string | null;
  crew_name?: string | null;
  superintendent?: string | null;
  headcount?: number | null;
  hours_worked?: number | null;
  activities?: string | null;
  delays?: string | null;
  delay_hours?: number | null;
  weather_description?: string | null;
  temperature?: string | null;
  wind_speed?: string | null;
  equipment_used?: string | null;
  materials_received?: string | null;
  safety_notes?: string | null;
  safety_incidents?: number | null;
  toolbox_talk_completed?: boolean | null;
  is_deleted?: boolean | null;
}

/** `getWeatherRiskForProject` output row (src/lib/weatherRisk.js). */
export interface WeatherRiskLike {
  date: string;
  severity: number;
  summary?: string | null;
}

/** The subset of a project row used on outward-facing text. */
export interface ProjectLike {
  id?: string | null;
  name?: string | null;
  project_number?: string | null;
  general_contractor?: string | null;
  superintendent?: string | null;
  address?: string | null;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Read `metadata[key]` as an object, or null when absent or malformed. */
export function metadataSection(metadata: Json | null | undefined, key: string): Record<string, unknown> | null {
  if (!isPlainObject(metadata)) return null;
  const section = metadata[key];
  return isPlainObject(section) ? section : null;
}

/** Merge one section into existing metadata without dropping sibling keys. */
export function withMetadataSection(
  metadata: Json | null | undefined,
  key: string,
  section: Record<string, unknown>,
): Record<string, Json> {
  const base = isPlainObject(metadata) ? { ...(metadata as Record<string, Json>) } : {};
  base[key] = section as unknown as Json;
  return base;
}

/** A finite number, or null. Never coerces null/""/undefined to 0. */
export function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** First 10 characters when they look like a YYYY-MM-DD date. */
export function dateOnlyOrNull(value: unknown): IsoDate | null {
  if (typeof value !== "string") return null;
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

export function isLive<T extends { is_deleted?: boolean | null }>(row: T): boolean {
  return row.is_deleted !== true;
}
