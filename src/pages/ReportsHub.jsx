/** Canonical Reports & Insights catalog. Individual reports remain /Reports/:slug. */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { REPORTS } from "@/pages/reports/registry";
import ReportsHubControlCenter from "./reportsHub/ReportsHubControlCenter";

export default function ReportsHub() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");

  const filteredReports = useMemo(() => {
    const q = search.trim().toLowerCase();

    return REPORTS.filter((report) => (
      (categoryFilter === "All" || report.category === categoryFilter)
      && (
        !q
        || report.title.toLowerCase().includes(q)
        || report.summary.toLowerCase().includes(q)
        || report.category.toLowerCase().includes(q)
      )
    ));
  }, [search, categoryFilter]);

  return (
    <ReportsHubControlCenter
      catalog={REPORTS}
      filtered={filteredReports}
      search={search}
      onSearch={setSearch}
      categoryFilter={categoryFilter}
      onCategoryChange={setCategoryFilter}
      onOpenReport={(report) => navigate(`/Reports/${report.slug}`)}
      favorites={[]}
    />
  );
}
