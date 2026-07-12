/**
 * pageIcons — page → lucide icon map (single source of truth).
 *
 * Extracted from SidebarNav so the desktop ModuleTile fallback and the
 * sidebar share one icon vocabulary. Adding a page = one line here.
 */
import {
  LayoutDashboard, Terminal, Grid3x3, Briefcase, BarChart3,
  CalendarRange, CalendarDays, CheckSquare, HelpCircle, DollarSign, Mail,
  FileText, Eye, Box, ScanLine,
  Package, Truck, Wrench, Users2,
  Wallet, TrendingUp, Receipt,
  Folder, FileBarChart, Activity as ActivityIcon,
  ClipboardList, Shield, ShieldAlert, FlaskConical, Camera,
  Contact2, Building2, UserCog, Settings as SettingsIcon,
  Ruler, Calculator, HardHat, ArrowLeftRight,
  BookOpen,
} from "lucide-react";

export const PAGE_ICON = {
  Dashboard: LayoutDashboard,
  CommandCenter: Terminal,
  ExecutiveView: BarChart3,
  Projects: Briefcase,
  ProjectsHub: Briefcase,
  PortfolioOverview: Grid3x3,
  PortfolioHub: Grid3x3,

  Schedule: CalendarRange,
  ScheduleHub: CalendarRange,
  ProjectCalendar: CalendarDays,
  ActionItems: CheckSquare,
  RFIs: HelpCircle,
  RFIHub: HelpCircle,
  Submittals: FileText,
  ChangeOrders: DollarSign,
  ChangeRequests: DollarSign,
  EmailInbox: Mail,
  ProjectCloseout: Box,
  ProductionNotes: FileText,

  DrawingSubmittalHub: ScanLine,
  Drawings: FileText,
  DrawingViewer: Eye,
  Documents: Folder,

  WorkPackages: Package,
  Constraints: Shield,
  FabRelease: Wrench,
  ProductionStatus: Wrench,
  Procurement: Package,
  LookAheadSchedule: CalendarRange,
  Deliveries: Truck,
  ResourceHub: Users2,
  ResourceScheduling: Users2,
  RiskHub: ShieldAlert,
  BudgetHours: TrendingUp,

  CostHub: Wallet,
  SOV: Receipt,
  PayApplications: Receipt,
  Backcharges: DollarSign,
  ContractManagement: FileText,
  Expenses: Wallet,

  ReportsHub: FileBarChart,
  Reports: FileBarChart,
  JobStatusReport: FileBarChart,
  Activity: ActivityIcon,
  AlertsCenter: ShieldAlert,

  FieldToday: HardHat,
  FieldHub: HardHat,
  Field: HardHat,
  DailyLogs: ClipboardList,
  Photos: Camera,
  Inspections: ScanLine,
  Safety: Shield,
  QualityControl: FlaskConical,
  Punchlist: CheckSquare,
  LEMs: ClipboardList,
  Warranty: Shield,

  Contacts: Contact2,
  Vendors: Building2,
  OrgMembers: Users2,
  Billing: DollarSign,
  UsersManagement: UserCog,
  Settings: SettingsIcon,
  ScopeExclusions: FileText,
  Tutorial: BookOpen,

  CalculatorsHub: Calculator,
  Calculator: Calculator,
  FeetInchesCalculator: Ruler,
  SteelWeightCalculator: Calculator,
  CranePickCalculator: HardHat,
  DecimalFractionConverter: ArrowLeftRight,
};

export const FallbackIcon = Grid3x3;

/** Lucide component for a page key, or the neutral fallback. */
export function getPageIcon(page) {
  return PAGE_ICON[page] || FallbackIcon;
}

