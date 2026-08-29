import type { TaskGate } from "@/services/scheduleGatekeeper";

export type InstallReadinessStatus = "ready" | "not_ready" | "gated" | "blocked" | "rfi" | "vif";

export type InstallReadiness = {
  status: InstallReadinessStatus;
  reasons: string[];
};

const CLOSED = /complete|completed|closed|cancelled|canceled/;

/**
 * Install is ready only when fab/ship work is done AND no RFI/VIF/hold gate remains.
 * Reuses scheduleGatekeeper TaskGate when present on `_gate`.
 */
export function computeInstallReadiness(task: Record<string, any>): InstallReadiness {
  const reasons: string[] = [];
  const status = String(task?.status || "").toLowerCase();
  const phase = String(task?.phase || "").toLowerCase();
  const blockers = String(task?.blockers || "").trim();
  const gate = (task?._gate || null) as TaskGate | null;
  const notes = String(task?.notes || "").toLowerCase();
  const readinessHint = String(task?.install_readiness || task?.metadata?.install_readiness || "").toLowerCase();

  if (gate?.state === "blocked") {
    for (const b of gate.blockers) {
      reasons.push(b.rfiNumber ? `RFI ${b.rfiNumber} blocking` : b.title || "Critical RFI hold");
    }
  } else if (gate?.state === "warning") {
    for (const w of gate.warnings) {
      reasons.push(w.rfiNumber ? `RFI ${w.rfiNumber} open` : w.title || "High RFI hold");
    }
  }

  if (blockers) reasons.push(blockers);
  if (readinessHint === "vif" || /\bvif\b|verify in field/.test(notes)) reasons.push("Verify-in-field required");
  if (readinessHint === "rfi" || /\bopen rfi\b/.test(notes)) reasons.push("Open RFI");
  if (/\bdo not fab|do-not-fabricate|hold fab/.test(`${status} ${notes} ${blockers.toLowerCase()}`)) {
    reasons.push("Do-not-fabricate hold");
  }
  if (/\bdo not ship|do-not-ship|hold ship/.test(`${status} ${notes} ${blockers.toLowerCase()}`)) {
    reasons.push("Do-not-ship hold");
  }

  const isProduction = /fab|fabricat|deliver|ship|erect|install/.test(phase);
  if (isProduction && !CLOSED.test(status)) {
    if (/erect|install/.test(phase)) {
      reasons.push("Not installed / erection incomplete");
    } else if (/deliver|ship/.test(phase)) {
      reasons.push("Not shipped");
    } else if (/fab/.test(phase)) {
      reasons.push("Not fabricated");
    }
  }

  if (gate?.state === "blocked" || readinessHint === "blocked" || status.includes("blocked")) {
    return { status: "blocked", reasons };
  }
  if (readinessHint === "rfi" || reasons.some((r) => /open rfi|rfi /i.test(r))) {
    return { status: reasons.some((r) => /blocking/i.test(r)) ? "blocked" : "rfi", reasons };
  }
  if (readinessHint === "vif" || reasons.some((r) => /verify-in-field/i.test(r))) {
    return { status: "vif", reasons };
  }
  if (reasons.length) return { status: "gated", reasons };
  if (CLOSED.test(status) && /erect|install/.test(phase)) return { status: "ready", reasons: [] };
  return { status: "not_ready", reasons: [] };
}
