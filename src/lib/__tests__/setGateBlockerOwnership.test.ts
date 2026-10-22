import { describe, expect, it } from "vitest";
import { explainGateBlockers, groupBlockersByOwner } from "../setGateBlockerOwnership";

describe("explainGateBlockers", () => {
  it("adds why and owner for known server blocker kinds", () => {
    expect(
      explainGateBlockers(
        [
          { kind: "not_ifc", title: "Governing submittal is at BFA" },
          { kind: "open_rfis", title: "RFI 014 open" },
        ],
        "EOR",
      ),
    ).toEqual([
      { what: "Governing submittal is at BFA", why: "The governing submittal is not at IFC", owner: "EOR" },
      { what: "RFI 014 open", why: "A linked RFI is still open", owner: "RFI ball in court" },
    ]);
  });

  it("never guesses an owner for not_ifc without a recorded ball in court", () => {
    expect(explainGateBlockers([{ kind: "not_ifc", title: "x" }], "  ")[0].owner).toBeNull();
  });

  it("keeps the server title for an unknown kind with no guessed owner", () => {
    expect(explainGateBlockers([{ kind: "new_rule_v3", title: "New server rule" }])).toEqual([
      { what: "New server rule", why: null, owner: null },
    ]);
    expect(explainGateBlockers(null)).toEqual([]);
  });
});

describe("groupBlockersByOwner", () => {
  it("groups by clearing party and keeps unknown owners visible", () => {
    const grouped = groupBlockersByOwner(
      explainGateBlockers([
        { kind: "no_submittal", title: "No governing submittal" },
        { kind: "missing_signoffs", title: "Sign-offs missing" },
        { kind: "mystery", title: "Unknown rule" },
      ]),
    );
    expect(grouped).toEqual([
      { what: "PM", why: "2 blockers: No governing submittal; Sign-offs missing", owner: null },
      { what: "Owner not recorded", why: "1 blocker: Unknown rule", owner: null },
    ]);
  });
});
