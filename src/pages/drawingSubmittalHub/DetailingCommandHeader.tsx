/**
 * DetailingCommandHeader: the Detailing Control Center's compact command
 * header, adopted from SteelBuild-Pro-2026's CommandBar (owner decision 2,
 * 2026-09-11). DCC-local on purpose. The other Control Centers keep PageHero,
 * which this doesn't touch.
 *
 * Left: an eyebrow (project number · name), the h1 with the holds badge beside
 * it, the subtitle and an optional status line. Right: actions. Bottom row:
 * whatever the caller passes (the shell's tab strip). From 769px up the header
 * sticks to the top of main#main-content; command.css owns that rule.
 */
import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { useUserPrefs } from "@/hooks/useUserPrefs";

export const DCC_TITLE = "Detailing Control Center";

/**
 * Where a set's stage comes from, stated as REV2 actually derives it
 * (effectiveDetailingState in detailingPackageState.js, derivedSetStage in
 * submittalStageMapping.ts). Unlike 2026, sheet stage (drawings.stage) still
 * applies when no submittal governs, so this never says otherwise.
 */
export const DCC_SUBTITLE =
  "Stage follows each set's governing submittal. Manual release states override it; with no submittal, drafting states or sheet stage apply.";

/**
 * The eyebrow's project line. The number follows the user's Show Project
 * Numbers preference, the rule ProjectPillDropdown uses. With no name it shows
 * regardless, so the header never loses its project.
 */
export function projectEyebrow(
  name: string | null | undefined,
  number: string | null | undefined,
  showNumbers: boolean,
): string {
  const projectName = name?.trim() ?? "";
  const projectNumber = number?.trim() ?? "";
  return [showNumbers || !projectName ? projectNumber : "", projectName].filter(Boolean).join(" · ");
}

/** The holds badge's text: the Holds tab's Active-table count. */
export function holdsBadgeLabel(count: number): string {
  return count > 0 ? `${count} Sheet${count === 1 ? "" : "s"} On Hold` : "No holds";
}

export interface DetailingCommandHeaderProps {
  projectName?: string | null;
  projectNumber?: string | null;
  /** Active holds. null/undefined while unknown, which hides the badge. */
  activeHolds?: number | null;
  /** Opens Holds & Blockers. Without it there is no badge. */
  onOpenHolds?: () => void;
  /** The compact KPI line for tabs that don't show the KPI strip. */
  statusLine?: string | null;
  actions?: ReactNode;
  /** The header's bottom row (the tab strip). */
  children?: ReactNode;
}

export function DetailingCommandHeader({
  projectName,
  projectNumber,
  activeHolds,
  onOpenHolds,
  statusLine,
  actions,
  children,
}: DetailingCommandHeaderProps) {
  const { show_project_numbers: showProjectNumbers } = useUserPrefs();
  const eyebrow = projectEyebrow(projectName, projectNumber, Boolean(showProjectNumbers));
  // Only a checked count is shown: never "No holds" before the query answers.
  const holds = typeof activeHolds === "number" ? activeHolds : null;

  return (
    <header className={children ? "detailing-cc__header" : "detailing-cc__header detailing-cc__header--bare"}>
      <div className="detailing-cc__header-row">
        <div className="detailing-cc__heading">
          {eyebrow ? <p className="detailing-cc__eyebrow">{eyebrow}</p> : null}
          <div className="detailing-cc__title-row">
            <h1 className="detailing-cc__title">{DCC_TITLE}</h1>
            {/* Beside the h1, not inside it, so the heading's name stays the
                page title. */}
            {holds !== null && onOpenHolds ? (
              <button
                type="button"
                className={`cmd-chip detailing-cc__holds${holds > 0 ? " cmd-chip--warn" : ""}`}
                onClick={onOpenHolds}
                data-active-holds={holds}
                title="Open Holds & Blockers (the same count as its Active table)"
              >
                <ShieldAlert size={12} aria-hidden="true" />
                {holdsBadgeLabel(holds)}
              </button>
            ) : null}
          </div>
          <p className="detailing-cc__subtitle">{DCC_SUBTITLE}</p>
          {statusLine ? <p className="detailing-cc__status">{statusLine}</p> : null}
        </div>
        {actions ? <div className="detailing-cc__actions">{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}
