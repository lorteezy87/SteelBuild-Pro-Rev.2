export const INTEGRATION_AREAS = [
  {
    key: "email",
    name: "Email",
    category: "Communications",
    status: "Planned",
    risk: "High",
    shortDescription: "Capture RFIs, submittals, tickets, photos, and project correspondence from monitored mailboxes.",
    systems: ["Outlook", "Gmail", "Shared project inboxes"],
    existingCapabilities: [
      "ICS calendar export supports Outlook, Teams, and Google Calendar.",
      "RFI log import supports email-delivered CSV/PDF once a user uploads the file.",
    ],
    targetWorkflows: [
      "Inbound RFI/submittal intake with human review before record creation.",
      "Attachment filing to the document repository with project and drawing-set matching.",
      "Digest of unresolved email commitments into Action Items.",
    ],
    dataTouched: ["RFIs", "Submittals", "Documents", "Action Items", "Daily Logs"],
    prerequisites: ["OAuth app registration", "Mailbox scopes", "Attachment storage policy", "Duplicate detection"],
    nextSprint: [
      "Start with Outlook shared mailbox ingestion.",
      "Stage parsed emails in a review queue before creating records.",
      "Log source message id and attachment hashes for traceability.",
    ],
  },
  {
    key: "accounting",
    name: "Accounting",
    category: "Cost",
    status: "Adapter Required",
    risk: "High",
    shortDescription: "Sync budgets, commitments, change orders, invoices, and cost codes with accounting systems.",
    systems: ["QuickBooks", "Sage", "Vista", "Foundation", "CSV export"],
    existingCapabilities: [
      "Change order CSV import recognizes common Sage, Vista, Procore, and Excel exports.",
      "Cost, SOV, expense, and budget-hour modules already hold the target business data.",
    ],
    targetWorkflows: [
      "Cost code import and validation.",
      "Approved change order export to accounting.",
      "Committed cost and invoice reconciliation back into dashboards.",
    ],
    dataTouched: ["Cost Codes", "SOV", "Change Orders", "Expenses", "Budget Hours"],
    prerequisites: ["Chart of accounts mapping", "Company/project accounting ids", "Approval gate", "Audit log"],
    nextSprint: [
      "Define canonical cost-code and commitment mapping.",
      "Ship CSV import/export first.",
      "Add QuickBooks/Sage OAuth only after field mapping is approved.",
    ],
  },
  {
    key: "document-storage",
    name: "Document Storage",
    category: "Documents",
    status: "Partially Live",
    risk: "Medium",
    shortDescription: "Connect project files across SteelBuild storage, external drives, drawing folders, and field photos.",
    systems: ["Supabase Storage", "SharePoint", "OneDrive", "Google Drive", "Dropbox"],
    existingCapabilities: [
      "Private Supabase Storage upload and signed URL resolution are already wired.",
      "Document repository accepts PDF, DWG, IFC, GLTF, XLSX, DOCX, image, and ZIP files.",
    ],
    targetWorkflows: [
      "External folder linking by project and drawing set.",
      "Nightly metadata sync without copying every file by default.",
      "Controlled import of selected external documents into SteelBuild records.",
    ],
    dataTouched: ["Documents", "Drawings", "Photos", "Submittals", "RFIs"],
    prerequisites: ["Provider picker", "Folder permissions", "External file id storage", "Link refresh strategy"],
    nextSprint: [
      "Model external file references without storing secrets in the browser.",
      "Start with SharePoint/OneDrive project folder linking.",
      "Keep imports human-approved before attaching files to records.",
    ],
  },
  {
    key: "bluebeam-pdf",
    name: "Bluebeam / PDF Workflows",
    category: "Drawings",
    status: "Partially Live",
    risk: "Medium",
    shortDescription: "Move markups, RFI logs, PDF drawing sets, and review artifacts between PDF tools and SteelBuild.",
    systems: ["Bluebeam Revu", "Bluebeam Studio", "Generic PDF", "PlanGrid exports"],
    existingCapabilities: [
      "Drawing uploads and AI extraction already process PDF drawing sets.",
      "RFI log import supports Procore, PlanGrid, Bluebeam, CSV, and PDF upload paths.",
      "Drawing Viewer includes Bluebeam-style markup and sheet navigation surfaces.",
    ],
    targetWorkflows: [
      "Bluebeam CSV/PDF import review queue.",
      "Markup export package for issue review.",
      "Revision comparison handoff back to drawings and RFIs.",
    ],
    dataTouched: ["Drawings", "Drawing Sets", "RFIs", "Documents", "Markup"],
    prerequisites: ["Markup format decision", "PDF flattening rules", "Sheet matching", "Revision audit policy"],
    nextSprint: [
      "Standardize a PDF import review queue shared by RFIs and drawing packages.",
      "Add source-file lineage to imported markup-derived records.",
      "Keep automated extraction assistive, not auto-approving drawing status changes.",
    ],
  },
  {
    key: "scheduling",
    name: "Scheduling Imports / Exports",
    category: "Schedule",
    status: "Partially Live",
    risk: "Medium",
    shortDescription: "Move schedules between SteelBuild, MS Project, Primavera P6, Outlook, and field look-aheads.",
    systems: ["MS Project XML", "Primavera P6", "CSV", "ICS Calendar"],
    existingCapabilities: [
      "MS Project XML import creates schedule tasks, hierarchy, resources, durations, and dependencies.",
      "Binary MPP is explicitly blocked and asks users to export XML first.",
      "Calendar export generates ICS files for Outlook, Teams, and Google.",
    ],
    targetWorkflows: [
      "MS Project export from SteelBuild tasks.",
      "P6 XER/XML import preview before writes.",
      "Field look-ahead export for superintendents and erection foremen.",
    ],
    dataTouched: ["Schedule Tasks", "Look-Ahead", "Resource Scheduling", "Projects"],
    prerequisites: ["Import preview", "Dependency mapping", "Calendar/workday rules", "Baseline handling"],
    nextSprint: [
      "Add schedule import staging before task creation.",
      "Add CSV/XLSX export of filtered schedule tasks.",
      "Design P6 mapping after MS Project round-trip is stable.",
    ],
  },
  {
    key: "autodesk-bim",
    name: "Autodesk / IFC / BIM",
    category: "Model",
    status: "Partially Live",
    risk: "High",
    shortDescription: "Connect IFC/model coordination to drawings, work packages, RFIs, and field issue workflows.",
    systems: ["IFC", "Revit exports", "Autodesk Construction Cloud", "Autodesk Platform Services"],
    existingCapabilities: [
      "Model Viewer loads GLTF, GLB, and IFC files locally.",
      "Portfolio BIM lens and Model Viewer already expose IFC/BIM viewing workflows.",
      "Documents can store IFC Model category files.",
    ],
    targetWorkflows: [
      "Model file registry by project and revision.",
      "Element-to-RFI/drawing/work-package linking.",
      "Autodesk cloud model reference without uncontrolled file copying.",
    ],
    dataTouched: ["Documents", "Drawings", "RFIs", "Work Packages", "Photos", "Inspections"],
    prerequisites: ["Autodesk app registration", "Model version ids", "Element id strategy", "Permission boundaries"],
    nextSprint: [
      "Create a model registry around existing IFC uploads.",
      "Persist model source, revision, and coordinate-system metadata.",
      "Defer Autodesk OAuth until the local model registry is stable.",
    ],
  },
];

export const INTEGRATION_STATUSES = ["All", "Partially Live", "Planned", "Adapter Required"];
export const INTEGRATION_CATEGORIES = ["All", ...Array.from(new Set(INTEGRATION_AREAS.map((area) => area.category)))];

export function getIntegrationByKey(key) {
  return INTEGRATION_AREAS.find((area) => area.key === key) || INTEGRATION_AREAS[0];
}

export function filterIntegrations({ category = "All", status = "All", query = "" } = {}) {
  const normalizedQuery = query.trim().toLowerCase();
  return INTEGRATION_AREAS.filter((area) => {
    const matchesCategory = category === "All" || area.category === category;
    const matchesStatus = status === "All" || area.status === status;
    const searchable = [
      area.name,
      area.category,
      area.shortDescription,
      ...area.systems,
      ...area.dataTouched,
    ].join(" ").toLowerCase();
    const matchesQuery = !normalizedQuery || searchable.includes(normalizedQuery);
    return matchesCategory && matchesStatus && matchesQuery;
  });
}

export function integrationSummary(areas = INTEGRATION_AREAS) {
  return areas.reduce((acc, area) => {
    acc.total += 1;
    acc.byStatus[area.status] = (acc.byStatus[area.status] || 0) + 1;
    acc.highRisk += area.risk === "High" ? 1 : 0;
    acc.partiallyLive += area.status === "Partially Live" ? 1 : 0;
    return acc;
  }, { total: 0, byStatus: {}, highRisk: 0, partiallyLive: 0 });
}

export const INTEGRATION_BUILD_ORDER = [
  {
    phase: "Foundation",
    title: "Integration registry and provider boundaries",
    reason: "Every provider needs ownership, scopes, source ids, audit behavior, and human approval before writes.",
  },
  {
    phase: "Email",
    title: "Outlook shared mailbox intake",
    reason: "RFIs, submittals, logs, and action items usually arrive by email, and every parsed item needs duplicate detection and a review queue before mutation.",
  },
  {
    phase: "Documents",
    title: "External document storage links",
    reason: "Drawings, specs, PDFs, photos, and email attachments need stable file identity before downstream accounting or schedule sync is useful.",
  },
  {
    phase: "Cost",
    title: "Accounting CSV then API adapters",
    reason: "Cost data needs strict mappings and approval gates before OAuth API writes are worth the risk.",
  },
  {
    phase: "Schedule",
    title: "MS Project export and P6 staging",
    reason: "MS Project XML import exists, so round-trip and staging are the next reliable improvements.",
  },
  {
    phase: "Model",
    title: "IFC registry before Autodesk cloud sync",
    reason: "The app can already load IFC; stable model metadata should come before external model cloud permissions.",
  },
];
