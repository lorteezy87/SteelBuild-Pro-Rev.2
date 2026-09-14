// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import RfiControlCenter from "../RfiControlCenter";

it("renders unavailable instead of zero KPIs when the RFI query failed", () => {
  render(
    <RfiControlCenter
      contextMode="portfolio"
      projectName="All Projects"
      rfis={[]}
      filtered={[]}
      search=""
      onSearch={vi.fn()}
      disciplineFilter="All"
      onDisciplineChange={vi.fn()}
      onOpenRfi={vi.fn()}
      onExport={vi.fn()}
      loadError="RFI data unavailable"
      onRetryLoad={vi.fn()}
    />,
  );

  expect(screen.getByText("RFI data unavailable")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  expect(screen.queryByText("0 Total")).not.toBeInTheDocument();
});
