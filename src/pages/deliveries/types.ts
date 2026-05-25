import type { ComponentType } from "react";

export type RiskLevel = "high" | "medium" | "clear";
export type ViewId = "dispatch" | "schedule" | "register";

export interface DeliveryFlag {
  key: string;
  label: string;
  severity: string;
}

export interface DeliverySignals {
  status: string;
  open: boolean;
  scheduledDate: Date | null;
  requiredDate: Date | null;
  actualDate: Date | null;
  expectedShipDate: Date | null;
  daysUntilScheduled: number | null;
  daysUntilRequired: number | null;
  overdue: boolean;
  dueToday: boolean;
  dueNext7: boolean;
  unscheduled: boolean;
  issueStatus: boolean;
  longLead: boolean;
  fabReady: boolean;
  capacityUsed: number | null;
  flags: DeliveryFlag[];
  risk: RiskLevel;
  readinessScore: number;
}

export interface DeliveryRecord {
  id?: string;
  _signals?: DeliverySignals;
  _workPackage?: unknown;
  // Delivery rows are dynamic Supabase records; remaining fields are untyped.
  [key: string]: any;
}

export type ProjectMap = Record<string, string>;
export type WorkPackageMap = Record<string, any>;

export interface StatusRollupRow {
  status: string;
  count: number;
  tons: number;
}

export interface CalendarDay {
  date: Date;
  iso: string;
  label: string;
  items: DeliveryRecord[];
  tons: number;
}

export interface DeliveryMetrics {
  today: Date;
  enriched: DeliveryRecord[];
  totalCount: number;
  openCount: number;
  deliveredCount: number;
  totalOpenTons: number;
  totalOpenPieces: number;
  statusRollup: StatusRollupRow[];
  overdue: DeliveryRecord[];
  dueToday: DeliveryRecord[];
  dueNext7: DeliveryRecord[];
  unscheduled: DeliveryRecord[];
  longLeadOpen: DeliveryRecord[];
  exceptions: DeliveryRecord[];
  readyToReceive: DeliveryRecord[];
  deliveredLast7: DeliveryRecord[];
  nextLoads: DeliveryRecord[];
  calendarDays: CalendarDay[];
}

export interface FilterOption {
  id: string;
  label: string;
  icon?: ComponentType<{ size?: number | string }>;
}
