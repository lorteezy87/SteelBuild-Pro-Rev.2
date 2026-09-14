// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import type { ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";
import { BulkActionBar } from "@/components/design-system";
import RfiDetailModal from "../RfiDetailModal";
import RfiTable from "../RfiTable";

type TestBulkActionBarProps = {
  count: number;
  onClear: () => void;
  actions: Array<{ label: string; variant: string; onClick: () => void }>;
};

const TestBulkActionBar = BulkActionBar as unknown as ComponentType<TestBulkActionBarProps>;

const RFI = {
  id: "rfi-1",
  rfi_number: "RFI-001",
  title: "Confirm joist seat elevation",
  status: "Open",
  priority: "High",
  discipline: "Structural",
  ball_in_court: "Engineer",
  submitted_date: "2026-08-10",
  date_required: "2026-08-20",
};

function SelectionToDeleteHarness({ onDelete }: { onDelete: () => void }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  return (
    <>
      <RfiTable
        rows={[RFI]}
        totalCount={1}
        selectedIds={selectedIds}
        onToggleSelect={(id: string) => setSelectedIds((current) => {
          const next = new Set(current);
          if (next.has(id)) next.delete(id); else next.add(id);
          return next;
        })}
      />
      <TestBulkActionBar
        count={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        actions={[{ label: "DELETE", variant: "danger", onClick: onDelete }]}
      />
    </>
  );
}

describe("RFI register interactions", () => {
  it("closes the detail modal from the header X button", () => {
    const onClose = vi.fn();
    render(
      <RfiDetailModal
        rfi={RFI}
        onClose={onClose}
        onAdvanceStatus={undefined}
        onEdit={undefined}
        onNudge={undefined}
        onCreateCO={undefined}
        onDownstreamAction={undefined}
      />,
    );

    fireEvent.click(screen.getByTitle("Close"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("selects a row from its checkbox without opening the detail modal", () => {
    const onToggleSelect = vi.fn();
    const onOpen = vi.fn();
    render(
      <RfiTable
        rows={[RFI]}
        totalCount={1}
        selectedIds={new Set()}
        onToggleSelect={onToggleSelect}
        onOpen={onOpen}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Select RFI-001" }));

    expect(onToggleSelect).toHaveBeenCalledWith("rfi-1");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("reveals and runs DELETE after selecting a row", () => {
    const onDelete = vi.fn();
    render(<SelectionToDeleteHarness onDelete={onDelete} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select RFI-001" }));
    fireEvent.click(screen.getByRole("button", { name: "DELETE" }));

    expect(screen.getByText("1 SELECTED")).toBeInTheDocument();
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
