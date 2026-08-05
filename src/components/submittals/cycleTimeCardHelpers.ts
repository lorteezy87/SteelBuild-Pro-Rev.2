/** Pure window catalog for CycleTimeCard. */

export const CYCLE_TIME_WINDOWS = [
  { key: 30, label: "30d" },
  { key: 60, label: "60d" },
  { key: 90, label: "90d" },
  { key: 365, label: "1y" },
  { key: 0, label: "All" },
] as const;
