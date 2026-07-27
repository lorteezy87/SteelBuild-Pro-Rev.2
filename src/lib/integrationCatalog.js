export const INTEGRATION_AREAS = [
  {
    key: "email",
    name: "Email",
    category: "Communications",
    status: "Partially Live",
    risk: "Medium",
    // Customer-facing readiness (clean product language; the dev `status`/`risk`
    // above are kept for the admin/developer view).
    customerStatus: "available",
    customerSummary: "Manual forwarding and Power Automate are supported today; direct Outlook sign-in is coming soon.",
    providers: [
      { name: "Email forwarding", status: "available" },
      { name: "Power Automate", status: "available" },
      { name: "Outlook (direct connect)", status: "coming_soon" },
      { name: "Gmail", status: "coming_soon" },
    ],
    shortDescription: "Capture RFIs, submittals, tickets, photos, and project correspondence from monitored mailboxes.",
    systems: ["Outlook", "Gmail", "Shared project inboxes", "Power Automate", "SendGrid"],
    existingCapabilities: [
      "Webhook-based email ingestion Edge Function with SendGrid, Power Automate, and manual forward support.",
      "AI classification (OpenAI gpt-4o-mini) extracts type, RFI/submittal numbers, drawing refs, due dates, priority, and action required.",
      "Full split-pane Email Inbox with folders, labels, search, read/unread, star, and bulk actions.",
      "Approve & Create workflow: create RFIs, Action Items, Submittals, or Change Orders from emails with AI-prefilled fields.",
      "Link to Existing workflow: connect emails to existing project records.",
      "Attachment storage in Supabase Storage with deduplication by content hash.",
      "Per-project email account management with manual forward webhook URL.",
      "Power Automate connection type with Microsoft 365 setup guide.",
      "Real-time email arrival via Supabase Realtime subscriptions.",
    ],
    targetWorkflows: [
      "Inbound RFI/submittal intake with human review before record creation.",
      "Attachment filing to the document repository when creating records from emails.",
      "Digest of unresolved email commitments into Action Items.",
      "Outlook OAuth shared mailbox ingestion (direct API pull).",
    ],
    dataTouched: ["RFIs", "Submittals", "Documents", "Action Items", "Change Orders"],
    prerequisites: ["EMAIL_WEBHOOK_SECRET env var", "Power Automate flow or Outlook forwarding rule", "OpenAI API key for AI classification"],
    nextSprint: [
      "Configure EMAIL_WEBHOOK_SECRET in Supabase Edge Function secrets.",
      "Set up Power Automate flow or Outlook rule to forward project emails.",
      "Outlook OAuth direct mailbox polling (requires Azure AD app registration).",
      "Email thread grouping and conversation view.",
    ],
  },
  {
    key: "accounting",
    name: "Accounting",
    category: "Cost",
    status: "Adapter Required",
    risk: "High",
    customerStatus: "custom_setup",
    customerSummary: "CSV import/export workflow first; live QuickBooks/Sage API sync comes later, after field mapping is approved.",
    providers: [
      { name: "Change order CSV import", status: "available" },
      { name: "Cost code CSV import", status: "custom_setup" },
      { name: "Budget / SOV CSV export", status: "custom_setup" },
      { name: "QuickBooks, Sage & Vista sync", status: "coming_soon" },
    ],
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
    customerStatus: "available",
    customerSummary: "SteelBuild storage is live. SharePoint and OneDrive folder links can be saved for setup, but file sync is not connected until the connector is deployed. Google Drive and Dropbox are coming soon.",
    providers: [
      { name: "SteelBuild storage", status: "available" },
      { name: "SharePoint", status: "setup_required" },
      { name: "OneDrive", status: "setup_required" },
      { name: "Google Drive", status: "coming_soon" },
      { name: "Dropbox", status: "coming_soon" },
    ],
    shortDescription: "Connect project files across SteelBuild storage, external drives, drawing folders, and field photos.",
    systems: ["Supabase Storage", "SharePoint", "OneDrive", "Google Drive", "Dropbox"],
    existingCapabilities: [
      "Private Supabase Storage upload and signed URL resolution are already wired.",
      "Document repository accepts PDF, DWG, IFC, GLTF, XLSX, DOCX, image, and ZIP files.",
      "Linked Folders panel for connecting SharePoint/OneDrive project folders.",
      "Document import queue with human-approved review before record creation.",
    ],
    targetWorkflows: [
      "External folder linking by project and drawing set.",
      "Nightly metadata sync without copying every file by default.",
      "Controlled import of selected external documents into SteelBuild records.",
    ],
    dataTouched: ["Documents", "Drawings", "Photos", "Submittals", "RFIs"],
    prerequisites: ["Provider picker", "Folder permissions", "External file id storage", "Link refresh strategy"],
    nextSprint: [
      "Configure Azure AD app registration (client ID, client secret, tenant ID).",
      "Wire sync_folder action to poll linked folders on schedule.",
      "Add file preview / download via Graph download URL proxy.",
    ],
  },
  {
    key: "scheduling",
    name: "Scheduling Imports / Exports",
    category: "Schedule",
    status: "Partially Live",
    risk: "Medium",
    customerStatus: "available",
    customerSummary: "MS Project XML import and calendar (ICS) export work today; MS Project export and Primavera P6 are coming soon.",
    providers: [
      { name: "MS Project XML import", status: "available" },
      { name: "Calendar (ICS) export", status: "available" },
      { name: "MS Project export", status: "coming_soon" },
      { name: "Primavera P6 import / export", status: "coming_soon" },
    ],
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
    // viewer_3d is enabled:false (internal-only override) — the IFC viewer is NOT
    // GA for customers, so this stays "coming soon" until the flag ships broadly.
    customerStatus: "coming_soon",
    customerSummary: "3D model (IFC / GLB / GLTF) viewing is coming soon; Autodesk cloud connectivity comes after that.",
    providers: [
      { name: "3D model (IFC / GLB / GLTF) viewing", status: "coming_soon" },
      { name: "Model file registry", status: "coming_soon" },
      { name: "Model-to-RFI linking", status: "coming_soon" },
      { name: "Autodesk Construction Cloud", status: "coming_soon" },
    ],
    shortDescription: "Connect IFC/model coordination to drawings, work packages, RFIs, and field issue workflows.",
    systems: ["IFC", "Revit exports", "Autodesk Construction Cloud", "Autodesk Platform Services"],
    existingCapabilities: [
      "Self-hosted IFC viewer (web-ifc + three) loads IFC/GLB/GLTF, but is gated behind the viewer_3d feature flag (internal only, not GA).",
      "Per-piece fab-status coloring from model_elements is wired into the Detailing Control Center 3D Model tab.",
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

// ── Customer-facing readiness ────────────────────────────────────────
// Clean product language shown to normal users; the dev `status`/`risk`
// fields on each area stay for the admin/developer view.
export const CUSTOMER_STATUS_META = {
  available:      { label: "Available",              tone: "success" },
  setup_required: { label: "Setup Required",         tone: "info" },
  custom_setup:   { label: "Custom Setup",           tone: "info" },
  coming_soon:    { label: "Coming Soon",            tone: "muted" },
  admin_review:   { label: "Admin Review Required",  tone: "warning" },
};

export function customerStatusMeta(statusKey) {
  return CUSTOMER_STATUS_META[statusKey] || CUSTOMER_STATUS_META.coming_soon;
}

// Filter options for the customer-facing catalog (by readiness label).
export const CUSTOMER_STATUS_FILTERS = [
  "All",
  CUSTOMER_STATUS_META.available.label,
  CUSTOMER_STATUS_META.setup_required.label,
  CUSTOMER_STATUS_META.custom_setup.label,
  CUSTOMER_STATUS_META.coming_soon.label,
];

// Filter the catalog by the customer-facing readiness label (e.g. "Available").
export function filterByCustomerStatus(areas = INTEGRATION_AREAS, label = "All") {
  if (label === "All") return areas;
  return areas.filter((area) => customerStatusMeta(area.customerStatus).label === label);
}

// Roll up customer-facing readiness for the KPI strip.
export function customerIntegrationSummary(areas = INTEGRATION_AREAS) {
  return areas.reduce((acc, area) => {
    acc.total += 1;
    if (area.customerStatus === "available") acc.availableAreas += 1;
    const providers = Array.isArray(area.providers) ? area.providers : [];
    acc.availableProviders += providers.filter((p) => p.status === "available").length;
    acc.comingSoonProviders += providers.filter((p) => p.status === "coming_soon").length;
    return acc;
  }, { total: 0, availableAreas: 0, availableProviders: 0, comingSoonProviders: 0 });
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
