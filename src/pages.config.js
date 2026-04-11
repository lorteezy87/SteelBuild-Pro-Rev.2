/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import AIInsights from './pages/AIInsights';
import ProjectControlCenter from './pages/ProjectControlCenter';
import ActionItems from './pages/ActionItems';
import Activity from './pages/Activity';
import AgentMemory from './pages/AgentMemory';
import Alerts from './pages/Alerts';
import AlertsCenter from './pages/AlertsCenter';
import ChangeOrders from './pages/ChangeOrders';
import Constraints from './pages/Constraints';
import ChangeRequests from './pages/ChangeRequests';
import Contacts from './pages/Contacts';
import CostDashboard from './pages/CostDashboard';
import DailyLogs from './pages/DailyLogs';
import Dashboard from './pages/Dashboard';
import Deliveries from './pages/Deliveries';
import Documents from './pages/Documents';
import Drawings from './pages/Drawings';
import DrawingViewer from './pages/DrawingViewer';
import ExecutiveView from './pages/ExecutiveView';
import Expenses from './pages/Expenses';
import DecisionLog from './pages/DecisionLog';
import FabRelease from './pages/FabRelease';
import Procurement from './pages/Procurement';
import Financials from './pages/Financials';
import GanttChart from './pages/GanttChart';
import Inspections from './pages/Inspections';
import JobStatusReport from './pages/JobStatusReport';
import LookAheadSchedule from './pages/LookAheadSchedule';
import Meetings from './pages/Meetings';
import ModelViewer from './pages/ModelViewer';
import Photos from './pages/Photos';
import ProductionNotes from './pages/ProductionNotes';
import ProjectCloseout from './pages/ProjectCloseout';
import ProjectDetail from './pages/ProjectDetail';
import Projects from './pages/Projects';
import Punchlist from './pages/Punchlist';
import QualityControl from './pages/QualityControl';
import RFIs from './pages/RFIs';
import RFIHub from './pages/RFIHub';
import Reports from './pages/Reports';
import ResourceManagement from './pages/ResourceManagement';
import ResourceScheduling from './pages/ResourceScheduling';
import SOV from './pages/SOV';
import Safety from './pages/Safety';
import Schedule from './pages/Schedule';
import ScopeExclusions from './pages/ScopeExclusions';
import Settings from './pages/Settings';
import UsersManagement from './pages/UsersManagement';
import Vendors from './pages/Vendors';
import Warranty from './pages/Warranty';
import WorkPackages from './pages/WorkPackages';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AIInsights": AIInsights,
    "ActionItems": ActionItems,
    "Activity": Activity,
    "AgentMemory": AgentMemory,
    "Alerts": Alerts,
    "AlertsCenter": AlertsCenter,
    "ChangeOrders": ChangeOrders,
    "Constraints": Constraints,
    "ChangeRequests": ChangeRequests,
    "Contacts": Contacts,
    "CostDashboard": CostDashboard,
    "DailyLogs": DailyLogs,
    "Dashboard": Dashboard,
    "Deliveries": Deliveries,
    "Documents": Documents,
    "Drawings": Drawings,
    "DrawingViewer": DrawingViewer,
    
    
    "ExecutiveView": ExecutiveView,
    "Expenses": Expenses,
    "DecisionLog": DecisionLog,
    "FabRelease": FabRelease,
    "Procurement": Procurement,
    "Financials": Financials,
    "GanttChart": GanttChart,
    "Inspections": Inspections,
    "JobStatusReport": JobStatusReport,
    "LookAheadSchedule": LookAheadSchedule,
    "Meetings": Meetings,
    "ModelViewer": ModelViewer,
    "Photos": Photos,
    "ProductionNotes": ProductionNotes,
    "ProjectCloseout": ProjectCloseout,
    "ProjectDetail": ProjectDetail,
    "ProjectControlCenter": ProjectControlCenter,
    "Projects": Projects,
    "Punchlist": Punchlist,
    "QualityControl": QualityControl,
    "Reports": Reports,
    "RFIs": RFIs,
    "RFIHub": RFIHub,
    "ResourceManagement": ResourceManagement,
    "ResourceScheduling": ResourceScheduling,
    "SOV": SOV,
    "Safety": Safety,
    "Schedule": Schedule,
    "ScopeExclusions": ScopeExclusions,
    "Settings": Settings,
    
    "UsersManagement": UsersManagement,
    "Vendors": Vendors,
    "Warranty": Warranty,
    "WorkPackages": WorkPackages,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};