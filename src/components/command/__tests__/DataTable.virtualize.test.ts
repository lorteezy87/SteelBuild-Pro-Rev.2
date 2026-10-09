// @vitest-environment jsdom
import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import {
  DataTable,
  DATA_TABLE_VIRTUALIZE_THRESHOLD,
  shouldVirtualizeDataTable,
} from "../DataTable";

// jsdom does not measure a scroll viewport; expose the first virtual row so
// this test can check the table's header and body together.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: () => ({
    getTotalSize: () => 4545,
    getVirtualItems: () => [{ index: 0, start: 0 }],
    measureElement: () => {},
  }),
}));

describe("shouldVirtualizeDataTable", () => {
  it("uses the shared 100-row threshold by default", () => {
    expect(DATA_TABLE_VIRTUALIZE_THRESHOLD).toBe(100);
    expect(shouldVirtualizeDataTable(100)).toBe(false);
    expect(shouldVirtualizeDataTable(101)).toBe(true);
    expect(shouldVirtualizeDataTable(0)).toBe(false);
  });

  it("honors a custom threshold", () => {
    expect(shouldVirtualizeDataTable(50, 40)).toBe(true);
    expect(shouldVirtualizeDataTable(40, 40)).toBe(false);
  });
});

describe("virtual DataTable viewport", () => {
  it("keeps wide headers and rows in one keyboard-scrollable region above 100 rows", () => {
    const rows = Array.from({ length: 101 }, (_, index) => ({
      id: String(index),
      description: `Load ${index}`,
    }));
    const columns = Array.from({ length: 8 }, (_, index) => ({
      key: `field-${index}`,
      header: `Column ${index}`,
      grid: index === 0 ? "minmax(220px, 2fr)" : index === 1 ? "126px" : undefined,
      render: (row: (typeof rows)[number]) => `${row.description} field ${index}`,
    }));

    render(createElement("div", { style: { width: 390 } }, createElement(DataTable, { columns, rows })));

    const scrollRegion = screen.getByRole("region", { name: "Scrollable table columns" });
    expect(scrollRegion.tabIndex).toBe(0);
    expect(scrollRegion.style.overflowX).toBe("auto");
    const sharedWidth = scrollRegion.firstElementChild as HTMLElement;
    expect(sharedWidth.style.width).toBe("max-content");
    expect(sharedWidth.style.minWidth).toBe("max(100%, 954px)");
    expect(sharedWidth.contains(screen.getByText("Column 0"))).toBe(true);
    expect(sharedWidth.contains(screen.getByText("Load 0 field 7"))).toBe(true);
    const header = sharedWidth.firstElementChild as HTMLElement;
    const body = sharedWidth.lastElementChild as HTMLElement;
    expect(header.style.overflowY).toBe("auto");
    expect(header.style.scrollbarGutter).toBe("stable");
    expect(body.style.scrollbarGutter).toBe("stable");
  });
});
