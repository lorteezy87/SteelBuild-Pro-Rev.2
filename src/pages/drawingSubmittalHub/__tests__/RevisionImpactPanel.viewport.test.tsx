// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import RevisionImpactPanel from "../RevisionImpactPanel";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: () => ({
    getTotalSize: () => 101 * 49,
    getVirtualItems: () => [{ index: 0, start: 0 }],
    measureElement: () => {},
  }),
}));

describe("Revision Impact virtual board viewport", () => {
  it("keeps every evidence column and Compare reachable when the board virtualizes", () => {
    const onCompareRevision = vi.fn();
    const rows = Array.from({ length: 101 }, (_, index) => ({
      revisionId: `rev-${index}`,
      drawingId: `drawing-${index}`,
      sheetNumber: `S-${index}`,
      setName: "Main steel",
      revisionCode: "B",
      severity: "high",
      wpNames: ["WP-01"],
      rfiCount: 1,
      openRfiCount: 1,
    }));

    render(<RevisionImpactPanel rows={rows} onCompareRevision={onCompareRevision} />);

    const scroller = screen.getByRole("region", { name: "Revision impact columns" }) as HTMLDivElement;
    const header = scroller.firstElementChild as HTMLDivElement;
    const body = header.nextElementSibling as HTMLDivElement;
    const row = body.querySelector<HTMLDivElement>("[data-index='0']");

    expect(scroller.style.overflowX).toBe("auto");
    expect(scroller.tabIndex).toBe(0);
    expect(header.style.minWidth).toBe(body.style.minWidth);
    expect(header.style.gridTemplateColumns).toBe(row?.style.gridTemplateColumns);
    expect(header.style.scrollbarGutter).toBe("stable");
    expect(body.style.scrollbarGutter).toBe("stable");
    expect(screen.getByText("Linked Work Package")).toBeInTheDocument();
    expect(screen.getByText("Model mapping")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    expect(onCompareRevision).toHaveBeenCalledWith("drawing-0");
  });
});
