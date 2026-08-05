import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { createPageUrl } from "@/utils";

import {
  uniqueActivityUsers,
  uniqueActivityEntities,
  filterActivities,
  activityHasActiveFilters,
  downloadActivityCsv,
  createEmptyActivityFilters,
} from "./activity/activityPageHelpers";
import {
  ActivityPageHeader,
  ActivityFilterBar,
  ActivityStatsStrip,
  ActivityFeedPanel,
} from "./activity/ActivityUi";


export default function ActivityPage() {
  const navigate = useNavigate();
  const [filterProject, setFilterProject] = useState("all");
  const [filterUser, setFilterUser] = useState("all");
  const [filterEntity, setFilterEntity] = useState("all");
  const [dateRange, setDateRange] = useState("all");

  const { data: activities = [], isLoading: activitiesLoading } = useQuery({
    queryKey: ["activities"],
    queryFn: () => entities.Activity.list("-timestamp"),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    initialData: [],
    staleTime: 5 * 60 * 1000,
  });

  // The `activities` table stores columns in snake_case (entity_type,
  // performed_by, project_id). Earlier this page was reading the
  // legacy camelCase aliases (userName, entityType, projectId)
  // which never exist on Supabase rows — every filter silently
  // evaluated to true/empty and the feed looked broken. We now read
  // the real column names, keeping legacy fallbacks in case a future
  // seed switches back to camelCase.
  const uniqueUsers = useMemo(
    () => uniqueActivityUsers(activities),
    [activities]
  );

  const uniqueEntities = useMemo(
    () => uniqueActivityEntities(activities),
    [activities]
  );

  const filtered = useMemo(() => {
    return filterActivities(activities, {
      filterProject,
      filterUser,
      filterEntity,
      dateRange,
    });
  }, [activities, filterProject, filterUser, filterEntity, dateRange]);

  const hasActiveFilters = activityHasActiveFilters({
    filterProject,
    filterUser,
    filterEntity,
    dateRange,
  });

  const handleClearFilters = () => {
    const empty = createEmptyActivityFilters();
    setFilterProject(empty.filterProject);
    setFilterUser(empty.filterUser);
    setFilterEntity(empty.filterEntity);
    setDateRange(empty.dateRange);
  };

  const handleExportCSV = () => downloadActivityCsv(filtered);

  return (
    <div className="sb-dashboard-reference-page" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <ActivityPageHeader
        hasActiveFilters={hasActiveFilters}
        onClearFilters={handleClearFilters}
      />

      <ActivityFilterBar
        filterProject={filterProject}
        filterUser={filterUser}
        filterEntity={filterEntity}
        dateRange={dateRange}
        projects={projects}
        uniqueUsers={uniqueUsers}
        uniqueEntities={uniqueEntities}
        filteredCount={filtered.length}
        onFilterProject={setFilterProject}
        onFilterUser={setFilterUser}
        onFilterEntity={setFilterEntity}
        onDateRange={setDateRange}
        onExportCsv={handleExportCSV}
      />

      <ActivityStatsStrip
        activitiesLoading={activitiesLoading}
        filteredCount={filtered.length}
        totalCount={activities.length}
        hasActiveFilters={hasActiveFilters}
        uniqueUserCount={uniqueUsers.length}
        uniqueEntityCount={uniqueEntities.length}
      />

      <ActivityFeedPanel
        activitiesLoading={activitiesLoading}
        filtered={filtered}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={handleClearFilters}
        onNavigateRfis={() => navigate(createPageUrl("RFIs"))}
        onNavigateDocuments={() => navigate(createPageUrl("Documents"))}
        onNavigateWorkPackages={() => navigate(createPageUrl("WorkPackages"))}
      />
    </div>
  );
}
