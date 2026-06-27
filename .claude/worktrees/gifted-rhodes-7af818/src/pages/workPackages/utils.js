/**
 * Pure helpers for the Work Packages page — date formatting, CSV
 * export. No React, no network.
 */

export const formatDate = (d) =>
  d
    ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "\u2014";

/**
 * CSV export of the current filtered set (or a subset when the user has
 * a bulk selection). Keeps the output alphanumeric-safe: cells are
 * quoted and any embedded `"` is escaped `""`.
 */
export const exportWorkPackagesCSV = (rows) => {
  const headers = [
    "WP #", "Name", "Phase", "Status", "Tonnage", "% Complete", "Crew",
    "Shop Hrs Budget", "Shop Hrs Actual", "Notes",
  ];
  const body = rows.map((w) =>
    [
      w.wp_number,
      w.name,
      w.phase,
      w.status,
      (Number(w.tonnage) || 0).toFixed(1),
      `${Number(w.percent_complete) || 0}%`,
      w.crew || "",
      w.shop_hours_budget || 0,
      w.shop_hours_actual || 0,
      w.notes || "",
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );
  const csv = [headers.join(","), ...body].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `work-packages-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};
