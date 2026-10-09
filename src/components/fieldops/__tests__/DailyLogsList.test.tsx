// @vitest-environment jsdom
import type { ComponentType } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import DailyLogsListRaw from "../DailyLogsList";

vi.mock("@/api/supabaseClient", () => ({ entities: {
  ActionItem: { filter: vi.fn().mockResolvedValue([]), list: vi.fn().mockResolvedValue([]) },
  RFI: { filter: vi.fn().mockResolvedValue([]), list: vi.fn().mockResolvedValue([]) },
} }));

const log = { id: "log-1", project_id: "project-1", date: "2026-10-07", crew_name: "North crew", headcount: 6, hours_worked: 8, activities: "Erect north frame", photos: [] as string[], delay_hours: 0 };
type Log = typeof log;
type ListProps = { logs: Log[]; onEdit?: ((log: Log) => void) | null; onDelete?: ((log: Log) => void) | null };
const DailyLogsList = DailyLogsListRaw as ComponentType<ListProps>;
function renderList(props: Partial<ListProps> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><DailyLogsList logs={[log]} {...props} /></QueryClientProvider>);
}

describe("DailyLogsList row controls", () => {
  it("expands and collapses the daily record with keyboard controls", async () => {
    const user = userEvent.setup();
    renderList();
    const summary = screen.getByRole("button", { name: /^Daily log for.*North crew/i });
    await user.tab();
    expect(summary).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(summary).toHaveAttribute("aria-expanded", "true");
    const details = document.getElementById(summary.getAttribute("aria-controls")!);
    expect(details).not.toBeNull();
    expect(within(details!).getByText("Erect north frame")).toBeVisible();
    await user.keyboard(" ");
    expect(summary).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Erect north frame")).not.toBeInTheDocument();
  });

  it("calls the supplied edit/delete callbacks for the exact row without toggling details", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    renderList({ onEdit, onDelete });
    const summary = screen.getByRole("button", { name: /^Daily log for.*North crew/i });
    await user.tab();
    await user.tab();
    expect(screen.getByRole("button", { name: /Edit daily log.*North crew/i })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onEdit).toHaveBeenCalledExactlyOnceWith(log);
    await user.tab();
    expect(screen.getByRole("button", { name: /Delete daily log.*North crew/i })).toHaveFocus();
    await user.keyboard(" ");
    expect(onDelete).toHaveBeenCalledExactlyOnceWith(log);
    expect(summary).toHaveAttribute("aria-expanded", "false");
  });

  it("does not invent edit or delete authority when the parent omits callbacks", () => {
    renderList({ onEdit: null, onDelete: null });
    expect(screen.queryByRole("button", { name: /Edit daily log/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Delete daily log/i })).not.toBeInTheDocument();
  });

  it("honors edit and delete permissions independently", () => {
    const view = renderList({ onEdit: vi.fn(), onDelete: null });
    expect(screen.getByRole("button", { name: /Edit daily log/i })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Delete daily log/i })).not.toBeInTheDocument();
    view.unmount();
    renderList({ onEdit: null, onDelete: vi.fn() });
    expect(screen.queryByRole("button", { name: /Edit daily log/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Delete daily log/i })).toBeVisible();
  });

  it("keeps actions bound to the selected row when several crews are visible", async () => {
    const user = userEvent.setup();
    const southLog = { ...log, id: "log-2", crew_name: "South crew", activities: "Bolt south frame" };
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    renderList({ logs: [log, southLog], onEdit, onDelete });
    const summary = screen.getByRole("button", { name: /^Daily log for.*South crew/i });
    await user.click(summary);
    await user.click(screen.getByText("Bolt south frame"));
    expect(summary).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("button", { name: /Edit daily log.*South crew/i }));
    expect(onEdit).toHaveBeenCalledExactlyOnceWith(southLog);
    await user.click(screen.getByRole("button", { name: /Delete daily log.*South crew/i }));
    expect(onDelete).toHaveBeenCalledExactlyOnceWith(southLog);
    expect(summary).toHaveAttribute("aria-expanded", "true");
  });
});
