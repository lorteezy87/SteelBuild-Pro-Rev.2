/** Pure style tokens + timezones for UserSettingsTab. */

export const USER_SETTINGS_STYLES = {
  input: {
    width: "100%",
    background: "var(--bg-input)",
    border: "1px solid var(--border-default)",
    borderRadius: 8,
    padding: "8px 12px",
    color: "var(--text-primary)",
    fontFamily: "var(--font-body)",
    fontSize: 12,
    outline: "none",
    boxSizing: "border-box" as const,
  },
  label: {
    fontFamily: "var(--font-mono)",
    fontSize: 8,
    fontWeight: 700,
    color: "var(--text-muted)",
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    display: "block" as const,
    marginBottom: 5,
  },
  section: {
    marginBottom: 28,
    paddingBottom: 28,
    borderBottom: "1px solid var(--divider)",
  },
  sectionTitle: {
    fontFamily: "var(--font-mono)",
    fontSize: 8,
    fontWeight: 700,
    color: "var(--text-muted)",
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    marginBottom: 16,
    display: "flex" as const,
    alignItems: "center" as const,
    gap: 8,
  },
};

export const USER_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
] as const;
