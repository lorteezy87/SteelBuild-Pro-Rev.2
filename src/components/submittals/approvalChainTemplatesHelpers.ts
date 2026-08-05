/** Pure project custom approval-chain template normalize. */

export function newTemplateKey(): string {
  return `tpl_${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeCustomApprovalTemplates(
  raw: unknown,
  normalizeChain: (steps: unknown) => Array<{ party?: string }> | null | undefined,
  newKey: () => string = newTemplateKey,
): Array<{ key: string; name: string; steps: string[] }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t: any) => ({
      key: t.key || newKey(),
      name: t.name || "",
      steps: (normalizeChain(t.steps) || []).map((s) => s.party as string),
    }))
    .filter((t) => t.steps.length > 0);
}

export const APPROVAL_TEMPLATE_MONO = { fontFamily: "var(--font-mono)" } as const;

export function buildPartySuggestions(bicChoices: readonly string[]): string[] {
  return Array.from(new Set([...bicChoices, "PM", "Fabricator"]));
}

/** Disabled-aware icon button chrome for template step reorder. */
export function approvalChainIconBtnStyle(
  disabled: boolean,
): Record<string, string | number> {
  return {
    display: "inline-flex",
    background: "none",
    border: "none",
    padding: 1,
    color: disabled
      ? "var(--text-disabled, var(--text-muted))"
      : "var(--text-muted)",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.4 : 1,
  };
}

