// @vitest-environment jsdom
import type { ComponentType } from "react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CALENDAR } from "@/lib/schedule/workingCalendar";
import { deriveDelays, deriveReadiness, READINESS_CATEGORY } from "@/lib/fieldOversight";
import type { ScheduleTaskLike } from "@/lib/fieldOversight";
import { DailyCoverage } from "../DailyCoverage";
import { FieldGatePanel } from "../FieldGatePanel";
import DailyLogsListRaw from "@/components/fieldops/DailyLogsList";

vi.mock("@/api/supabaseClient", () => ({ entities: {
  ActionItem: { filter: vi.fn().mockResolvedValue([]), list: vi.fn().mockResolvedValue([]) },
  RFI: { filter: vi.fn().mockResolvedValue([]), list: vi.fn().mockResolvedValue([]) },
} }));

// jsdom has no canvas; the ring draws nothing but must not throw.
HTMLCanvasElement.prototype.getContext = ((): null => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;

const FRI = "2026-10-23";
const erection: ScheduleTaskLike = { id: "e1", task_name: "Set Seq 1 columns", phase: "Installation", status: "In Progress", start_date: "2026-10-19", end_date: FRI };

describe("DailyCoverage", () => {
  it("lists field days without a daily and files the chosen day", async () => {
    const onFile = vi.fn();
    render(<DailyCoverage ready tasks={[erection]} deliveries={[]} logs={[{ id: "l", date: "2026-10-19" }]} today="2026-10-21" calendar={DEFAULT_CALENDAR} onFile={onFile} />);
    expect(screen.getByRole("heading", { name: "1 field day without a daily report" })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: /File the daily report for Tue, Oct 20/ }));
    expect(onFile).toHaveBeenCalledWith("2026-10-20");
  });

  it("claims nothing until the schedule has loaded", () => {
    const { container } = render(<DailyCoverage ready={false} tasks={[erection]} deliveries={[]} logs={[]} today="2026-10-21" calendar={DEFAULT_CALENDAR} onFile={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("FieldGatePanel", () => {
  const readiness = deriveReadiness([{ id: "r1", category: READINESS_CATEGORY, title: "Site readiness — Seq 2", due_date: "2026-10-26", metadata: { site_readiness: { version: 1, sequence: "Seq 2", marks: {} } } }], []);
  const delays = deriveDelays([{ id: "d1", cr_number: "CR-004", reason: "Delay / standby", request_date: "2026-10-21", metadata: { delay_log: { cause: "steel" } } }]);

  function renderPanel(overrides: Partial<Parameters<typeof FieldGatePanel>[0]> = {}) {
    return render(
      <MemoryRouter>
        <FieldGatePanel project={{ name: "Madison" }} readiness={readiness} delays={delays} tasks={[erection]} deliveries={[]} logs={[]}
          weather={null} calendar={DEFAULT_CALENDAR} today={FRI} noticeWindowDays={2} {...overrides} />
      </MemoryRouter>,
    );
  }

  it("lists readiness and notice findings as actionable rows", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: /critical Seq 2 mobilizes in 1 working day/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /CR-004 — written notice due today/ })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThanOrEqual(2);
  });

  it("says the forecast is unknown rather than implying clear weather", () => {
    renderPanel();
    expect(screen.getByText("Forecast unavailable — weather not checked")).toBeInTheDocument();
  });

  it("shows a clear gate when nothing is outstanding", () => {
    renderPanel({ readiness: [], delays: [], tasks: [], logs: [], weather: [] });
    expect(screen.getByText(/No field findings/)).toBeInTheDocument();
    expect(screen.queryByText(/Forecast unavailable/)).not.toBeInTheDocument();
  });

  it("opens a paste-ready field brief", async () => {
    renderPanel();
    await userEvent.setup().click(screen.getByRole("button", { name: "Field brief" }));
    const box = screen.getByRole("textbox", { name: "Field brief text" }) as HTMLTextAreaElement;
    expect(box.value).toContain("FIELD BRIEF — Madison");
    expect(box.value).toContain("[RD] Seq 2 mobilizes");
  });
});

type Log = { id: string; project_id: string; date: string; delays?: string; delay_hours?: number; photos: string[] };
type ListProps = { logs: Log[]; onCopy?: ((log: Log) => void) | null; onLogDelay?: ((log: Log) => void) | null };
const DailyLogsList = DailyLogsListRaw as unknown as ComponentType<ListProps>;

describe("DailyLogsList field actions", () => {
  it("offers Log as delay only on a log that recorded a delay", async () => {
    const onCopy = vi.fn();
    const onLogDelay = vi.fn();
    const quiet: Log = { id: "a", project_id: "p", date: "2026-10-20", photos: [] };
    const late: Log = { id: "b", project_id: "p", date: "2026-10-21", delays: "Steel truck 4 hours late", delay_hours: 4, photos: [] };
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><DailyLogsList logs={[quiet, late]} onCopy={onCopy} onLogDelay={onLogDelay} /></QueryClientProvider>);
    expect(screen.getAllByRole("button", { name: /Log a delay from the daily/ })).toHaveLength(1);
    await userEvent.setup().click(screen.getByRole("button", { name: /Log a delay from the daily/ }));
    expect(onLogDelay).toHaveBeenCalledWith(late);
    expect(screen.getAllByRole("button", { name: /Copy daily report/ })).toHaveLength(2);
  });
});
