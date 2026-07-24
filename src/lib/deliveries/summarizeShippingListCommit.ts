/**
 * summarizeShippingListCommit — pure toast/result helper for shipping-list import.
 * Keeps success vs warning messaging honest when piece sync steps fail.
 */

export type ShippingListCommitCounts = {
  created: number;
  items: number;
  failed: number;
  shipped: number;
  canonicalShipped: number;
  canonicalSkipped: number;
  productionShipFailed?: boolean;
  canonicalShipFailed?: boolean;
};

export function summarizeShippingListCommit(result: ShippingListCommitCounts): {
  level: "success" | "warning";
  message: string;
} {
  const summary =
    `${result.created} load${result.created === 1 ? "" : "s"} imported (${result.items} pieces)`
    + (result.shipped ? `, ${result.shipped} marked shipped` : "")
    + (result.canonicalShipped ? `, ${result.canonicalShipped} canonical lots shipped` : "")
    + (result.canonicalSkipped ? `, ${result.canonicalSkipped} canonical lots skipped` : "")
    + (result.failed ? `, ${result.failed} failed` : "");

  if (result.productionShipFailed || result.canonicalShipFailed) {
    return {
      level: "warning",
      message:
        `${summary}. Piece sync incomplete`
        + (result.productionShipFailed ? " (production status update failed)" : "")
        + (result.canonicalShipFailed ? " (canonical lot bridge failed)" : "")
        + ".",
    };
  }
  return { level: "success", message: summary };
}
