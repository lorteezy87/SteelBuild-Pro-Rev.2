const DAY_MS = 24 * 60 * 60 * 1000;

export const PROJECT_TEMPLATES = [
  {
    key: "fabrication_erection",
    name: "Fabrication + Erection",
    description: "Full structural steel job setup with drawing sets, submittals, fabrication work packages, schedule tasks, deliveries, field logs, QC, and closeout starters.",
    bestFor: "Typical steel package from detailing through field erection",
    phase: "Detailing",
    accent: "var(--phase-fabrication)",
    modules: ["Drawings", "Submittals", "Schedule", "Work Packages", "Deliveries", "Field", "Quality"],
    counts: { workPackages: 4, scheduleTasks: 7, drawingSets: 2, drawings: 6, submittals: 2, rfis: 2, deliveries: 2, fieldItems: 5 },
  },
  {
    key: "field_execution",
    name: "Field-Only Execution",
    description: "Lean field setup for superintendents: daily logs, photos, safety, punch, inspections, delivery receiving, and near-term action items.",
    bestFor: "Field teams taking over after fabrication release",
    phase: "Erection",
    accent: "var(--phase-erection)",
    modules: ["Field", "Daily Logs", "Photos", "Punchlist", "Safety", "Deliveries"],
    counts: { workPackages: 2, scheduleTasks: 4, drawingSets: 0, drawings: 0, submittals: 0, rfis: 1, deliveries: 2, fieldItems: 8 },
  },
  {
    key: "drawing_submittal",
    name: "Drawings + Submittals",
    description: "Document-heavy startup for detailers and PMs: drawing sets, submittal packages, RFI log, review dates, and release milestones.",
    bestFor: "Early-stage coordination and approval tracking",
    phase: "Detailing",
    accent: "var(--accent)",
    modules: ["Drawings", "Submittals", "RFIs", "Schedule", "Documents"],
    counts: { workPackages: 1, scheduleTasks: 5, drawingSets: 3, drawings: 8, submittals: 4, rfis: 3, deliveries: 0, fieldItems: 0 },
  },
  {
    key: "blank",
    name: "Blank Project",
    description: "Creates only the project shell with onboarding metadata and no starter production records.",
    bestFor: "Clean jobs where the team wants to import everything",
    phase: "Pre-Construction",
    accent: "var(--text-muted)",
    modules: ["Projects"],
    counts: { workPackages: 0, scheduleTasks: 0, drawingSets: 0, drawings: 0, submittals: 0, rfis: 0, deliveries: 0, fieldItems: 0 },
  },
];

export const SAMPLE_PROJECT_TEMPLATE_KEY = "structural_demo";

export const SAMPLE_PROJECT = {
  key: SAMPLE_PROJECT_TEMPLATE_KEY,
  name: "Structural Steel Demo Project",
  description: "A clearly marked demo project with realistic RFIs, drawing packages, submittals, schedule tasks, deliveries, daily logs, punch, safety, photos, inspections, and QC records.",
  bestFor: "Training, sales demos, and first-time users learning the workflow",
  phase: "Fabrication",
  accent: "var(--status-warning)",
  modules: ["RFIs", "Drawings", "Submittals", "Schedule", "Deliveries", "Field", "Safety", "Punchlist"],
  counts: { workPackages: 4, scheduleTasks: 8, drawingSets: 3, drawings: 9, submittals: 4, rfis: 4, deliveries: 3, fieldItems: 12 },
};

export const TEMPLATE_LIBRARY = [
  {
    title: "Daily Log Starter",
    category: "Field",
    items: ["Crew/headcount", "Hours worked", "Weather", "Activities", "Delays", "Safety notes", "Photos"],
  },
  {
    title: "Safety Categories",
    category: "Safety",
    items: ["Hazard", "Near Miss", "Injury", "Equipment Failure", "Property Damage", "Environmental"],
  },
  {
    title: "Punchlist Categories",
    category: "Closeout",
    items: ["Fit-Up", "Connections", "Bolting", "Welding", "Coating", "Cleanup", "Documentation"],
  },
  {
    title: "Delivery Statuses",
    category: "Logistics",
    items: ["Scheduled", "Loading", "In Transit", "Partial", "Delivered", "Delayed", "Rejected"],
  },
  {
    title: "RFI/Submittal Defaults",
    category: "PM",
    items: ["Open", "Submitted", "Under Review", "Approved", "Approved as Noted", "Revise and Resubmit"],
  },
  {
    title: "Steel Schedule Phases",
    category: "Schedule",
    items: ["Detailing", "Approval", "Procurement", "Fabrication", "Delivery", "Erection", "Closeout"],
  },
];

export const IMPORT_TARGETS = {
  rfis: {
    label: "RFIs",
    entityKey: "RFI",
    required: ["title"],
    defaults: { status: "Open", priority: "Medium", ball_in_court: "Contractor" },
    allowedValues: {
      status: ["Open", "Under Review", "Incomplete Response", "Answered", "Closed", "Void"],
      priority: ["Low", "Medium", "High", "Critical"],
    },
    fields: [
      "rfi_number", "title", "question", "description", "drawing_reference", "spec_section",
      "priority", "status", "submitted_by", "submitted_date", "date_required", "assigned_to",
    ],
    aliases: {
      rfi_number: ["rfi", "rfi_number", "rfi #", "rfi no", "number"],
      title: ["title", "subject", "summary"],
      question: ["question", "description", "request", "issue"],
      description: ["description", "details", "narrative"],
      date_required: ["date_required", "required date", "due date", "needed by"],
      submitted_date: ["submitted_date", "submitted date", "created date"],
    },
  },
  scheduleTasks: {
    label: "Schedule Tasks",
    entityKey: "ScheduleTask",
    required: ["task_name"],
    defaults: { status: "Not Started", priority: "Normal", percent_complete: 0 },
    allowedValues: {
      status: ["Not Started", "In Progress", "Complete", "On Hold", "Delayed"],
    },
    fields: ["task_name", "task_type", "phase", "start_date", "end_date", "status", "priority", "assigned_to", "notes"],
    aliases: {
      task_name: ["task", "task name", "activity", "activity name", "name"],
      start_date: ["start", "start date", "planned start"],
      end_date: ["finish", "end", "end date", "planned finish"],
      assigned_to: ["assigned", "assignee", "owner"],
    },
  },
  workPackages: {
    label: "Work Packages",
    entityKey: "WorkPackage",
    required: ["name"],
    defaults: { status: "Not Started", phase: "Detailing", percent_complete: 0 },
    allowedValues: {
      status: ["Not Started", "In Progress", "Complete", "On Hold"],
      phase: ["Pre-Construction", "Detailing", "Procurement", "Fabrication", "Delivery", "Installation", "Erection", "Closeout"],
    },
    fields: ["wp_number", "name", "phase", "status", "tonnage", "shop_hours_budget", "field_hours_budget", "crew", "notes"],
    aliases: {
      wp_number: ["wp", "wp number", "package", "package number"],
      name: ["name", "work package", "description", "scope"],
      tonnage: ["tons", "tonnage", "weight"],
    },
  },
  deliveries: {
    label: "Deliveries",
    entityKey: "Delivery",
    required: ["description"],
    defaults: { status: "Scheduled", priority: "Normal" },
    allowedValues: {
      status: ["Scheduled", "In Transit", "Delivered", "Partial", "Rejected", "Delayed"],
      priority: ["Critical", "High", "Normal", "Low"],
    },
    fields: ["vendor", "po_number", "description", "scheduled_date", "required_date", "status", "pieces", "weight_tons", "receiving_location", "carrier", "notes"],
    aliases: {
      po_number: ["po", "po number", "purchase order"],
      description: ["description", "material", "load", "item"],
      scheduled_date: ["scheduled", "scheduled date", "delivery date"],
      required_date: ["required", "required date", "need date"],
      weight_tons: ["tons", "weight", "weight tons"],
    },
  },
  punchlist: {
    label: "Punchlist",
    entityKey: "PunchlistItem",
    required: ["description"],
    defaults: { status: "Open", priority: "Medium", percent_complete: 0 },
    allowedValues: {
      status: ["Open", "In Progress", "Completed", "On Hold", "Deferred"],
      priority: ["Critical", "High", "Medium", "Low"],
    },
    fields: ["description", "category", "location", "assigned_to", "priority", "status", "target_completion_date", "notes"],
    aliases: {
      description: ["description", "item", "issue", "punch item"],
      target_completion_date: ["due", "due date", "target completion", "target date"],
      assigned_to: ["assigned", "assignee", "owner"],
    },
  },
  contacts: {
    label: "Contacts",
    entityKey: "Contact",
    required: ["first_name", "company"],
    defaults: { contact_type: "Project Team" },
    fields: ["first_name", "last_name", "company", "role", "contact_type", "email", "phone", "notes"],
    aliases: {
      first_name: ["first", "first name", "name"],
      last_name: ["last", "last name", "surname"],
      contact_type: ["type", "contact type"],
    },
  },
};

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysIso(baseDate, offset) {
  const date = baseDate ? new Date(`${String(baseDate).slice(0, 10)}T00:00:00`) : new Date();
  if (Number.isNaN(date.getTime())) return todayIso();
  date.setDate(date.getDate() + Number(offset || 0));
  return date.toISOString().slice(0, 10);
}

export function getProjectTemplate(key) {
  if (key === SAMPLE_PROJECT_TEMPLATE_KEY) return SAMPLE_PROJECT;
  return PROJECT_TEMPLATES.find((template) => template.key === key) || PROJECT_TEMPLATES[0];
}

export function buildProjectPayload(form, templateKey = "fabrication_erection") {
  const template = getProjectTemplate(templateKey);
  const isDemo = templateKey === SAMPLE_PROJECT_TEMPLATE_KEY;
  const start = form.start_date || todayIso();
  return {
    project_number: (form.project_number || (isDemo ? "DEMO-001" : "")).trim(),
    name: (form.name || (isDemo ? SAMPLE_PROJECT.name : "")).trim(),
    client: (form.client || (isDemo ? "Demo Client" : "")).trim(),
    general_contractor: (form.general_contractor || "").trim() || null,
    engineer_of_record: (form.engineer_of_record || "").trim() || null,
    project_manager: (form.project_manager || "").trim() || null,
    superintendent: (form.superintendent || "").trim() || null,
    contract_type: form.contract_type || "Lump Sum",
    original_contract_value: Number(form.original_contract_value) || 0,
    start_date: start,
    target_completion_date: form.target_completion_date || addDaysIso(start, isDemo ? 120 : 90),
    forecast_completion_date: form.forecast_completion_date || null,
    phase: template.phase || "Pre-Construction",
    health_status: isDemo ? "Watch" : "On Track",
    retainage_percent: Number(form.retainage_percent) || 10,
    contingency_amount: Number(form.contingency_amount) || 0,
    address: (form.address || "").trim() || null,
    notes: (form.notes || "").trim() || null,
    job_type: form.job_type || null,
    metadata: {
      onboarding: {
        template_key: templateKey,
        template_name: template.name,
        is_demo: isDemo,
        created_from: "onboarding",
      },
    },
  };
}

function projectContext(project) {
  return {
    project_id: project.id,
    project_name: project.name || project.project_name || "",
  };
}

function demoPhotoDataUrl(label) {
  const text = encodeURIComponent(label || "FIELD PHOTO");
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='420' viewBox='0 0 640 420'%3E%3Crect width='640' height='420' fill='%230b1220'/%3E%3Crect x='28' y='28' width='584' height='364' fill='none' stroke='%2356b0ff' stroke-width='6'/%3E%3Ctext x='50%25' y='48%25' dominant-baseline='middle' text-anchor='middle' fill='%23e5f2ff' font-family='Arial' font-size='34' font-weight='700'%3E${text}%3C/text%3E%3Ctext x='50%25' y='60%25' dominant-baseline='middle' text-anchor='middle' fill='%238fb7d8' font-family='Arial' font-size='18'%3ESAMPLE ONBOARDING PHOTO%3C/text%3E%3C/svg%3E`;
}

export function buildSeedPayloads(project, templateKey = "fabrication_erection") {
  const template = getProjectTemplate(templateKey);
  const isBlank = template.key === "blank";
  const isDemo = template.key === SAMPLE_PROJECT_TEMPLATE_KEY;
  const start = project.start_date || todayIso();
  const ctx = projectContext(project);

  if (isBlank) return emptySeedPayloads();

  const includeField = ["field_execution", "fabrication_erection", SAMPLE_PROJECT_TEMPLATE_KEY].includes(template.key);
  const includeDocs = ["drawing_submittal", "fabrication_erection", SAMPLE_PROJECT_TEMPLATE_KEY].includes(template.key);

  const workPackages = [
    { wp_number: "WP-001", name: "Anchor Bolts", phase: "Detailing", status: "In Progress", tonnage: 18, shop_hours_budget: 80, field_hours_budget: 24, crew: "Detailing", percent_complete: isDemo ? 65 : 0 },
    { wp_number: "WP-002", name: "Main Steel", phase: "Fabrication", status: isDemo ? "In Progress" : "Not Started", tonnage: 142, shop_hours_budget: 620, field_hours_budget: 160, crew: "Shop A", percent_complete: isDemo ? 35 : 0 },
    { wp_number: "WP-003", name: "Stairs and Rails", phase: "Detailing", status: "Not Started", tonnage: 24, shop_hours_budget: 120, field_hours_budget: 72, crew: "Misc Metals", percent_complete: 0 },
    { wp_number: "WP-004", name: "Canopy Steel", phase: "Procurement", status: "Not Started", tonnage: 36, shop_hours_budget: 180, field_hours_budget: 60, crew: "Shop B", percent_complete: 0 },
  ].slice(0, template.key === "field_execution" ? 2 : 4).map((row) => ({ ...ctx, ...row, metadata: { onboarding_seed: true, template_key: template.key } }));

  const scheduleTasks = [
    { task_name: "Detail anchor bolt plan", phase: "Detailing", start_date: addDaysIso(start, 0), end_date: addDaysIso(start, 7), status: isDemo ? "In Progress" : "Not Started", priority: "High", percent_complete: isDemo ? 45 : 0 },
    { task_name: "Submit main steel shop drawings", phase: "Detailing", start_date: addDaysIso(start, 5), end_date: addDaysIso(start, 18), status: "Not Started", priority: "High", percent_complete: 0 },
    { task_name: "Review returned drawings", phase: "Detailing", start_date: addDaysIso(start, 19), end_date: addDaysIso(start, 28), status: "Not Started", priority: "Normal", percent_complete: 0 },
    { task_name: "Release anchor bolts for fabrication", phase: "Fabrication", start_date: addDaysIso(start, 21), end_date: addDaysIso(start, 27), status: "Not Started", priority: "High", percent_complete: 0 },
    { task_name: "Fabricate main steel", phase: "Fabrication", start_date: addDaysIso(start, 34), end_date: addDaysIso(start, 62), status: "Not Started", priority: "Normal", percent_complete: 0 },
    { task_name: "Deliver sequence 1", phase: "Delivery", start_date: addDaysIso(start, 63), end_date: addDaysIso(start, 66), status: "Not Started", priority: "Normal", percent_complete: 0 },
    { task_name: "Erect sequence 1", phase: "Erection", start_date: addDaysIso(start, 67), end_date: addDaysIso(start, 82), status: "Not Started", priority: "Normal", percent_complete: 0 },
    { task_name: "Close punch and turnover", phase: "Closeout", start_date: addDaysIso(start, 98), end_date: addDaysIso(start, 110), status: "Not Started", priority: "Normal", percent_complete: 0 },
  ].slice(0, template.key === "field_execution" ? 4 : template.key === "drawing_submittal" ? 5 : 8).map((row) => ({ ...ctx, task_type: row.phase === "Closeout" ? "Milestone" : "Task", ...row, metadata: { onboarding_seed: true, template_key: template.key } }));

  const drawingSets = includeDocs ? [
    { set_name: "001 - Anchor Bolts - OFA", description: "Anchor bolt and embed package", issued_date: addDaysIso(start, 2), revision: "0", status: isDemo ? "In Review" : "Draft" },
    { set_name: "002 - Main Steel - IFC", description: "Main steel framing package", issued_date: addDaysIso(start, 14), revision: "A", status: "Pending Review" },
    { set_name: "003 - Stairs and Rails - IFC", description: "Miscellaneous metals package", issued_date: addDaysIso(start, 28), revision: "0", status: "Planned" },
  ].slice(0, template.key === "fabrication_erection" ? 2 : 3).map((row, index) => ({
    ...ctx,
    ...row,
    metadata: { onboarding_seed: true, template_key: template.key, drawing_set_number: index + 1 },
  })) : [];

  const drawings = includeDocs ? [
    ["S0.01", "General Notes", "001 - Anchor Bolts - OFA"],
    ["S1.01", "Foundation Plan", "001 - Anchor Bolts - OFA"],
    ["S1.02", "Anchor Bolt Plan", "001 - Anchor Bolts - OFA"],
    ["S2.01", "Level 2 Framing Plan", "002 - Main Steel - IFC"],
    ["S2.02", "Roof Framing Plan", "002 - Main Steel - IFC"],
    ["S3.01", "Brace Elevations", "002 - Main Steel - IFC"],
    ["M1.01", "Stair A Plans", "003 - Stairs and Rails - IFC"],
    ["M1.02", "Guardrail Details", "003 - Stairs and Rails - IFC"],
    ["M1.03", "Canopy Details", "003 - Stairs and Rails - IFC"],
  ].slice(0, template.key === "fabrication_erection" ? 6 : 9).map(([sheet_number, title, drawing_set_name], index) => ({
    ...ctx,
    drawing_id: `D-${String(index + 1).padStart(3, "0")}`,
    sheet_number,
    title,
    discipline: sheet_number.startsWith("M") ? "Misc Metals" : "Structural",
    revision_number: index < 3 ? "0" : "A",
    stage: index < 3 && isDemo ? "OFA" : "IFC",
    submitted_date: addDaysIso(start, index + 2),
    due_date: addDaysIso(start, index + 12),
    drawing_set_name,
    metadata: { onboarding_seed: true, template_key: template.key },
  })) : [];

  const submittals = includeDocs ? [
    { submittal_number: "05-1200-001", title: "Anchor Bolt Package", spec_section: "05 12 00", submittal_type: "Shop Drawing", discipline: "Structural", submitted_date: addDaysIso(start, 2), required_date: addDaysIso(start, 14), status: isDemo ? "Under Review" : "Draft", ball_in_court: "EOR" },
    { submittal_number: "05-1200-002", title: "Main Steel Shop Drawings", spec_section: "05 12 00", submittal_type: "Shop Drawing", discipline: "Structural", submitted_date: addDaysIso(start, 12), required_date: addDaysIso(start, 28), status: "Submitted", ball_in_court: "EOR" },
    { submittal_number: "05-5000-001", title: "Stairs and Rails", spec_section: "05 50 00", submittal_type: "Shop Drawing", discipline: "Misc Metals", submitted_date: addDaysIso(start, 24), required_date: addDaysIso(start, 38), status: "Draft", ball_in_court: "Contractor" },
    { submittal_number: "09-9600-001", title: "Shop Primer Data", spec_section: "09 96 00", submittal_type: "Product Data", discipline: "Coatings", submitted_date: addDaysIso(start, 10), required_date: addDaysIso(start, 21), status: "Approved as Noted", ball_in_court: "Contractor" },
  ].slice(0, template.key === "fabrication_erection" ? 2 : 4).map((row) => ({ ...ctx, ...row, metadata: { onboarding_seed: true, template_key: template.key } })) : [];

  const rfis = [
    { rfi_number: "RFI-001", title: "Anchor bolt projection conflict", question: "Confirm projection where base plate grout thickness differs from structural notes.", drawing_reference: "S1.02", priority: "High", status: isDemo ? "Under Review" : "Open", submitted_date: addDaysIso(start, 3), date_required: addDaysIso(start, 9), ball_in_court: "EOR" },
    { rfi_number: "RFI-002", title: "Moment connection access", question: "Confirm access holes at grid B/4 for field bolting sequence.", drawing_reference: "S3.01", priority: "Medium", status: "Open", submitted_date: addDaysIso(start, 15), date_required: addDaysIso(start, 22), ball_in_court: "GC" },
    { rfi_number: "RFI-003", title: "Stair landing embeds", question: "Landing embed locations do not match architectural stair opening.", drawing_reference: "M1.01", priority: "Medium", status: "Open", submitted_date: addDaysIso(start, 28), date_required: addDaysIso(start, 35), ball_in_court: "Architect" },
    { rfi_number: "RFI-004", title: "Canopy drainage bracket clearance", question: "Confirm bracket offset at canopy downspout locations.", drawing_reference: "M1.03", priority: "Low", status: "Open", submitted_date: addDaysIso(start, 30), date_required: addDaysIso(start, 42), ball_in_court: "Contractor" },
  ].slice(0, template.key === "field_execution" ? 1 : template.key === "drawing_submittal" ? 3 : 4).map((row) => ({ ...ctx, ...row, metadata: { onboarding_seed: true, template_key: template.key } }));

  const deliveries = ["field_execution", "fabrication_erection", SAMPLE_PROJECT_TEMPLATE_KEY].includes(template.key) ? [
    { vendor: "ABC Steel Supply", po_number: "PO-1001", scheduled_date: addDaysIso(start, 58), required_date: addDaysIso(start, 60), status: "Scheduled", pieces: 86, weight_tons: 42, description: "Sequence 1 beams and columns", receiving_location: "North laydown yard", carrier: "Demo Trucking" },
    { vendor: "BoltCo", po_number: "PO-1002", scheduled_date: addDaysIso(start, 18), required_date: addDaysIso(start, 20), status: isDemo ? "In Transit" : "Scheduled", pieces: 12, weight_tons: 1.2, description: "Anchor bolt cages and loose hardware", receiving_location: "Shop dock" },
    { vendor: "Coatings Partner", po_number: "PO-1003", scheduled_date: addDaysIso(start, 43), required_date: addDaysIso(start, 45), status: "Scheduled", pieces: 24, weight_tons: 6.5, description: "Primer touch-up material", receiving_location: "Field trailer" },
  ].slice(0, template.key === "fabrication_erection" ? 2 : 3).map((row) => ({ ...ctx, ...row, metadata: { onboarding_seed: true, template_key: template.key } })) : [];

  const fieldPayloads = includeField ? buildFieldSeedPayloads(ctx, start, template.key, isDemo) : emptyFieldSeedPayloads();

  return {
    workPackages,
    scheduleTasks,
    drawingSets,
    drawings,
    submittals,
    rfis,
    deliveries,
    ...fieldPayloads,
  };
}

function buildFieldSeedPayloads(ctx, start, templateKey, isDemo) {
  return {
    dailyLogs: [
      {
        ...ctx,
        date: addDaysIso(start, 66),
        superintendent: "Sample Superintendent",
        crew_name: "Ironworker Crew 1",
        headcount: 6,
        hours_worked: 8,
        weather_description: "Clear, light wind",
        activities: "Received sequence 1 steel, staged columns, verified anchor bolt layout, and set first two column lines.",
        equipment_used: "55-ton crane, manlift, telehandler",
        safety_incidents: 0,
        toolbox_talk_completed: true,
        status: isDemo ? "Submitted" : "Draft",
        metadata: { onboarding_seed: true, template_key: templateKey },
      },
    ],
    photos: [
      { ...ctx, category: "Progress", title: "Sequence 1 laydown", description: "Sample progress photo placeholder", location: "North laydown yard", taken_date: addDaysIso(start, 66), file_url: demoPhotoDataUrl("SEQUENCE 1 LAYDOWN"), file_name: "sample-sequence-1.svg", metadata: { onboarding_seed: true, template_key: templateKey } },
      { ...ctx, category: "Issue", title: "Anchor bolt verification", description: "Sample issue photo placeholder", location: "Grid B/4", taken_date: addDaysIso(start, 66), file_url: demoPhotoDataUrl("ANCHOR BOLT CHECK"), file_name: "sample-anchor-bolt-check.svg", metadata: { onboarding_seed: true, template_key: templateKey } },
    ],
    punchlist: [
      { ...ctx, description: "Touch up primer at Column B4 after fit-up", category: "Coating", location: "Grid B/4", assigned_to: "Field Crew", priority: "Medium", status: "Open", target_completion_date: addDaysIso(start, 75), metadata: { onboarding_seed: true, template_key: templateKey } },
      { ...ctx, description: "Install missing bolt at brace connection C3", category: "Connections", location: "Grid C/3", assigned_to: "Ironworker Crew 1", priority: "High", status: "Open", target_completion_date: addDaysIso(start, 70), metadata: { onboarding_seed: true, template_key: templateKey } },
    ],
    safetyIncidents: [
      { ...ctx, incident_type: "Hazard", severity: "Low", incident_date: addDaysIso(start, 66), location: "Laydown yard", reported_by: "Sample Superintendent", description: "Trip hazard identified at dunnage stack. Area flagged and corrected.", corrective_actions: "Reset dunnage and assigned housekeeping check.", responsible_party: "Field Crew", action_due_date: addDaysIso(start, 67), status: "Closed", investigation_completed: true, metadata: { onboarding_seed: true, template_key: templateKey } },
    ],
    inspections: [
      { ...ctx, inspection_type: "Bolt Torque", inspection_date: addDaysIso(start, 70), location: "Sequence 1", inspector_name: "QA Sample", inspector_role: "QA/QC", description: "Initial bolt torque inspection for sequence 1", status: "Scheduled", sign_off_status: "Pending", metadata: { onboarding_seed: true, template_key: templateKey } },
    ],
    qualityControlRecords: [
      { ...ctx, test_type: "Weld Visual", test_date: addDaysIso(start, 69), material_or_component: "Moment connection welds", location: "Grid B/4", test_lab_or_inspector: "QA Sample", specification: "AWS D1.1", result: isDemo ? "Pass" : "Pending", status: isDemo ? "Accepted" : "Pending", metadata: { onboarding_seed: true, template_key: templateKey } },
    ],
  };
}

function emptyFieldSeedPayloads() {
  return {
    dailyLogs: [],
    photos: [],
    punchlist: [],
    safetyIncidents: [],
    inspections: [],
    qualityControlRecords: [],
  };
}

function emptySeedPayloads() {
  return {
    workPackages: [],
    scheduleTasks: [],
    drawingSets: [],
    drawings: [],
    submittals: [],
    rfis: [],
    deliveries: [],
    ...emptyFieldSeedPayloads(),
  };
}

export const SEED_ENTITY_MAP = {
  workPackages: "WorkPackage",
  scheduleTasks: "ScheduleTask",
  drawingSets: "DrawingSet",
  drawings: "Drawing",
  submittals: "Submittal",
  rfis: "RFI",
  deliveries: "Delivery",
  dailyLogs: "DailyLog",
  photos: "Photo",
  punchlist: "PunchlistItem",
  safetyIncidents: "SafetyIncident",
  inspections: "Inspection",
  qualityControlRecords: "QualityControlRecord",
};

export function summarizeSeedPayloads(payloads) {
  return Object.entries(payloads || {}).reduce((acc, [key, rows]) => {
    acc[key] = Array.isArray(rows) ? rows.length : 0;
    return acc;
  }, {});
}

function normalizeHeader(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[#/_.:-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDelimitedLine(line, delimiter) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function chooseDelimiter(headerLine) {
  const candidates = [",", "\t", ";"];
  return candidates
    .map((delimiter) => ({ delimiter, count: parseDelimitedLine(headerLine, delimiter).length }))
    .sort((a, b) => b.count - a.count)[0].delimiter;
}

export function parseDelimitedImport(text) {
  const cleaned = String(text || "").replace(/^\uFEFF/, "").trim();
  if (!cleaned) return { headers: [], rows: [] };
  const lines = cleaned.split(/\r?\n/).filter((line) => line.trim());
  const delimiter = chooseDelimiter(lines[0] || "");
  const headers = parseDelimitedLine(lines[0] || "", delimiter);
  const rows = lines.slice(1).map((line, index) => ({
    rowNumber: index + 2,
    values: parseDelimitedLine(line, delimiter),
  }));
  return { headers, rows, delimiter };
}

function aliasMapForTarget(target) {
  const map = new Map();
  for (const field of target.fields) map.set(normalizeHeader(field), field);
  for (const [field, aliases] of Object.entries(target.aliases || {})) {
    for (const alias of aliases) map.set(normalizeHeader(alias), field);
  }
  return map;
}

function cleanImportValue(field, value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (["pieces", "tonnage", "shop_hours_budget", "field_hours_budget", "weight_tons", "percent_complete"].includes(field)) {
    const parsed = Number(raw.replace(/[$,%]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return raw;
}

export function stageImportText({ targetKey, text, project }) {
  const target = IMPORT_TARGETS[targetKey] || IMPORT_TARGETS.rfis;
  const parsed = parseDelimitedImport(text);
  const aliases = aliasMapForTarget(target);
  const mappedHeaders = parsed.headers.map((header) => aliases.get(normalizeHeader(header)) || null);
  const validRecords = [];
  const invalidRows = [];
  const projectName = project?.name || project?.project_name || "";

  for (const row of parsed.rows) {
    const record = {
      project_id: project?.id || null,
      project_name: projectName || null,
      ...target.defaults,
      metadata: { onboarding_import: true, import_target: targetKey },
    };
    mappedHeaders.forEach((field, index) => {
      if (!field) return;
      const value = cleanImportValue(field, row.values[index]);
      if (value !== null) record[field] = value;
    });

    const missing = target.required.filter((field) => !record[field]);
    const invalidValues = Object.entries(target.allowedValues || {}).flatMap(([field, allowed]) => {
      if (!record[field] || allowed.includes(record[field])) return [];
      return [{ field, value: record[field], allowed }];
    });
    if (missing.length || invalidValues.length) {
      invalidRows.push({ rowNumber: row.rowNumber, missing, invalidValues, raw: row.values });
    } else {
      validRecords.push(record);
    }
  }

  return {
    target,
    headers: parsed.headers,
    mappedHeaders,
    rows: parsed.rows,
    validRecords,
    invalidRows,
  };
}
