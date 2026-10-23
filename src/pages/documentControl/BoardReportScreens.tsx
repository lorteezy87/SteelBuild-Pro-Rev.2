/**
 * BoardReportScreens — the five Document Control screens.
 *
 * They live in one module because they are one system: the same masthead, the
 * same log-plus-detail-pane body, the same selection behaviour, differing only
 * in columns and in what the pane says. Splitting them into five files would
 * duplicate the row/pane scaffolding five times.
 *
 * All five are READ-ONLY. Selecting a row changes which record the pane
 * describes and nothing else; every action is either disabled or a link out to
 * the hub flow that already owns that write. See PaneButton.
 */

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import {
  BoardReportBody,
  DetailPane,
  FilterChips,
  LogHeader,
  PaneButton,
  StatusBadge,
} from "./BoardReportShell";
import { DC_DARK, DC_FONT, DC_LIGHT, type DcSkin } from "./boardReportTheme";
import {
  ACK_BADGE,
  CONTRACT_RETURN_DAYS,
  ackColor,
  ackState,
  alertBox,
  badgeLabel,
  badgeStyle,
  bicSlices,
  daysOutBar,
  dueDateColor,
  isPastDue,
  formatDay,
  formatShortDay,
  heldSheetsForRfi,
  humanizeWait,
  impactPill,
  matrixCell,
  releasedPct,
  rowChrome,
  routingSteps,
  submittalAlertTone,
  type CalendarDay,
  type DcStatus,
} from "./boardReportDerive";
import type { BoardReportData, RegisterRow, RfiRow, SubmittalRow, TransmittalRow } from "./useBoardReportData";
// The file-trust boundary: storage paths become signed URLs; foreign hosts
// come back null. See SheetPreview for why src never takes the raw value.
import { useResolvedFileUrl } from "@/hooks/useResolvedFileUrl";

const mono = DC_FONT.mono;
const ui = DC_FONT.ui;

/**
 * The active skin, supplied by the page.
 *
 * AGENTS.md: "SteelBuild is dual-theme. Do not force command pages
 * light-only." Every surface and text colour below used to read DC_LIGHT
 * directly, which put a bright report body inside dark application chrome for
 * anyone running dark mode. They read this instead, and the page resolves it
 * from ThemeContext.
 */
const SkinContext = createContext<{ skin: DcSkin; dark: boolean }>({ skin: DC_LIGHT, dark: false });

export function BoardReportSkin({ dark, children }: { dark: boolean; children: ReactNode }) {
  const value = useMemo(() => ({ skin: dark ? DC_DARK : DC_LIGHT, dark }), [dark]);
  return <SkinContext.Provider value={value}>{children}</SkinContext.Provider>;
}

const useSkin = () => useContext(SkinContext);

/* ─── shared row scaffolding ─────────────────────────────────────────────── */

function LogRow({
  columns,
  selected,
  onSelect,
  label,
  children,
}: {
  columns: string;
  selected: boolean;
  onSelect: () => void;
  label: string;
  children: ReactNode;
}) {
  const { skin: S, dark } = useSkin();
  const chrome = rowChrome(selected, dark);
  const [hover, setHover] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={label}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "grid",
        gridTemplateColumns: columns,
        gap: 12,
        alignItems: "center",
        padding: "11px 12px",
        borderBottom: `1px solid ${S.rowBorder}`,
        cursor: "pointer",
        background: hover && !selected ? S.rowHover : chrome.background,
        boxShadow: chrome.boxShadow,
      }}
    >
      {children}
    </div>
  );
}

const Cell = ({ children, kind = "text" }: { children: ReactNode; kind?: "text" | "mono" | "id" | "clip" }) => {
  const { skin: S } = useSkin();
  const style =
    kind === "id"
      ? { font: `600 13px/1 ${mono}` }
      : kind === "mono"
        ? { font: `400 12px/1 ${mono}`, color: S.textSecondary }
        : kind === "clip"
          ? {
              font: `400 13px/1.2 ${ui}`,
              whiteSpace: "nowrap" as const,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }
          : { font: `400 12px/1.2 ${ui}`, color: S.textSecondary };
  return <span style={style}>{children}</span>;
};

function PaneHeading({ eyebrow, title, desc, badge }: { eyebrow: ReactNode; title: string; desc?: string; badge?: ReactNode }) {
  const { skin: S, dark } = useSkin();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {eyebrow}
        {badge ? <span style={{ marginLeft: "auto" }}>{badge}</span> : null}
      </div>
      <span style={{ font: `600 20px/1.2 ${ui}`, textWrap: "pretty" }}>{title}</span>
      {desc ? <span style={{ font: `400 13px/1.45 ${ui}`, color: S.textSecondary, textWrap: "pretty" }}>{desc}</span> : null}
    </div>
  );
}

function EmptyPane({ what }: { what: string }) {
  const { skin: S, dark } = useSkin();
  return (
    <DetailPane dark={dark}>
      <span style={{ font: `400 13px/1.5 ${ui}`, color: S.textMuted }}>
        Select {what} to see its detail.
      </span>
    </DetailPane>
  );
}

function EmptyLog({ what }: { what: string }) {
  const { skin: S, dark } = useSkin();
  return (
    <div
      style={{
        padding: "28px 12px",
        font: `400 13px/1.5 ${ui}`,
        color: S.textMuted,
        borderBottom: `1px solid ${S.rowBorder}`,
      }}
    >
      No {what} on this project yet.
    </div>
  );
}

function ChipBar({ chips, active, onPick, right }: { chips: string[]; active: string; onPick: (c: string) => void; right: ReactNode }) {
  const { skin: S, dark } = useSkin();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <FilterChips chips={chips} active={active} onPick={onPick} dark={dark} />
      <span style={{ marginLeft: "auto", font: `400 12px/1 ${ui}`, color: S.textMuted }}>{right}</span>
    </div>
  );
}

const LogColumn = ({ children }: { children: ReactNode }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>{children}</div>
);

const Rows = ({ children }: { children: ReactNode }) => (
  <div style={{ display: "flex", flexDirection: "column", marginTop: -14 }}>{children}</div>
);

/* ─── 2a · Drawing Register ──────────────────────────────────────────────── */

const REGISTER_COLUMNS = "72px minmax(0,1fr) 56px 44px 96px 64px 64px 84px";

/**
 * The design's 4:3 sheet preview.
 *
 * `thumbnail_url` is a STORAGE PATH, not a URL — storage.ts verified every
 * file_url table holds paths, zero full URLs — so it goes through
 * `useResolvedFileUrl`, never straight into `src`. That one hop is doing two
 * jobs: a raw path rendered as `src` resolves against the app's own origin and
 * 404s (no existing thumbnail would ever load), and the resolver is also the
 * file-trust boundary (#20) — a full URL on any host but our Supabase project
 * comes back null rather than being fetched by every viewer of this pane, so
 * a poisoned thumbnail_url cannot turn the Board Report into a tracking pixel.
 *
 * Unresolved, blocked, loading and absent all land on the placeholder the
 * handoff allows — a missing preview says nothing about the sheet.
 */
function SheetPreview({ sheet, thumbnailUrl, dark }: { sheet: string; thumbnailUrl: string | null; dark: boolean }) {
  const S = dark ? DC_DARK : DC_LIGHT;
  const { url } = useResolvedFileUrl(thumbnailUrl);
  if (url) {
    return (
      <img
        src={url}
        alt={`Sheet ${sheet}`}
        loading="lazy"
        style={{
          aspectRatio: "4 / 3",
          width: "100%",
          objectFit: "cover",
          background: S.rowHover,
          border: `1px solid ${S.paneBorder}`,
          display: "block",
        }}
      />
    );
  }
  return (
    <div
      style={{
        aspectRatio: "4 / 3",
        background: S.rowHover,
        border: `1px dashed ${S.dashed}`,
        display: "grid",
        placeItems: "center",
        font: `400 12px/1 ${mono}`,
        color: S.textFaint,
      }}
    >
      sheet preview · {sheet}
    </div>
  );
}

/**
 * The design's status-dependent primary action, as a LINK rather than a write.
 *
 * The comps label this button by what the sheet needs next — REL sends to the
 * shop, R&R wants the next revision uploaded, HOLD opens an RFI — and that
 * label is most of what the pane tells a PM. The page is read-only, and the
 * handoff is explicit that these "must be built disabled, or as links out to
 * the existing Drawing/Submittal Hub flows", so each one routes to the flow
 * that owns the write instead of performing it here. The label is the design's;
 * the behaviour is a navigation.
 */
const REGISTER_ACTION: Record<DcStatus, { label: string; href: string }> = {
  REL: { label: "Send to shop", href: "/WorkPackages" },
  REV: { label: "Send reminder", href: "/DrawingSubmittalHub" },
  "R&R": { label: "Upload next revision", href: "/DrawingSubmittalHub" },
  HOLD: { label: "Open RFI", href: "/RFIs" },
  DET: { label: "Assign checker", href: "/DrawingSubmittalHub" },
  LATE: { label: "Escalate to GC", href: "/DrawingSubmittalHub" },
  NONE: { label: "Open in Drawing Control", href: "/DrawingSubmittalHub" },
};

export function RegisterScreen({ data, intakeHref }: { data: BoardReportData; intakeHref: string }) {
  const { skin: S, dark } = useSkin();
  const [filter, setFilter] = useState("All sheets");
  const [selected, setSelected] = useState<string | null>(null);

  const chips = ["All sheets", "Released", "In review", "Revise & resubmit", "On hold", "Detailing"];
  const matches = (r: RegisterRow) =>
    filter === "All sheets" ||
    (filter === "Released" && r.status === "REL") ||
    (filter === "In review" && r.status === "REV") ||
    (filter === "Revise & resubmit" && r.status === "R&R") ||
    (filter === "On hold" && r.status === "HOLD") ||
    (filter === "Detailing" && (r.status === "DET" || r.status === "NONE"));

  const rows = data.register.rows.filter(matches);
  const current = rows.find((r) => r.id === selected) ?? rows[0] ?? null;

  return (
    <BoardReportBody>
      <LogColumn>
        <ChipBar
          chips={chips}
          active={filter}
          onPick={setFilter}
          right={`Showing ${rows.length.toLocaleString()} of ${data.register.rows.length.toLocaleString()}`}
        />
        <LogHeader
          dark={dark}
          columns={REGISTER_COLUMNS}
          // "Disc", not "Seq": this cell is fed by `drawings.discipline`. There
          // is no sequence column on drawings, and labelling a discipline
          // letter "Seq" invites a PM to read it as the erection sequence.
          labels={["Sheet", "Title", "Disc", "Rev", "Status", "Sent", "Back", "Ball in court"]}
        />
        <Rows>
          {rows.length === 0 ? (
            <EmptyLog what="sheets" />
          ) : (
            rows.map((r) => (
              <LogRow
                key={r.id}
                columns={REGISTER_COLUMNS}
                selected={current?.id === r.id}
                onSelect={() => setSelected(r.id)}
                label={`Sheet ${r.sheet} — ${r.title}`}
              >
                <Cell kind="id">{r.sheet}</Cell>
                <Cell kind="clip">{r.title}</Cell>
                <Cell kind="mono">{r.seq}</Cell>
                <Cell kind="mono">{r.rev}</Cell>
                <StatusBadge label={badgeLabel(r.status)} style={badgeStyle(r.status, dark)} />
                <Cell kind="mono">{formatShortDay(r.sentOn)}</Cell>
                <Cell kind="mono">{formatShortDay(r.backOn)}</Cell>
                <Cell>{r.ballInCourt ?? "—"}</Cell>
              </LogRow>
            ))
          )}
        </Rows>
      </LogColumn>

      {current ? (
        <DetailPane dark={dark}>
          <PaneHeading
            eyebrow={
              <>
                <span style={{ font: `600 13px/1 ${mono}` }}>{current.sheet}</span>
                <span style={{ font: `400 12px/1 ${mono}`, color: S.textMuted }}>
                  Rev {current.rev} · {current.setName}
                </span>
              </>
            }
            badge={<StatusBadge label={badgeLabel(current.status)} style={badgeStyle(current.status, dark)} />}
            title={current.title}
          />
          <SheetPreview sheet={current.sheet} thumbnailUrl={current.thumbnailUrl} dark={dark} />
          {current.onHold && current.holdReason ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={{ font: `600 13px/1 ${ui}` }}>Holding on</span>
              <div style={{ font: `400 13px/1.4 ${ui}`, color: S.textSecondary, textWrap: "pretty" }}>
                {current.holdReason}
              </div>
            </div>
          ) : null}
          <div style={{ display: "flex", flexDirection: "column", borderTop: `1px solid ${S.rowBorder}`, paddingTop: 14 }}>
            <span style={{ font: `600 13px/1 ${ui}`, marginBottom: 10 }}>Open items</span>
            <div style={{ font: `400 12px/1.35 ${ui}`, color: S.textSecondary }}>
              {current.rfiCount > 0 ? `${current.rfiCount} linked RFI${current.rfiCount === 1 ? "" : "s"}` : "No linked RFIs"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <PaneButton dark={dark} href={REGISTER_ACTION[current.status].href}>
              {REGISTER_ACTION[current.status].label}
            </PaneButton>
            <PaneButton dark={dark} variant="secondary" href={intakeHref}>
              Intake desk
            </PaneButton>
          </div>
        </DetailPane>
      ) : (
        <EmptyPane what="a sheet" />
      )}
    </BoardReportBody>
  );
}

/* ─── 2b · Submittals & Approvals ────────────────────────────────────────── */

const SUBMITTAL_COLUMNS = "118px minmax(0,1fr) 52px 92px minmax(0,1.1fr) 80px";

export function SubmittalsScreen({ data, orgName }: { data: BoardReportData; orgName: string }) {
  const { skin: S, dark } = useSkin();
  const [filter, setFilter] = useState("Out for review");
  const [selected, setSelected] = useState<string | null>(null);

  const chips = ["Out for review", "Past return", "Resubmit", "All"];
  const matches = (r: SubmittalRow) =>
    filter === "All" ||
    (filter === "Out for review" && (r.status === "REV" || r.status === "LATE")) ||
    (filter === "Past return" && r.status === "LATE") ||
    (filter === "Resubmit" && r.status === "R&R");

  const rows = data.submittals.rows.filter(matches);
  const current = rows.find((r) => r.id === selected) ?? rows[0] ?? null;

  const routing = useMemo(
    () =>
      current
        ? routingSteps({
            sentOn: current.sentOn,
            ballInCourt: current.ballInCourt === "—" ? null : current.ballInCourt,
            status: current.status,
            detailer: "Detailer",
            gc: "GC",
            holder: current.reviewer === "—" ? current.ballInCourt : current.reviewer,
            returnTo: orgName,
          })
        : [],
    [current, orgName],
  );

  const tone = current ? submittalAlertTone(current.daysOut, current.status) : null;
  const alert = tone ? alertBox(tone, dark) : null;

  return (
    <BoardReportBody>
      <LogColumn>
        <ChipBar chips={chips} active={filter} onPick={setFilter} right="Sorted by days out" />
        <LogHeader
          dark={dark}
          columns={SUBMITTAL_COLUMNS}
          labels={["Package", "Title", "Sheets", "With", `Days out · ${CONTRACT_RETURN_DAYS} d contract`, "Status"]}
        />
        <Rows>
          {rows.length === 0 ? (
            <EmptyLog what="submittal packages" />
          ) : (
            rows.map((r) => {
              const bar = daysOutBar(r.daysOut, r.status, dark);
              return (
                <LogRow
                  key={r.id}
                  columns={SUBMITTAL_COLUMNS}
                  selected={current?.id === r.id}
                  onSelect={() => setSelected(r.id)}
                  label={`Package ${r.pkg} — ${r.title}`}
                >
                  <Cell kind="id">{r.pkg}</Cell>
                  <Cell kind="clip">{r.title}</Cell>
                  <span style={{ font: `400 13px/1 ${mono}`, textAlign: "right", color: S.textSecondary }}>{r.sheets}</span>
                  <Cell>{r.ballInCourt}</Cell>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1, height: 8, background: S.track, position: "relative" }}>
                      <div style={{ height: "100%", width: bar.width, background: bar.fill }} />
                      {/* the contract-return tick sits at the midpoint because the track is scaled to 28 days */}
                      <div style={{ position: "absolute", left: "50%", top: -4, bottom: -4, width: 1, background: S.text }} />
                    </div>
                    <span style={{ font: `600 12px/1 ${mono}`, width: 30, textAlign: "right", color: bar.countColor }}>
                      {r.daysOut}d
                    </span>
                  </div>
                  <StatusBadge label={badgeLabel(r.status)} style={badgeStyle(r.status, dark)} />
                </LogRow>
              );
            })
          )}
        </Rows>
      </LogColumn>

      {current ? (
        <DetailPane dark={dark}>
          <PaneHeading
            eyebrow={<span style={{ font: `600 13px/1 ${mono}` }}>{current.pkg}</span>}
            badge={<StatusBadge label={badgeLabel(current.status)} style={badgeStyle(current.status, dark)} />}
            title={current.title}
            desc={`${current.sheets} sheet${current.sheets === 1 ? "" : "s"} · sent ${formatDay(current.sentOn)}`}
          />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ font: `600 13px/1 ${ui}`, marginBottom: 12 }}>Routing</span>
            {routing.map((step) => (
              <div
                key={step.title}
                style={{ display: "grid", gridTemplateColumns: "14px minmax(0,1fr) auto", gap: 12, alignItems: "start", paddingBottom: 14 }}
              >
                <span style={{ width: 10, height: 10, marginTop: 3, background: step.dot, border: `1.5px solid ${step.ring}` }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ font: `500 13px/1.3 ${ui}`, color: step.titleColor }}>{step.title}</span>
                  <span style={{ font: `400 12px/1.3 ${ui}`, color: S.textMuted }}>{step.who}</span>
                </div>
                <span style={{ font: `400 12px/1.3 ${mono}`, color: step.dateColor }}>{step.date}</span>
              </div>
            ))}
          </div>
          {alert ? (
            <div style={{ padding: "14px 16px", background: alert.background, border: alert.border, display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ font: `600 13px/1.3 ${ui}`, color: alert.titleColor }}>
                {current.status === "LATE"
                  ? `${current.daysOut - CONTRACT_RETURN_DAYS} days past contract return`
                  : current.status === "R&R"
                    ? "Awaiting resubmittal"
                    : `Return due in ${CONTRACT_RETURN_DAYS - current.daysOut} days`}
              </span>
              <span style={{ font: `400 13px/1.45 ${ui}`, color: S.textSecondary, textWrap: "pretty" }}>
                Held by {current.ballInCourt}.
              </span>
            </div>
          ) : null}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <PaneButton dark={dark} href="/Submittals">Open package</PaneButton>
            <PaneButton dark={dark} variant="secondary">Send reminder</PaneButton>
          </div>
        </DetailPane>
      ) : (
        <EmptyPane what="a package" />
      )}
    </BoardReportBody>
  );
}

/* ─── 2c · RFI Log ───────────────────────────────────────────────────────── */

const RFI_COLUMNS = "96px minmax(0,1fr) 64px 92px 60px 48px 84px";

/**
 * The design's held sheets, as mono chips.
 *
 * Three answers, and the third is the one that matters. A sheet list is a
 * claim about what is blocked, so when the register read did not carry
 * `linked_rfi_ids` at all this says the linkage is unavailable rather than
 * printing an empty row that reads as "nothing is held". Those look identical
 * on screen and mean opposite things to a PM deciding whether steel can run.
 */
function HeldSheetChips({
  rfiNumber,
  rows,
  dark,
}: {
  rfiNumber: string;
  rows: RegisterRow[];
  dark: boolean;
}) {
  const S = dark ? DC_DARK : DC_LIGHT;
  const held = useMemo(() => heldSheetsForRfi(rfiNumber, rows), [rfiNumber, rows]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ font: `600 12px/1 ${ui}`, color: S.textMuted }}>Sheets held</span>
      {!held.known ? (
        <span style={{ font: `400 12px/1.4 ${ui}`, color: S.textMuted }}>
          Sheet linkage not available in this register read.
        </span>
      ) : held.sheets.length === 0 ? (
        <span style={{ font: `400 12px/1.4 ${ui}`, color: S.textMuted }}>
          No sheet names this RFI.
        </span>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {held.sheets.map((sheet) => (
            <span
              key={sheet}
              style={{
                font: `500 11px/1 ${mono}`,
                padding: "4px 6px",
                background: S.badgeNeutralBg,
                border: `1px solid ${S.badgeNeutralBorder}`,
                color: S.badgeNeutralFg,
              }}
            >
              {sheet}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function RfiScreen({ data, orgName }: { data: BoardReportData; orgName: string }) {
  const { skin: S, dark } = useSkin();
  const [filter, setFilter] = useState("Open");
  const [selected, setSelected] = useState<string | null>(null);

  const chips = ["Open", "Past due", "Fab hold", "All"];
  // Both read canonical sources: `open` comes from isRfiOpen, past-due from
  // the same predicate the due-date colour uses, so filter and colour agree.
  const isOpen = (r: RfiRow) => r.open;
  const matches = (r: RfiRow) =>
    filter === "All" ||
    (filter === "Open" && isOpen(r)) ||
    (filter === "Past due" && isOpen(r) && isPastDue(r.dueOn, data.today)) ||
    (filter === "Fab hold" && r.impact === "Fab hold");

  const rows = data.rfis.rows.filter(matches);
  const current = rows.find((r) => r.id === selected) ?? rows[0] ?? null;

  return (
    <BoardReportBody>
      <LogColumn>
        <ChipBar
          chips={chips}
          active={filter}
          onPick={setFilter}
          right={`Showing ${rows.length.toLocaleString()} of ${data.rfis.rows.length.toLocaleString()}`}
        />
        <LogHeader dark={dark} columns={RFI_COLUMNS} labels={["RFI", "Subject", "Ref", "With", "Due", "Open", "Impact"]} />
        <Rows>
          {rows.length === 0 ? (
            <EmptyLog what="RFIs" />
          ) : (
            rows.map((r) => {
              const pill = impactPill(r.impact, dark);
              return (
                <LogRow
                  key={r.id}
                  columns={RFI_COLUMNS}
                  selected={current?.id === r.id}
                  onSelect={() => setSelected(r.id)}
                  label={`${r.number} — ${r.subject}`}
                >
                  <Cell kind="id">{r.number}</Cell>
                  <Cell kind="clip">{r.subject}</Cell>
                  <Cell kind="mono">{r.ref}</Cell>
                  <Cell>{r.ballInCourt}</Cell>
                  <span style={{ font: `500 12px/1 ${mono}`, color: dueDateColor(r.dueOn, data.today, dark) }}>
                    {formatShortDay(r.dueOn)}
                  </span>
                  <span style={{ font: `500 12px/1 ${mono}`, textAlign: "right", color: S.textSecondary }}>{r.daysOpen}d</span>
                  <span
                    style={{
                      justifySelf: "start",
                      font: `600 11px/1 ${ui}`,
                      padding: "4px 7px",
                      borderRadius: 3,
                      color: pill.color,
                      background: pill.background,
                    }}
                  >
                    {r.impact}
                  </span>
                </LogRow>
              );
            })
          )}
        </Rows>
      </LogColumn>

      {current ? (
        <DetailPane gap={18} dark={dark}>
          <PaneHeading
            eyebrow={<span style={{ font: `600 13px/1 ${mono}` }}>{current.number}</span>}
            badge={
              <span
                style={{
                  font: `600 11px/1 ${ui}`,
                  padding: "4px 7px",
                  borderRadius: 3,
                  color: impactPill(current.impact, dark).color,
                  background: impactPill(current.impact, dark).background,
                }}
              >
                {current.impact}
              </span>
            }
            title={current.subject}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", font: `400 12px/1.3 ${ui}`, color: S.textMuted }}>
            <span>{current.ballInCourt}</span>
            <span style={{ fontFamily: mono, color: dueDateColor(current.dueOn, data.today, dark) }}>
              Open {current.daysOpen}d · due {formatDay(current.dueOn)}
            </span>
          </div>
          {current.question ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: `1px solid ${S.rowBorder}`, paddingTop: 14 }}>
              <span style={{ font: `600 12px/1 ${ui}`, color: S.textMuted }}>Question</span>
              <span style={{ font: `400 13px/1.5 ${ui}`, textWrap: "pretty" }}>{current.question}</span>
            </div>
          ) : null}
          {current.proposedSolution ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {/* The comps label this with a literal company name; it reads from the signed-in org instead. */}
              <span style={{ font: `600 12px/1 ${ui}`, color: S.textMuted }}>{orgName} proposed solution</span>
              <span style={{ font: `400 13px/1.5 ${ui}`, textWrap: "pretty" }}>{current.proposedSolution}</span>
            </div>
          ) : null}
          <HeldSheetChips rfiNumber={current.number} rows={data.register.rows} dark={dark} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <PaneButton dark={dark} href="/RFIs">Open RFI</PaneButton>
            <PaneButton dark={dark} variant="secondary">Send reminder</PaneButton>
          </div>
        </DetailPane>
      ) : (
        <EmptyPane what="an RFI" />
      )}
    </BoardReportBody>
  );
}

/* ─── 2d · Transmittals ──────────────────────────────────────────────────── */

/**
 * The design's six columns, Sheets included.
 *
 * This column shipped missing: the count lives in `drawing_transmittal_items`,
 * which the page did not read, so it could only ever have printed an em dash.
 * `useBoardReportData` now reads that table, so the column carries a real
 * number — and `null` while the read is in flight, which prints as a dash
 * rather than a 0 no transmittal has ever had.
 */
const XM_COLUMNS = "112px minmax(0,1.25fr) minmax(0,1fr) 52px 92px 112px";

/**
 * The design's contents list: sheet number, revision, title, one row each.
 *
 * Three different states, and they are not the same answer. A null count means
 * the contents read has not landed, so the list says so rather than rendering
 * an empty block that reads as "nothing was sent" — a transmittal with no
 * sheets is a thing that does not happen, so showing one would be a lie about
 * data we simply do not have yet.
 */
function TransmittalContents({ row, dark }: { row: TransmittalRow; dark: boolean }) {
  const S = dark ? DC_DARK : DC_LIGHT;
  const unknown = row.sheetCount === null;
  return (
    <div style={{ display: "flex", flexDirection: "column", borderTop: `1px solid ${S.rowBorder}`, paddingTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <span style={{ font: `600 13px/1 ${ui}` }}>Contents</span>
        <span style={{ font: `400 12px/1 ${mono}`, color: S.textMuted }}>
          {unknown ? "—" : `${row.sheetCount} sheet${row.sheetCount === 1 ? "" : "s"}`}
        </span>
      </div>
      {unknown ? (
        <span style={{ font: `400 12px/1.4 ${ui}`, color: S.textMuted }}>Sheet list not loaded.</span>
      ) : row.contents.length === 0 ? (
        <span style={{ font: `400 12px/1.4 ${ui}`, color: S.textMuted }}>
          No sheets are recorded against this transmittal.
        </span>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {row.contents.map((item) => (
            <div
              key={item.id}
              style={{
                display: "grid",
                gridTemplateColumns: "52px 40px minmax(0,1fr)",
                gap: 8,
                alignItems: "baseline",
                padding: "7px 0",
                borderBottom: `1px solid ${S.hairline}`,
              }}
            >
              <span style={{ font: `500 12px/1.3 ${mono}` }}>{item.sheet}</span>
              <span style={{ font: `400 12px/1.3 ${mono}`, color: S.textMuted }}>{item.rev}</span>
              <span
                style={{
                  font: `400 12px/1.3 ${ui}`,
                  color: S.textSecondary,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={item.title}
              >
                {item.title}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TransmittalsScreen({ data }: { data: BoardReportData }) {
  const { skin: S, dark } = useSkin();
  const [filter, setFilter] = useState("All");
  const [selected, setSelected] = useState<string | null>(null);

  const chips = ["All", "Awaiting ack", "Overdue"];
  const stateOf = (r: TransmittalRow) => ackState(r.acknowledged, r.hoursWaiting);
  const matches = (r: TransmittalRow) =>
    filter === "All" ||
    (filter === "Awaiting ack" && stateOf(r) !== "acknowledged") ||
    (filter === "Overdue" && stateOf(r) === "overdue");

  const rows = data.transmittals.rows.filter(matches);
  const current = rows.find((r) => r.id === selected) ?? rows[0] ?? null;

  return (
    <BoardReportBody>
      <LogColumn>
        <ChipBar chips={chips} active={filter} onPick={setFilter} right="Newest first" />
        <LogHeader dark={dark} columns={XM_COLUMNS} labels={["Transmittal", "To", "Purpose", "Sheets", "Sent", "Acknowledged"]} />
        <Rows>
          {rows.length === 0 ? (
            <EmptyLog what="transmittals" />
          ) : (
            rows.map((r) => {
              const state = stateOf(r);
              return (
                <LogRow
                  key={r.id}
                  columns={XM_COLUMNS}
                  selected={current?.id === r.id}
                  onSelect={() => setSelected(r.id)}
                  label={`Transmittal ${r.number} to ${r.recipient}`}
                >
                  <Cell kind="id">{r.number}</Cell>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                    <span style={{ font: `500 13px/1.2 ${ui}` }}>{r.recipient}</span>
                    <span style={{ font: `400 12px/1.2 ${ui}`, color: S.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.contact}
                    </span>
                  </div>
                  <Cell kind="clip">{r.purpose}</Cell>
                  {/* null is "contents not read yet", never 0. */}
                  <Cell kind="mono">{r.sheetCount ?? "—"}</Cell>
                  <Cell kind="mono">{formatShortDay(r.sentOn)}</Cell>
                  <span style={{ font: `600 12px/1.3 ${mono}`, color: ackColor(state, dark) }}>
                    {/* acknowledgedOn, not sentOn — any acknowledgement that
                        was not same-day showed the transmission date. */}
                    {state === "acknowledged" ? formatShortDay(r.acknowledgedOn) : `Waiting ${r.hoursWaiting ?? 0}h`}
                  </span>
                </LogRow>
              );
            })
          )}
        </Rows>
      </LogColumn>

      {current ? (
        (() => {
          const state = stateOf(current);
          const badge = ACK_BADGE[state];
          const box = alertBox(state === "acknowledged" ? "ok" : state === "overdue" ? "late" : "warn", dark);
          return (
            <DetailPane dark={dark}>
              <PaneHeading
                eyebrow={<span style={{ font: `600 13px/1 ${mono}` }}>{current.number}</span>}
                badge={<StatusBadge label={badge.label} style={badgeStyle(badge.status, dark)} />}
                title={`${current.purpose} — ${current.recipient}`}
                desc={`Sent ${formatDay(current.sentOn)}${current.contact ? ` · to ${current.contact}` : ""}`}
              />
              <TransmittalContents row={current} dark={dark} />
              {current.supersedes.length > 0 ? (
                <div style={{ padding: "14px 16px", background: S.wellBg, border: `1px solid ${S.wellBorder}`, display: "flex", flexDirection: "column", gap: 8 }}>
                  <span style={{ font: `600 13px/1.3 ${ui}` }}>
                    Supersedes {current.supersedes.length} earlier revision{current.supersedes.length === 1 ? "" : "s"}
                  </span>
                  <span style={{ font: `400 12px/1.45 ${ui}`, color: S.textSecondary, textWrap: "pretty" }}>
                    The recipient still holds these. Confirm they are pulled from the field.
                  </span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {current.supersedes.map((item) => (
                      <span
                        key={item.id}
                        style={{
                          font: `500 11px/1 ${mono}`,
                          padding: "4px 6px",
                          background: S.paneBg,
                          border: `1px solid ${S.controlBorder}`,
                          color: S.textSecondary,
                        }}
                      >
                        {item.sheet} Rev {item.rev}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <div style={{ padding: "14px 16px", background: box.background, border: box.border, display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ font: `600 13px/1.3 ${ui}`, color: box.titleColor }}>
                  {state === "acknowledged"
                    ? `Acknowledged ${formatDay(current.acknowledgedOn)}`
                    : `Not acknowledged after ${humanizeWait(current.hoursWaiting ?? 0)}`}
                </span>
                <span style={{ font: `400 13px/1.45 ${ui}`, color: S.textSecondary, textWrap: "pretty" }}>
                  {state === "acknowledged"
                    ? current.acknowledgedBy
                      ? `By ${current.acknowledgedBy}.`
                      : "Receipt confirmed."
                    : `Sent to ${current.recipient}. No confirmation of receipt yet.`}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <PaneButton dark={dark} href="/Documents">Open set</PaneButton>
                <PaneButton dark={dark} variant="secondary">Resend &amp; notify</PaneButton>
              </div>
            </DetailPane>
          );
        })()
      ) : (
        <EmptyPane what="a transmittal" />
      )}
    </BoardReportBody>
  );
}

/* ─── 1c · Brief ─────────────────────────────────────────────────────────── */

/**
 * The design's matrix is job x ERECTION SEQUENCE. `drawings` carries no
 * sequence column — not under that name nor any other — so those five columns
 * cannot be filled from real data. An earlier pass bucketed sheets by
 * `index % 5`, which produced a grid that looked like sequence release state
 * and was actually array position: the worst kind of wrong, because it reads
 * as authoritative.
 *
 * The axis is therefore the state vocabulary, which IS real: each cell counts
 * the sheets of a set sitting in that state. Same grid, same badge colors,
 * same at-a-glance read of where a set has got to. Give `drawings` a sequence
 * column and this goes back to the design's own axis unchanged.
 */
const MATRIX_STATES: DcStatus[] = ["REL", "REV", "R&R", "HOLD", "DET"];

export function BriefScreen({ data }: { data: BoardReportData }) {
  const { skin: S, dark } = useSkin();
  const sets = useMemo(() => {
    const bySet = new Map<string, RegisterRow[]>();
    for (const row of data.register.rows) {
      const list = bySet.get(row.setName) ?? [];
      list.push(row);
      bySet.set(row.setName, list);
    }
    return [...bySet.entries()]
      .map(([name, rows]) => {
        const released = rows.filter((r) => r.status === "REL").length;
        const counts = MATRIX_STATES.map((state) =>
          state === "DET"
            ? rows.filter((r) => r.status === "DET" || r.status === "NONE").length
            : rows.filter((r) => r.status === state).length,
        );
        return { name, rows, released, counts, pct: releasedPct(released, rows.length) };
      })
      .sort((a, b) => b.rows.length - a.rows.length);
  }, [data.register.rows]);

  const bic = useMemo(() => {
    const counts = new Map<string, number>();
    // The caption below reads "open", so terminal records must not be counted.
    // Answered, Closed and Void RFIs keep their ball_in_court, and counting
    // them made this bar disagree with the Brief's own open-RFI metric.
    for (const r of data.rfis.rows) {
      if (!r.open || r.ballInCourt === "—") continue;
      counts.set(r.ballInCourt, (counts.get(r.ballInCourt) ?? 0) + 1);
    }
    for (const sub of data.submittals.rows) {
      if (sub.status === "REL" || sub.status === "NONE" || sub.ballInCourt === "—") continue;
      counts.set(sub.ballInCourt, (counts.get(sub.ballInCourt) ?? 0) + 1);
    }
    return bicSlices(
      [...counts.entries()].map(([party, count]) => ({ party, count })).sort((a, b) => b.count - a.count),
      dark,
    );
  }, [data.rfis.rows, data.submittals.rows, dark]);

  const decisions = useMemo(
    () =>
      [...data.rfis.rows]
        .filter((r) => r.open && (r.impact === "Fab hold" || r.impact === "Cost"))
        .sort((a, b) => b.daysOpen - a.daysOpen)
        .slice(0, 4),
    [data.rfis.rows],
  );

  const legend: DcStatus[] = ["REL", "REV", "R&R", "HOLD", "DET", "NONE"];

  return (
    <BoardReportBody wide>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ font: `600 20px/1 ${ui}` }}>Release matrix</span>
          <span style={{ font: `400 13px/1 ${ui}`, color: S.textMuted }}>Drawing set × state</span>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `minmax(0,1.9fr) repeat(${MATRIX_STATES.length},minmax(0,1fr)) 60px`,
            gap: 4,
            font: `500 12px/1 ${ui}`,
            color: S.textMuted,
            paddingBottom: 4,
          }}
        >
          <span>Drawing set</span>
          {MATRIX_STATES.map((state) => (
            <span key={state} style={{ textAlign: "center" }}>
              {matrixLegendText(state)}
            </span>
          ))}
          <span style={{ textAlign: "right" }}>Rel.</span>
        </div>
        {sets.length === 0 ? (
          <EmptyLog what="drawing sets" />
        ) : (
          sets.map((s) => (
            <div
              key={s.name}
              style={{
                display: "grid",
                gridTemplateColumns: `minmax(0,1.9fr) repeat(${MATRIX_STATES.length},minmax(0,1fr)) 60px`,
                gap: 4,
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, paddingRight: 8 }}>
                <span style={{ font: `600 14px/1.2 ${ui}`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {s.name}
                </span>
                <span style={{ font: `400 11px/1 ${mono}`, color: S.textMuted }}>{plural(s.rows.length, "sheet")}</span>
              </div>
              {s.counts.map((count, i) => {
                // An empty state reads as the dashed "not started" cell rather
                // than as a zero, which would imply the state was measured.
                const cell = matrixCell(count === 0 ? "NONE" : MATRIX_STATES[i], dark);
                return (
                  <div
                    key={MATRIX_STATES[i]}
                    title={`${count} ${matrixLegendText(MATRIX_STATES[i]).toLowerCase()}`}
                    style={{
                      height: 44,
                      display: "grid",
                      placeItems: "center",
                      font: `600 11px/1 ${mono}`,
                      background: cell.style.bg,
                      color: cell.style.fg,
                      border: cell.style.border,
                    }}
                  >
                    {count === 0 ? "—" : count}
                  </div>
                );
              })}
              <span style={{ font: `600 15px/1 ${mono}`, textAlign: "right" }}>{s.pct}</span>
            </div>
          ))
        )}
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", paddingTop: 6 }}>
          {legend.map((st) => (
            <div key={st} style={{ display: "flex", alignItems: "center", gap: 7, font: `400 12px/1 ${ui}`, color: S.textSecondary }}>
              <StatusBadge label={badgeLabel(st)} style={badgeStyle(st, dark)} />
              {matrixLegendText(st)}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 10 }}>
          <span style={{ font: `600 20px/1 ${ui}` }}>Needs a decision</span>
          <span style={{ font: `400 13px/1 ${ui}`, color: S.textMuted }}>Longest open, highest impact</span>
        </div>
        {decisions.length === 0 ? (
          <span style={{ font: `400 13px/1.5 ${ui}`, color: S.textMuted, padding: "16px 0" }}>
            Nothing is holding fabrication or carrying cost right now.
          </span>
        ) : (
          decisions.map((d, i) => (
            <div key={d.id} style={{ display: "grid", gridTemplateColumns: "44px minmax(0,1fr)", gap: 14, padding: "16px 0", borderTop: `1px solid ${S.wellBorder}` }}>
              <span style={{ font: `300 32px/1 ${ui}`, fontStretch: "80%", color: S.rankNumber }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ font: `600 15px/1.3 ${ui}` }}>{d.subject}</span>
                <span style={{ font: `400 13px/1.45 ${ui}`, color: S.textSecondary }}>{d.question || "No question recorded."}</span>
                <div style={{ display: "flex", gap: 12, alignItems: "center", font: `400 12px/1 ${ui}`, color: S.textMuted, flexWrap: "wrap" }}>
                  <span style={{ font: `500 11px/1 ${mono}` }}>{d.number}</span>
                  <span>
                    {d.ballInCourt} · {d.daysOpen} days open
                  </span>
                  <span
                    style={{
                      marginLeft: "auto",
                      font: `600 11px/1 ${ui}`,
                      padding: "4px 8px",
                      borderRadius: 3,
                      color: impactPill(d.impact, dark).color,
                      background: impactPill(d.impact, dark).background,
                    }}
                  >
                    {d.impact}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
        <div style={{ paddingTop: 18, borderTop: `1px solid ${S.wellBorder}`, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", font: `500 13px/1 ${ui}` }}>
            <span>Ball in court</span>
            <span style={{ color: S.textMuted }}>
              {bic.reduce((n, b) => n + b.count, 0)} open
            </span>
          </div>
          <div style={{ display: "flex", height: 12, gap: 2 }}>
            {bic.map((b) => (
              <div key={b.party} style={{ height: "100%", width: b.share, background: b.color }} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {bic.map((b) => (
              <span key={b.party} style={{ font: `400 12px/1 ${ui}`, color: S.textSecondary, display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ width: 8, height: 8, background: b.color }} />
                {b.party} <span style={{ font: `500 12px ${mono}`, color: S.text }}>{b.count}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </BoardReportBody>
  );
}

/** "1 sheet" / "2 sheets" — a count and its noun agreeing. */
export function plural(n: number, noun: string): string {
  return `${n.toLocaleString()} ${noun}${n === 1 ? "" : "s"}`;
}

function matrixLegendText(status: DcStatus): string {
  return {
    REL: "Released",
    REV: "In review",
    "R&R": "Revise & resubmit",
    LATE: "Return overdue",
    DET: "Detailing",
    HOLD: "Fab hold",
    NONE: "Not started",
  }[status];
}

export type { CalendarDay };
