// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { computeGettingStartedSteps } from "@/lib/gettingStarted";
import type { GettingStartedSignals } from "@/lib/gettingStarted";

const navigateMock = vi.fn();
vi.mock("react-router-dom", () => ({ useNavigate: () => navigateMock }));
vi.mock("@/utils", () => ({ createPageUrl: (p: string) => "/" + p }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let hookValue: any;
vi.mock("@/hooks/useGettingStarted", () => ({ useGettingStarted: () => hookValue }));

import GettingStartedChecklist from "../GettingStartedChecklist";

const skipRfi = vi.fn();
const dismiss = vi.fn();
const blank: GettingStartedSignals = {
  hasDrawings: false, hasSubmittal: false, hasRfi: false, rfiSkipped: false, hasFabRelease: false,
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const make = (signals: Partial<GettingStartedSignals>, over: any = {}) => ({
  state: computeGettingStartedSteps({ ...blank, ...signals }),
  dismissed: false, isLoading: false, skipRfi, dismiss, ...over,
});

beforeEach(() => { navigateMock.mockReset(); skipRfi.mockReset(); dismiss.mockReset(); });

describe("GettingStartedChecklist", () => {
  it("renders nothing without a project", () => {
    hookValue = make({});
    const { container } = render(<GettingStartedChecklist projectId={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when dismissed", () => {
    hookValue = make({}, { dismissed: true });
    const { container } = render(<GettingStartedChecklist projectId="p1" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the checklist and navigates from the current-step CTA", () => {
    hookValue = make({ hasDrawings: true }); // submittals is current
    render(<GettingStartedChecklist projectId="p1" />);
    expect(screen.getByText("Create a submittal")).toBeTruthy();
    expect(screen.getByText(/Walk the core workflow \(1\/4\)/)).toBeTruthy();
    fireEvent.click(screen.getByText(/Open submittals/));
    expect(navigateMock).toHaveBeenCalledWith("/Submittals");
  });

  it("offers 'No RFIs needed' on the RFI step and calls skipRfi", () => {
    hookValue = make({ hasDrawings: true, hasSubmittal: true }); // rfis is current
    render(<GettingStartedChecklist projectId="p1" />);
    fireEvent.click(screen.getByText("No RFIs needed"));
    expect(skipRfi).toHaveBeenCalledTimes(1);
  });

  it("does NOT show the RFI skip on a non-RFI current step", () => {
    hookValue = make({ hasDrawings: true }); // submittals current
    render(<GettingStartedChecklist projectId="p1" />);
    expect(screen.queryByText("No RFIs needed")).toBeNull();
  });

  it("the dismiss control calls dismiss", () => {
    hookValue = make({ hasDrawings: true });
    render(<GettingStartedChecklist projectId="p1" />);
    fireEvent.click(screen.getByLabelText("Dismiss getting started"));
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it("shows the complete banner when all four steps are done", () => {
    hookValue = make({ hasDrawings: true, hasSubmittal: true, hasRfi: true, hasFabRelease: true });
    render(<GettingStartedChecklist projectId="p1" />);
    expect(screen.getByText(/Core workflow complete/)).toBeTruthy();
    expect(screen.queryByText("Create a submittal")).toBeNull(); // checklist not shown
  });
});
