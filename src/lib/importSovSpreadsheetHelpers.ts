/**
 * Pure header-alias catalog for SOV spreadsheet import.
 */

export const SOV_HEADER_ALIASES: Record<string, string[]> = {
  line_item_number: ["line item number", "line", "line #", "line no", "item", "item #", "item number", "no", "#"],
  description: ["desc", "scope", "item description", "work description"],
  scheduled_value: ["scheduled value", "value", "amount", "contract value", "scheduled amount", "sov value"],
  application_number: ["application number", "app", "app #", "application", "pay app", "pay app #"],
  period_from: ["period from", "from", "start", "period start"],
  period_to: ["period to", "to", "end", "period end"],
  previous_percent_complete: ["previous % complete", "previous percent", "prev %", "previous %", "% prev"],
  current_percent_complete: ["current % complete", "current percent", "% complete", "percent complete", "% comp", "current %"],
  retainage_percent: ["retainage %", "retainage", "retention", "retention %"],
  status: ["state"],
  cost_code: ["cost code", "code", "cost code number", "cost code #", "cc"],
  cost_code_name: ["cost code name", "code name"],
};
