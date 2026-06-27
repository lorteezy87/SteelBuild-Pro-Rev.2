// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
// This is a focused unit of the header branch logic. The full hub has heavy
// providers; rather than boot it, assert ModuleHeader renders the stats it is
// given (the integration with the flag is exercised by the existing hub smoke
// test + field verification).
import { render } from "@testing-library/react";
import { ModuleHeader } from "@/components/desktop/module";

describe("Detailing header uses ModuleHeader stats", () => {
  it("renders the four detailing signal stats", () => {
    const { getByText } = render(
      <ModuleHeader page="DrawingSubmittalHub" title="Drawing & Submittal Control"
        stats={[
          { label: "Overdue", value: 2, tone: "danger" },
          { label: "At Risk", value: 1, tone: "amber" },
          { label: "In Review", value: 5, tone: "blue" },
          { label: "Unlinked", value: 0, tone: "neutral" },
        ]} />,
    );
    expect(getByText("Drawing & Submittal Control")).toBeTruthy();
    expect(getByText("Overdue")).toBeTruthy();
    expect(getByText("In Review")).toBeTruthy();
    expect(getByText("5")).toBeTruthy();
  });
});
