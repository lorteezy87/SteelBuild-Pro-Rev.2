/**
 * DocumentControl — the Board Report.
 *
 * Executive and PM-facing document control: a dark masthead that states the
 * situation in one sentence plus five headline metrics, then a light working
 * body with a log on the left and a detail pane on the right. Five screens
 * share that shell — Brief, Register, Submittals, RFIs, Transmittals.
 *
 * WHAT THIS REPLACED, AND WHAT HAPPENED TO IT
 * This route used to serve the PDF intake desk. That page is not deleted: it
 * is `documentControl/DocumentIntakeDesk.tsx`, still carrying its own test
 * suite, still mounted at /DocumentIntake, and linked from the Register
 * pane. Folding it in was not an option — the dashboard reports on documents
 * the system already holds, the intake desk reads one it does not, and the
 * hub's "Open intake" button means the latter.
 *
 * WRITES GO THROUGH THE OWNING PAGE'S PATH
 * The first build of this page was read-only, per the design handoff. Full
 * create / edit / delete was approved afterwards (2026-10-22). It is added
 * without a single new persistence path: every write is handed to
 * BoardReportEditors, which opens the app's own form for that record and
 * saves through the hook the owning page uses (RFI numbers from the sequence
 * RPC, submittal triggers and audit, sheet soft deletes with undo).
 * Transmittals move only through the shared lifecycle RPCs: issue (sequence
 * number, then send), acknowledge, void. An issued transmittal is never
 * edited or deleted. Controls follow the project role; RLS and the RPCs
 * remain the authority. Selecting a row still changes the pane and nothing
 * else.
 *
 * The masthead sentence is derived, not written: it reads the same counts the
 * metrics do, so it can never contradict them.
 */

import { useCallback, useMemo, useState } from "react";
import { useProjectId } from "@/hooks/useProjectId";
import useDocumentTitle from "@/hooks/useDocumentTitle";
import { useTheme } from "@/components/shared/ThemeContext";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { usePermissions } from "@/services/permissions";
import {
  BoardReportShell,
  MastheadAction,
  useOrgName,
  type BoardReportTab,
  type Metric,
} from "./documentControl/BoardReportShell";
import {
  BoardReportSkin,
  plural,
  BriefScreen,
  RegisterScreen,
  RfiScreen,
  SubmittalsScreen,
  TransmittalsScreen,
  type BoardReportActions,
} from "./documentControl/BoardReportScreens";
import { BoardReportEditorHost, type EditorIntent } from "./documentControl/BoardReportEditors";
import { DC_FONT, DC_LIGHT, DC_MASTHEAD, DC_SIGNAL } from "./documentControl/boardReportTheme";
import { ackState, CONTRACT_RETURN_DAYS, isPastDue } from "./documentControl/boardReportDerive";
import { countLabel, useBoardReportData } from "./documentControl/useBoardReportData";

const INTAKE_HREF = "/DocumentIntake";

type ProjectLabel = { id?: string | null; name?: string | null; project_name?: string | null };

/** The phrase the sentence highlights. */
function Hot({ children }: { children: React.ReactNode }) {
  return <span style={{ color: DC_SIGNAL.accentLight }}>{children}</span>;
}

export default function DocumentControl() {
  const projectId = useProjectId();
  // No org in context means no company name to print — never a placeholder one.
  const orgName = useOrgName() ?? "Us";
  // AGENTS.md: SteelBuild is dual-theme and a page may not force itself light.
  // ThemeContext resolves "system" for us, so this is the real active theme.
  const theme = useTheme() as { theme?: string } | undefined;
  const dark = theme?.theme !== "light";
  const [tab, setTab] = useState<BoardReportTab>("Brief");
  const data = useBoardReportData(projectId ?? null);
  useDocumentTitle("Document Control");

  // The id can come from the URL rather than the switcher, so the name is
  // looked up by id instead of assuming the active project is this one.
  const projectCtx = useProjectContext() as {
    activeProject?: ProjectLabel | null;
    projects?: ProjectLabel[];
  };
  const project =
    projectCtx.activeProject?.id === projectId
      ? projectCtx.activeProject
      : projectCtx.projects?.find((p) => p.id === projectId) ?? null;
  const projectName = project?.name || project?.project_name || "";
  const [editor, setEditor] = useState<EditorIntent | null>(null);
  const closeEditor = useCallback(() => setEditor(null), []);
  const { can } = usePermissions();
  const actions = useMemo((): BoardReportActions => {
    const perms = (entity: string) => ({
      create: can("create", entity),
      edit: can("edit", entity),
      delete: can("delete", entity),
    });
    // Transmittals get their own key, not "drawing": drawing:edit floors at
    // field, but every transmittal write (RLS and the create / send /
    // acknowledge / void RPCs) requires PM. The un-overridden "transmittal"
    // key floors create and edit at PM, matching the database. Void is a
    // PM-gated RPC too, so it follows edit rather than the admin-only
    // default for delete.
    const transmittalEdit = can("edit", "transmittal");
    return {
      perms: {
        sheet: perms("drawing"),
        submittal: perms("submittal"),
        rfi: perms("rfi"),
        transmittal: { create: can("create", "transmittal"), edit: transmittalEdit, delete: transmittalEdit },
      },
      open: setEditor,
    };
  }, [can]);

  const createAction = (() => {
    const make = (label: string, allowed: boolean, intent: EditorIntent) =>
      allowed ? <MastheadAction onClick={() => setEditor(intent)}>{label}</MastheadAction> : null;
    if (tab === "Register") return make("+ New sheet", actions.perms.sheet.create, { kind: "sheet", mode: "create" });
    if (tab === "Submittals") return make("+ New submittal", actions.perms.submittal.create, { kind: "submittal", mode: "create" });
    if (tab === "RFIs") return make("+ New RFI", actions.perms.rfi.create, { kind: "rfi", mode: "create" });
    if (tab === "Transmittals") return make("+ New transmittal", actions.perms.transmittal.create, { kind: "transmittal", mode: "create" });
    return null;
  })();

  const counts = useMemo(() => {
    const reg = data.register.rows;
    const released = reg.filter((r) => r.status === "REL").length;
    const inReview = reg.filter((r) => r.status === "REV").length;
    const rr = reg.filter((r) => r.status === "R&R").length;
    const held = reg.filter((r) => r.status === "HOLD").length;
    const detailing = reg.filter((r) => r.status === "DET" || r.status === "NONE").length;

    const subs = data.submittals.rows;
    const out = subs.filter((s) => s.status === "REV" || s.status === "LATE").length;
    const late = subs.filter((s) => s.status === "LATE").length;
    const resubmit = subs.filter((s) => s.status === "R&R").length;

    const open = data.rfis.rows.filter((r) => r.open);
    const pastDue = open.filter((r) => isPastDue(r.dueOn, data.today)).length;
    const fabHold = open.filter((r) => r.impact === "Fab hold").length;

    const xm = data.transmittals.rows;
    const unacked = xm.filter((t) => ackState(t.acknowledged, t.hoursWaiting) !== "acknowledged").length;
    const ackOverdue = xm.filter((t) => ackState(t.acknowledged, t.hoursWaiting) === "overdue").length;

    return {
      reg: reg.length, released, inReview, rr, held, detailing,
      subs: subs.length, out, late, resubmit,
      openRfis: open.length, pastDue, fabHold,
      xm: xm.length, unacked, ackOverdue,
    };
  }, [data]);

  const { sentence, metrics, emphasis, right } = useMemo((): {
    sentence: React.ReactNode;
    metrics: Metric[];
    emphasis: boolean;
    right: React.ReactNode;
  } => {
    const t = (n: number, truncated: boolean) => countLabel(n, truncated);

    if (tab === "Register") {
      return {
        emphasis: false,
        right: null,
        sentence:
          counts.reg === 0 ? (
            "No sheets are on the register for this project yet."
          ) : counts.held > 0 ? (
            <>
              {counts.released} of {counts.reg} sheets are released.{" "}
              <Hot>
                {counts.held} {counts.held === 1 ? "sheet is" : "sheets are"} on fab hold
              </Hot>{" "}
              and cannot move until the hold clears.
            </>
          ) : (
            <>
              {counts.released} of {counts.reg} sheets are released; {counts.inReview} are still out for review.
            </>
          ),
        metrics: [
          { value: String(counts.released), label: `Released of ${counts.reg.toLocaleString()}` },
          { value: String(counts.inReview), label: "In review" },
          { value: String(counts.rr), label: "Revise & resubmit", tone: DC_SIGNAL.metricRr },
          { value: String(counts.held), label: "On fab hold", tone: DC_SIGNAL.accentLight },
          { value: String(counts.detailing), label: "Detailing / not started" },
        ],
      };
    }

    if (tab === "Submittals") {
      return {
        emphasis: false,
        right: null,
        sentence:
          counts.subs === 0 ? (
            "No submittal packages have been logged for this project."
          ) : counts.late > 0 ? (
            <>
              {counts.out} packages are out for review.{" "}
              <Hot>
                {counts.late} {counts.late === 1 ? "is" : "are"} past the {CONTRACT_RETURN_DAYS}-day return
              </Hot>
              .
            </>
          ) : (
            <>{counts.out} packages are out for review, all inside the {CONTRACT_RETURN_DAYS}-day contract return.</>
          ),
        metrics: [
          { value: t(counts.out, data.submittals.truncated), label: "Out for review" },
          { value: String(counts.late), label: "Past contract return", tone: DC_SIGNAL.metricLate },
          { value: String(counts.resubmit), label: "Awaiting resubmit", tone: DC_SIGNAL.metricRr },
          { value: String(CONTRACT_RETURN_DAYS), unit: "d", label: "Contract return" },
          { value: t(counts.subs, data.submittals.truncated), label: "Packages logged" },
        ],
      };
    }

    if (tab === "RFIs") {
      return {
        emphasis: false,
        right: null,
        sentence:
          counts.openRfis === 0 ? (
            "No RFIs are open on this project."
          ) : counts.fabHold > 0 ? (
            <>
              {counts.openRfis} RFIs are open; {counts.pastDue} are past their response date.{" "}
              <Hot>
                {counts.fabHold} {counts.fabHold === 1 ? "is" : "are"} holding fabrication
              </Hot>
              .
            </>
          ) : (
            <>
              {counts.openRfis} RFIs are open; {counts.pastDue} are past their response date.
            </>
          ),
        metrics: [
          { value: t(counts.openRfis, data.rfis.truncated), label: "Open" },
          { value: String(counts.pastDue), label: "Past response date", tone: DC_SIGNAL.metricLate },
          { value: String(counts.fabHold), label: "Holding fabrication", tone: DC_SIGNAL.accentLight },
          { value: String(counts.openRfis - counts.pastDue), label: "Inside response window" },
          { value: t(data.rfis.rows.length, data.rfis.truncated), label: "Logged all time" },
        ],
      };
    }

    if (tab === "Transmittals") {
      return {
        emphasis: false,
        right: null,
        sentence:
          counts.xm === 0 ? (
            "Nothing has been transmitted on this project yet."
          ) : counts.unacked > 0 ? (
            <>
              {counts.xm} transmittals have gone out.{" "}
              <Hot>
                {counts.unacked} {counts.unacked === 1 ? "is" : "are"} unacknowledged
              </Hot>
              {counts.ackOverdue > 0 ? `, ${counts.ackOverdue} past 48 hours` : ""}.
            </>
          ) : (
            <>All {counts.xm} transmittals have been acknowledged.</>
          ),
        metrics: [
          { value: t(counts.xm, data.transmittals.truncated), label: "Sent" },
          { value: String(counts.unacked), label: "Awaiting acknowledgement", tone: DC_SIGNAL.accentLight },
          { value: String(counts.ackOverdue), label: "Past 48 hours", tone: DC_SIGNAL.metricLate },
          { value: String(counts.xm - counts.unacked), label: "Acknowledged" },
          { value: "48", unit: "h", label: "Chase threshold" },
        ],
      };
    }

    // Brief
    return {
      emphasis: true,
      right: (
        <span style={{ font: `400 12px/1 ${DC_FONT.mono}`, color: DC_MASTHEAD.mono }}>
          {counts.reg.toLocaleString()} sheets tracked
        </span>
      ),
      sentence:
        counts.reg === 0 ? (
          "Nothing is on the register for this project yet."
        ) : counts.fabHold > 0 || counts.late > 0 ? (
          <>
            {releasedShare(counts.released, counts.reg)} of the register is released to the shop.{" "}
            <Hot>
              {counts.fabHold > 0
                ? `${counts.fabHold} open RFI${counts.fabHold === 1 ? "" : "s"} holding fabrication`
                : `${counts.late} late return${counts.late === 1 ? "" : "s"}`}
            </Hot>{" "}
            {counts.fabHold > 0 && counts.late > 0 ? `and ${counts.late} late return${counts.late === 1 ? "" : "s"} are ` : "is "}
            the exposure.
          </>
        ) : (
          <>{releasedShare(counts.released, counts.reg)} of the register is released to the shop, with nothing overdue.</>
        ),
      metrics: [
        { value: releasedShare(counts.released, counts.reg), label: <>Sheets released<br />{counts.released.toLocaleString()} of {counts.reg.toLocaleString()}</> },
        { value: String(counts.out), label: <>Packages in review<br />{counts.resubmit} awaiting resubmit</> },
        { value: String(counts.late), label: <>Late returns<br />past {CONTRACT_RETURN_DAYS}-day contract</>, tone: DC_SIGNAL.metricLate },
        { value: String(counts.openRfis), label: <>Open RFIs<br />{counts.pastDue} past response date</> },
        { value: String(counts.fabHold), label: <>Fabrication holds<br />{plural(counts.held, "sheet")} held</>, tone: DC_SIGNAL.accentLight },
      ],
    };
  }, [tab, counts, data.submittals.truncated, data.rfis.truncated, data.transmittals.truncated, data.rfis.rows.length]);

  if (!projectId) {
    return (
      <div style={{ padding: 44, font: `400 14px/1.6 ${DC_FONT.ui}`, color: DC_LIGHT.textSecondary }}>
        Select a project to see its document control.
      </div>
    );
  }

  return (
    <BoardReportShell
      tab={tab}
      onTabChange={setTab}
      sentence={data.isLoading ? "Reading the register…" : sentence}
      metrics={metrics}
      emphasis={emphasis}
      mastheadRight={
        <>
          {right}
          {createAction}
        </>
      }
      dark={dark}
    >
      <BoardReportSkin dark={dark}>
      {data.isError ? (
        <div style={{ padding: "28px 44px", font: `400 13px/1.6 ${DC_FONT.ui}`, color: DC_LIGHT.textSecondary }}>
          Some of this could not be read. The figures above cover only what loaded.
        </div>
      ) : null}
      {tab === "Brief" ? <BriefScreen data={data} /> : null}
      {tab === "Register" ? <RegisterScreen data={data} intakeHref={INTAKE_HREF} actions={actions} /> : null}
      {tab === "Submittals" ? <SubmittalsScreen data={data} orgName={orgName} actions={actions} /> : null}
      {tab === "RFIs" ? <RfiScreen data={data} orgName={orgName} actions={actions} /> : null}
      {tab === "Transmittals" ? <TransmittalsScreen data={data} actions={actions} /> : null}
      </BoardReportSkin>
      <BoardReportEditorHost
        intent={editor}
        projectId={projectId}
        projectName={projectName}
        dark={dark}
        onClose={closeEditor}
      />
    </BoardReportShell>
  );
}

/** "50%" — never NaN on an empty register. */
function releasedShare(released: number, total: number): string {
  if (!total) return "0%";
  return `${Math.round((released / total) * 100)}%`;
}
