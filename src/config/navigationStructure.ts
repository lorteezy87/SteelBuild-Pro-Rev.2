import { isNativePlatform } from "@/lib/native/platform";

export interface OperationalNavItem {
  label: string;
  page: string;
  badgeKey?: string;
}

export interface OperationalNavGroup {
  label: string;
  utility?: boolean;
  collapsible?: boolean;
  items: OperationalNavItem[];
}

const BASE_OPERATIONAL_NAV_GROUPS: OperationalNavGroup[] = [
  {
    label: "COMMAND",
    collapsible: false,
    items: [
      { label: "Dashboard", page: "Dashboard" },
      { label: "Command Center", page: "CommandCenter" },
      { label: "Alerts", page: "AlertsCenter", badgeKey: "unread" },
    ],
  },
  {
    label: "PROJECTS",
    items: [
      { label: "Projects", page: "ProjectsHub" },
      { label: "Scope & Exclusions", page: "ScopeExclusions" },
      { label: "Contacts", page: "Contacts" },
      { label: "Project Members", page: "ProjectMembers" },
    ],
  },
  {
    label: "DETAILING",
    items: [
      { label: "Drawing Control", page: "DrawingSubmittalHub" },
      { label: "RFIs", page: "RFIs", badgeKey: "rfi" },
      { label: "Documents", page: "Documents" },
    ],
  },
  {
    label: "PRODUCTION",
    items: [
      { label: "Work Packages", page: "WorkPackages" },
      { label: "Piece Register", page: "PieceRegister" },
      { label: "Fab Release", page: "FabRelease" },
      { label: "Production Status", page: "ProductionStatus" },
      { label: "Procurement", page: "Procurement" },
      { label: "Deliveries", page: "Deliveries" },
      { label: "Risk", page: "RiskHub" },
      { label: "Resources", page: "ResourceHub" },
    ],
  },
  {
    label: "FIELD",
    items: [
      { label: "Field Today", page: "FieldToday" },
      { label: "Field Hub", page: "FieldHub" },
      { label: "Daily Logs", page: "DailyLogs" },
      { label: "Inspections", page: "Inspections" },
      { label: "Safety", page: "Safety" },
      { label: "Quality Control", page: "QualityControl" },
      { label: "Punchlist", page: "Punchlist" },
    ],
  },
  {
    label: "COMMERCIAL",
    items: [
      { label: "Budget Control", page: "CostHub" },
      { label: "Change Orders", page: "ChangeOrders", badgeKey: "co" },
      { label: "Schedule of Values", page: "SOV" },
      { label: "Pay Applications", page: "PayApplications" },
      { label: "Backcharge Defense", page: "Backcharges" },
      { label: "Expenses", page: "Expenses" },
    ],
  },
  {
    label: "REPORTS",
    items: [
      { label: "Portfolio", page: "PortfolioHub" },
      { label: "Reports", page: "ReportsHub" },
      { label: "Job Status Report", page: "JobStatusReport" },
      { label: "Activity", page: "Activity" },
    ],
  },
  {
    label: "ADMINISTRATION",
    utility: true,
    items: [
      { label: "Team", page: "OrgMembers" },
      { label: "Billing", page: "Billing" },
      { label: "Vendors", page: "Vendors" },
      { label: "Settings", page: "Settings" },
    ],
  },
  {
    label: "TOOLS",
    utility: true,
    items: [
      { label: "Calculators", page: "CalculatorsHub" },
      { label: "Notes", page: "Notes" },
    ],
  },
];

function forPlatform(groups: OperationalNavGroup[]): OperationalNavGroup[] {
  if (!isNativePlatform()) return groups;
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.page !== "Billing"),
    }))
    .filter((group) => group.items.length > 0);
}

export const OPERATIONAL_NAV_GROUPS: OperationalNavGroup[] = forPlatform(BASE_OPERATIONAL_NAV_GROUPS);

export const PRIMARY_OPERATIONAL_GROUPS = OPERATIONAL_NAV_GROUPS.filter((group) => !group.utility);
export const UTILITY_OPERATIONAL_GROUPS = OPERATIONAL_NAV_GROUPS.filter((group) => group.utility);
