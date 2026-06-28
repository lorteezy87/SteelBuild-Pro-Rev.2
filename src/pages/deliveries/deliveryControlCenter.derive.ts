/**
 * Pure derivations for the Delivery Control Center (command_ui redesign).
 * No React, no network. Wraps the already-computed DeliveryMetrics from
 * analytics.js — no re-computation, just shaping the data for the UI.
 */
import type { PillTone } from "@/components/command";
import type { DeliveryMetrics, DeliveryRecord } from "./types";

/** Map delivery status to a Pill tone. */
export function deliveryStatusTone(status?: string | null): PillTone {
  switch (status) {
    case "Delivered": return "good";
    case "In Transit": return "info";
    case "Loading": return "info";
    case "Delayed": return "danger";
    case "Rejected": return "danger";
    case "Partial": return "warn";
    case "Scheduled": return "neutral";
    default: return "neutral";
  }
}

export interface DeliveryPanels {
  /** Next scheduled loads sorted by risk/date (up to 8). */
  workQueue: DeliveryRecord[];
  /** Loads that are Loading or In Transit with readiness ≥80% and no high risk (up to 8). */
  receivingQueue: DeliveryRecord[];
  /** Loads with any non-clear risk signal (up to 8). */
  exceptionQueue: DeliveryRecord[];
}

/** Build the three decision panels from the already-computed metrics. */
export function buildDeliveryPanels(metrics: DeliveryMetrics): DeliveryPanels {
  return {
    workQueue: metrics.nextLoads.slice(0, 8),
    receivingQueue: metrics.readyToReceive.slice(0, 8),
    exceptionQueue: metrics.exceptions.slice(0, 8),
  };
}
