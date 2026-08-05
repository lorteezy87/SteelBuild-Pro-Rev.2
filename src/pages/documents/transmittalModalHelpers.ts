/** Pure purpose catalog + input style for TransmittalModal. */

export const TRANSMITTAL_PURPOSES = [
  "For Review",
  "For Approval",
  "For Construction",
  "For Record",
  "For Information",
  "Resubmitted",
] as const;

export const TRANSMITTAL_INPUT_STYLE: Record<string, string | number> = {
  width: "100%",
  padding: "8px 10px",
  background: "var(--hover-bg)",
  border: "1px solid var(--border-default)",
  color: "var(--text-primary)",
  borderRadius: 6,
  fontFamily: "var(--font-body)",
  fontSize: 12,
};
