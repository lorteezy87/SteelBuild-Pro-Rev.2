// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ScheduleCsvImportModal from "../ScheduleCsvImportModal";

vi.mock("@/hooks/useFocusTrap", () => ({
  useFocusTrap: () => ({ current: null }),
}));

vi.mock("@/lib/importScheduleCsv", async () => {
  const actual = await vi.importActual<typeof import("@/lib/importScheduleCsv")>("@/lib/importScheduleCsv");
  return {
    ...actual,
    downloadScheduleCsvTemplate: vi.fn(),
  };
});

function renderModal(props: Record<string, unknown> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ScheduleCsvImportModal
        open
        projectId="proj-1"
        projectName="Test Job"
        onClose={() => {}}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe("ScheduleCsvImportModal", () => {
  it("renders the upload step and template download", async () => {
    const { downloadScheduleCsvTemplate } = await import("@/lib/importScheduleCsv");
    renderModal();
    expect(screen.getByRole("dialog", { name: /import schedule csv/i })).toBeInTheDocument();
    expect(screen.getByText(/drop schedule csv here/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /download csv template/i }));
    expect(downloadScheduleCsvTemplate).toHaveBeenCalledTimes(1);
  });

  it("keeps Review disabled until a file is chosen", () => {
    renderModal();
    expect(screen.getByRole("button", { name: /review/i })).toBeDisabled();
  });
});
