// ── gettingStarted — pure step-state logic for the onboarding checklist ──
//
// Turns the five project signals into the ordered four-step workflow state
// (drawings → submittals → RFIs → fab release). No React, no Supabase — just
// signals → state, so it's trivially unit-testable. Display metadata (titles,
// CTAs, icons) lives in the component; this owns only done/current/todo + the
// all-complete flag.

export type GettingStartedStepKey = "drawings" | "submittals" | "rfis" | "fab";
export type StepStatus = "done" | "current" | "todo";

export interface GettingStartedStep {
  key: GettingStartedStepKey;
  status: StepStatus;
}

export interface GettingStartedSignals {
  /** project has ≥1 active drawing / drawing set */
  hasDrawings: boolean;
  /** project has ≥1 active submittal */
  hasSubmittal: boolean;
  /** project has ≥1 RFI */
  hasRfi: boolean;
  /** user clicked "No RFIs needed" for this project */
  rfiSkipped: boolean;
  /** a fab_release_log row OR a submittal at "Released for Fabrication" */
  hasFabRelease: boolean;
}

export interface GettingStartedState {
  /** always the four steps, in workflow order */
  steps: GettingStartedStep[];
  /** all four steps satisfied */
  allComplete: boolean;
}

/** The four steps in workflow order. */
export const GETTING_STARTED_ORDER: GettingStartedStepKey[] = ["drawings", "submittals", "rfis", "fab"];

/**
 * Resolve the four-step state from the project signals. A step is `done` when
 * its signal is satisfied (the RFI step also clears via the skip flag). The
 * first not-done step is `current`; later not-done steps are `todo`.
 */
export function computeGettingStartedSteps(signals: GettingStartedSignals): GettingStartedState {
  const done: Record<GettingStartedStepKey, boolean> = {
    drawings: Boolean(signals?.hasDrawings),
    submittals: Boolean(signals?.hasSubmittal),
    rfis: Boolean(signals?.hasRfi || signals?.rfiSkipped),
    fab: Boolean(signals?.hasFabRelease),
  };

  let currentAssigned = false;
  const steps: GettingStartedStep[] = GETTING_STARTED_ORDER.map((key) => {
    if (done[key]) return { key, status: "done" };
    if (!currentAssigned) {
      currentAssigned = true;
      return { key, status: "current" };
    }
    return { key, status: "todo" };
  });

  return { steps, allComplete: GETTING_STARTED_ORDER.every((k) => done[k]) };
}
