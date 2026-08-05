/** Pure view catalog for DocControlPanel. */

export const DOC_CONTROL_VIEWS = [
  { key: "register", label: "Register" },
  { key: "reviews", label: "Reviews" },
  { key: "impacts", label: "Impacts" },
  { key: "transmittals", label: "Transmittals" },
] as const;

export type DocControlViewKey = (typeof DOC_CONTROL_VIEWS)[number]["key"];
