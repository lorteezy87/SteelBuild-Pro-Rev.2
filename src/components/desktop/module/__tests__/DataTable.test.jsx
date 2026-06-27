// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import DataTable from "@/components/desktop/module/DataTable";

const COLS = [
  { key: "num", label: "RFI #" },
  { key: "subject", label: "Subject" },
  { key: "days", label: "Days", align: "num" },
  { key: "status", label: "Status", render: (r) => <em>{r.status}</em> },
];

describe("DataTable", () => {
  it("renders headers and rows", () => {
    const rows = [{ id: 1, num: "RFI-129", subject: "Beam", days: 4, status: "Open" }];
    const { getByText } = render(<DataTable columns={COLS} rows={rows} rowKey="id" />);
    expect(getByText("RFI #")).toBeTruthy();
    expect(getByText("RFI-129")).toBeTruthy();
    expect(getByText("Open")).toBeTruthy(); // via render()
  });
  it("shows the empty state when no rows", () => {
    const { getByText } = render(<DataTable columns={COLS} rows={[]} rowKey="id" emptyMessage="No RFIs." />);
    expect(getByText("No RFIs.")).toBeTruthy();
  });
  it("shows a loading skeleton when loading", () => {
    const { container } = render(<DataTable columns={COLS} rows={[]} rowKey="id" loading />);
    expect(container.querySelector(".desk-skeleton")).toBeTruthy();
  });
});
