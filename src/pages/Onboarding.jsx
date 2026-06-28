import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Database,
  FileSpreadsheet,
  FolderPlus,
  Import,
  LayoutTemplate,
  PackagePlus,
  Plus,
  Trash2,
  Upload,
  Users,
} from "lucide-react";

import { entities } from "@/api/supabaseClient";
import { createPageUrl } from "@/utils";
import {
  IMPORT_TARGETS,
  PROJECT_TEMPLATES,
  SAMPLE_PROJECT,
  SAMPLE_PROJECT_TEMPLATE_KEY,
  SEED_ENTITY_MAP,
  TEMPLATE_LIBRARY,
  addDaysIso,
  buildProjectPayload,
  buildSeedPayloads,
  stageImportText,
  summarizeSeedPayloads,
  todayIso,
} from "@/lib/onboardingTemplates";

const TEMPLATE_OPTIONS = [SAMPLE_PROJECT, ...PROJECT_TEMPLATES];
const SEED_ORDER = [
  "workPackages",
  "scheduleTasks",
  "drawingSets",
  "drawings",
  "submittals",
  "rfis",
  "deliveries",
  "dailyLogs",
  "photos",
  "punchlist",
  "safetyIncidents",
  "inspections",
  "qualityControlRecords",
];

const IMPORT_EXAMPLES = {
  rfis: "RFI #,Title,Question,Drawing Reference,Priority,Status\n001,Anchor bolt projection,Confirm projection at grid B/4,S1.02,High,Open",
  scheduleTasks: "Task Name,Phase,Start Date,End Date,Status,Assigned To\nDetail anchor bolt plan,Detailing,2026-06-01,2026-06-07,Not Started,Detailing Lead",
  workPackages: "WP Number,Name,Phase,Status,Tonnage,Crew\nWP-001,Anchor Bolts,Detailing,Not Started,18,Detailing",
  deliveries: "PO Number,Description,Scheduled Date,Required Date,Status,Pieces,Receiving Location\nPO-1001,Sequence 1 steel,2026-07-15,2026-07-17,Scheduled,86,North laydown yard",
  punchlist: "Description,Category,Location,Assigned To,Priority,Status\nTouch up primer at Column B4,Coating,Grid B/4,Field Crew,Medium,Open",
  contacts: "First Name,Last Name,Company,Role,Email,Phone\nJordan,Steel,Demo Steel,Project Manager,jordan@example.com,555-0100",
};

const INVALID_IMPORT_TARGET = "rfis";
const ROLE_OPTIONS = ["owner", "admin", "pm", "field", "viewer"];

function defaultProjectForm() {
  const start = todayIso();
  return {
    project_number: "",
    name: "",
    client: "",
    general_contractor: "",
    engineer_of_record: "",
    project_manager: "",
    superintendent: "",
    contract_type: "Lump Sum",
    original_contract_value: "",
    start_date: start,
    target_completion_date: addDaysIso(start, 90),
    retainage_percent: 10,
    contingency_amount: "",
    address: "",
    notes: "",
  };
}

function buildPayloadWithTeamPlan(projectForm, templateKey, teamRows) {
  const payload = buildProjectPayload(projectForm, templateKey);
  const teamPlan = teamRows
    .map((row) => ({
      email: row.email.trim(),
      role: row.role,
      discipline: row.discipline.trim(),
    }))
    .filter((row) => row.email || row.discipline);

  return {
    ...payload,
    metadata: {
      ...(payload.metadata || {}),
      onboarding: {
        ...(payload.metadata?.onboarding || {}),
        team_plan: teamPlan,
      },
    },
  };
}

async function bulkCreateWithFallback(entity, records) {
  if (!records.length) return [];
  try {
    return await entity.bulkCreate(records);
  } catch (err) {
    console.warn("[onboarding] bulkCreate failed, falling back to row creates", err);
    const created = [];
    for (const record of records) {
      try {
        created.push(await entity.create(record));
      } catch (rowErr) {
        // Skip a failing row (e.g. a duplicate unique key) instead of aborting
        // the seed and leaving an unhandled rejection.
        console.warn("[onboarding] seed row skipped:", rowErr?.message || rowErr);
      }
    }
    return created;
  }
}

async function createSeedRecords(seedPayloads) {
  const createdByKey = {};

  for (const payloadKey of SEED_ORDER) {
    const entityKey = SEED_ENTITY_MAP[payloadKey];
    const entity = entities[entityKey];
    let records = seedPayloads[payloadKey] || [];
    if (!entity || records.length === 0) {
      createdByKey[payloadKey] = [];
      continue;
    }

    if (payloadKey === "drawings" && createdByKey.drawingSets?.length) {
      const setIdByName = new Map(createdByKey.drawingSets.map((set) => [set.set_name, set.id]));
      records = records.map((record) => ({
        ...record,
        drawing_set_id: setIdByName.get(record.drawing_set_name) || record.drawing_set_id || null,
      }));
    }

    createdByKey[payloadKey] = await bulkCreateWithFallback(entity, records);
  }

  return createdByKey;
}

function formatCountLabel(key) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase());
}

function TextField({ label, value, onChange, type = "text", required = false, placeholder = "", span = 1 }) {
  return (
    <label className="onboarding-field" style={{ gridColumn: `span ${span}` }}>
      <span>{label}{required ? " *" : ""}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        placeholder={placeholder}
      />
    </label>
  );
}

function StepItem({ done, icon: Icon, title, detail }) {
  return (
    <div className={`onboarding-step ${done ? "is-done" : ""}`}>
      <div className="onboarding-step-icon">
        {done ? <CheckCircle2 size={18} /> : <Icon size={18} />}
      </div>
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
    </div>
  );
}

function TemplateCard({ template, selected, onSelect }) {
  const isDemo = template.key === SAMPLE_PROJECT_TEMPLATE_KEY;
  return (
    <button
      type="button"
      className={`onboarding-template-card ${selected ? "is-selected" : ""}`}
      onClick={onSelect}
      style={{ "--template-accent": template.accent || "var(--accent)" }}
    >
      <div className="onboarding-template-header">
        <span className="onboarding-template-dot" />
        <span>{isDemo ? "DEMO SAMPLE" : template.phase}</span>
      </div>
      <strong>{template.name}</strong>
      <p>{template.description}</p>
      <div className="onboarding-template-modules">
        {template.modules.slice(0, 6).map((module) => <span key={module}>{module}</span>)}
      </div>
    </button>
  );
}

function SectionHeader({ icon: Icon, title, detail }) {
  return (
    <div className="onboarding-section-header">
      <div className="onboarding-section-icon"><Icon size={18} /></div>
      <div>
        <h2>{title}</h2>
        {detail && <p>{detail}</p>}
      </div>
    </div>
  );
}

export default function Onboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [templateKey, setTemplateKey] = useState("fabrication_erection");
  const [projectForm, setProjectForm] = useState(defaultProjectForm);
  const [teamRows, setTeamRows] = useState([{ email: "", role: "pm", discipline: "Project Management" }]);
  const [createdProject, setCreatedProject] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [importTarget, setImportTarget] = useState(INVALID_IMPORT_TARGET);
  const [importText, setImportText] = useState(IMPORT_EXAMPLES[INVALID_IMPORT_TARGET]);
  const [importApproved, setImportApproved] = useState(false);
  const [importSourceName, setImportSourceName] = useState("Pasted sample data");
  const [fileBusy, setFileBusy] = useState(false);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list("-created_at"),
    staleTime: 5 * 60 * 1000,
  });

  const selectedTemplate = TEMPLATE_OPTIONS.find((template) => template.key === templateKey) || TEMPLATE_OPTIONS[0];
  const isDemoTemplate = templateKey === SAMPLE_PROJECT_TEMPLATE_KEY;
  const projectFormReady = isDemoTemplate || (
    projectForm.project_number.trim()
    && projectForm.name.trim()
    && projectForm.client.trim()
    && projectForm.start_date
  );
  const selectedProject = createdProject || projects.find((project) => project.id === selectedProjectId) || null;
  const previewProject = useMemo(() => (
    selectedProject || {
      id: "preview-project",
      name: projectForm.name || (isDemoTemplate ? SAMPLE_PROJECT.name : "New project"),
      start_date: projectForm.start_date,
    }
  ), [isDemoTemplate, projectForm.name, projectForm.start_date, selectedProject]);

  const seedPreview = useMemo(() => (
    summarizeSeedPayloads(buildSeedPayloads(previewProject, templateKey))
  ), [previewProject, templateKey]);

  const stagedImport = useMemo(() => stageImportText({
    targetKey: importTarget,
    text: importText,
    project: selectedProject,
  }), [importTarget, importText, selectedProject]);

  const createProjectMutation = useMutation({
    mutationFn: async () => {
      const project = await entities.Project.create(
        buildPayloadWithTeamPlan(projectForm, templateKey, teamRows),
      );
      const seedPayloads = buildSeedPayloads(project, templateKey);
      const createdSeedRows = await createSeedRecords(seedPayloads);
      return { project, createdSeedRows };
    },
    onSuccess: ({ project, createdSeedRows }) => {
      setCreatedProject(project);
      setSelectedProjectId(project.id);
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      for (const key of Object.keys(createdSeedRows)) {
        const entityKey = SEED_ENTITY_MAP[key];
        if (entityKey) queryClient.invalidateQueries({ queryKey: [entityKey] });
      }
      toast.success("Onboarding project created");
    },
    onError: (err) => toast.error(err?.message || "Could not create onboarding project"),
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProject?.id) throw new Error("Select or create a project before importing.");
      if (stagedImport.invalidRows.length) throw new Error("Resolve invalid import rows before committing.");
      const entity = entities[stagedImport.target.entityKey];
      return bulkCreateWithFallback(entity, stagedImport.validRecords);
    },
    onSuccess: (rows) => {
      queryClient.invalidateQueries({ queryKey: [stagedImport.target.entityKey] });
      setImportApproved(false);
      toast.success(`Imported ${rows.length} ${stagedImport.target.label.toLowerCase()}`);
    },
    onError: (err) => toast.error(err?.message || "Import failed"),
  });

  function updateProjectField(field, value) {
    setProjectForm((prev) => ({
      ...prev,
      [field]: value,
      ...(field === "start_date" ? { target_completion_date: addDaysIso(value, 90) } : {}),
    }));
  }

  function applyDemoDefaults() {
    const start = todayIso();
    setTemplateKey(SAMPLE_PROJECT_TEMPLATE_KEY);
    setProjectForm({
      ...defaultProjectForm(),
      project_number: "DEMO-001",
      name: SAMPLE_PROJECT.name,
      client: "Demo Client",
      general_contractor: "Demo GC",
      engineer_of_record: "Demo EOR",
      project_manager: "Sample PM",
      superintendent: "Sample Superintendent",
      original_contract_value: 1250000,
      start_date: start,
      target_completion_date: addDaysIso(start, 120),
      notes: "Demo data created from onboarding. Safe to delete after training.",
    });
  }

  function updateTeamRow(index, field, value) {
    setTeamRows((rows) => rows.map((row, rowIndex) => (
      rowIndex === index ? { ...row, [field]: value } : row
    )));
  }

  function removeTeamRow(index) {
    setTeamRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
  }

  function handleTargetChange(nextTarget) {
    setImportTarget(nextTarget);
    setImportText(IMPORT_EXAMPLES[nextTarget] || "");
    setImportSourceName("Pasted sample data");
    setImportApproved(false);
  }

  async function handleImportFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileBusy(true);
    setImportApproved(false);
    try {
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        const XLSX = await import("xlsx");
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        setImportText(XLSX.utils.sheet_to_csv(worksheet, { blankrows: false }));
        setImportSourceName(`${file.name} / ${sheetName}`);
      } else {
        setImportText(await file.text());
        setImportSourceName(file.name);
      }
    } catch (err) {
      toast.error(err?.message || "Could not read import file");
    } finally {
      setFileBusy(false);
      event.target.value = "";
    }
  }

  const createDisabled = !projectFormReady || createProjectMutation.isPending;
  const importDisabled = !selectedProject?.id
    || stagedImport.validRecords.length === 0
    || stagedImport.invalidRows.length > 0
    || !importApproved
    || importMutation.isPending;

  return (
    <div className="sb-dashboard-reference-page onboarding-page">
      <style>{onboardingStyles}</style>

      <header className="onboarding-top">
        <div>
          <span className="onboarding-eyebrow">SETUP</span>
          <h1>Onboarding</h1>
          <p>Create a clean project, seed realistic steel workflows, and stage imports for human review before writing records.</p>
        </div>
        <div className="onboarding-top-actions">
          <button type="button" className="onboarding-secondary-btn" onClick={applyDemoDefaults}>
            <Database size={15} />
            Load demo setup
          </button>
          <button type="button" className="onboarding-primary-btn" disabled={createDisabled} onClick={() => createProjectMutation.mutate()}>
            <FolderPlus size={15} />
            {createProjectMutation.isPending ? "Creating..." : "Create project"}
          </button>
        </div>
      </header>

      <section className="onboarding-checklist">
        <StepItem done={Boolean(createdProject)} icon={FolderPlus} title="Create company/project" detail="Project shell plus ownership membership" />
        <StepItem done={Boolean(templateKey)} icon={LayoutTemplate} title="Pick template" detail={selectedTemplate.name} />
        <StepItem done={teamRows.some((row) => row.email.trim())} icon={Users} title="Plan team roles" detail="Send invites on the Team page after setup" />
        <StepItem done={stagedImport.validRecords.length > 0 && stagedImport.invalidRows.length === 0} icon={FileSpreadsheet} title="Import starter data" detail={`${stagedImport.validRecords.length} rows ready`} />
        <StepItem done={importApproved} icon={ClipboardCheck} title="Review setup" detail="Human approval required before imports" />
      </section>

      <main className="onboarding-main-grid">
        <section className="onboarding-panel onboarding-wide">
          <SectionHeader icon={LayoutTemplate} title="Project Templates" detail="Choose the startup shape before creating records." />
          <div className="onboarding-template-grid">
            {TEMPLATE_OPTIONS.map((template) => (
              <TemplateCard
                key={template.key}
                template={template}
                selected={template.key === templateKey}
                onSelect={() => setTemplateKey(template.key)}
              />
            ))}
          </div>
        </section>

        <section className="onboarding-panel">
          <SectionHeader icon={FolderPlus} title="Guided Setup" detail="Project basics, roles, modules, dates, and first records." />
          <div className="onboarding-form-grid">
            <TextField label="Project Number" value={projectForm.project_number} onChange={(value) => updateProjectField("project_number", value)} required />
            <TextField label="Project Name" value={projectForm.name} onChange={(value) => updateProjectField("name", value)} required />
            <TextField label="Client" value={projectForm.client} onChange={(value) => updateProjectField("client", value)} required />
            <TextField label="General Contractor" value={projectForm.general_contractor} onChange={(value) => updateProjectField("general_contractor", value)} />
            <TextField label="Engineer of Record" value={projectForm.engineer_of_record} onChange={(value) => updateProjectField("engineer_of_record", value)} />
            <TextField label="Project Manager" value={projectForm.project_manager} onChange={(value) => updateProjectField("project_manager", value)} />
            <TextField label="Superintendent" value={projectForm.superintendent} onChange={(value) => updateProjectField("superintendent", value)} />
            <TextField label="Original Contract Value" type="number" value={projectForm.original_contract_value} onChange={(value) => updateProjectField("original_contract_value", value)} />
            <TextField label="Start Date" type="date" value={projectForm.start_date} onChange={(value) => updateProjectField("start_date", value)} required />
            <TextField label="Target Completion" type="date" value={projectForm.target_completion_date} onChange={(value) => updateProjectField("target_completion_date", value)} />
          </div>

          <div className="onboarding-subsection">
            <div className="onboarding-subsection-title">
              <Users size={16} />
              Team roles
            </div>
            <div className="onboarding-team-list">
              {teamRows.map((row, index) => (
                <div className="onboarding-team-row" key={`${index}-${row.role}`}>
                  <input value={row.email} onChange={(event) => updateTeamRow(index, "email", event.target.value)} placeholder="existing user email or invite target" />
                  <select value={row.role} onChange={(event) => updateTeamRow(index, "role", event.target.value)}>
                    {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{role}</option>)}
                  </select>
                  <input value={row.discipline} onChange={(event) => updateTeamRow(index, "discipline", event.target.value)} placeholder="discipline or crew" />
                  <button type="button" className="onboarding-icon-btn" onClick={() => removeTeamRow(index)} aria-label="Remove team row">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="onboarding-secondary-btn onboarding-add-row"
              onClick={() => setTeamRows((rows) => [...rows, { email: "", role: "viewer", discipline: "" }])}
            >
              <Plus size={14} />
              Add team row
            </button>
          </div>
        </section>

        <section className="onboarding-panel">
          <SectionHeader icon={PackagePlus} title="Setup Review" detail="Records that will be created with this template." />
          <div className="onboarding-review-card">
            <span>{selectedTemplate.key === SAMPLE_PROJECT_TEMPLATE_KEY ? "DEMO PROJECT" : "PROJECT TEMPLATE"}</span>
            <strong>{selectedTemplate.name}</strong>
            <p>{selectedTemplate.bestFor}</p>
          </div>
          <div className="onboarding-count-grid">
            {Object.entries(seedPreview)
              .filter(([, count]) => count > 0)
              .map(([key, count]) => (
                <div className="onboarding-count" key={key}>
                  <span>{formatCountLabel(key)}</span>
                  <strong>{count}</strong>
                </div>
              ))}
            {Object.values(seedPreview).every((count) => count === 0) && (
              <div className="onboarding-empty-count">No starter records for the blank template.</div>
            )}
          </div>
          {createdProject && (
            <div className="onboarding-created">
              <CheckCircle2 size={18} />
              <div>
                <strong>{createdProject.name}</strong>
                <span>Created from onboarding. Continue into the live modules below.</span>
              </div>
            </div>
          )}
          <div className="onboarding-module-actions">
            {["Dashboard", "DrawingSubmittalHub", "Schedule", "DailyLogs"].map((page) => (
              <button
                key={page}
                type="button"
                disabled={!selectedProject?.id}
                onClick={() => navigate(`${createPageUrl(page)}?project=${selectedProject.id}`)}
              >
                {page.replace(/([A-Z])/g, " $1").trim()}
                <ChevronRight size={14} />
              </button>
            ))}
          </div>
          {createdProject && (
            <button
              type="button"
              className="onboarding-primary-btn"
              style={{ marginTop: 12, width: "100%" }}
              onClick={() =>
                navigate(createPageUrl("OrgMembers"), {
                  state: {
                    prefillInvites: teamRows
                      .filter((row) => row.email.trim())
                      .map((row) => ({ email: row.email.trim(), role: row.role })),
                  },
                })
              }
            >
              <Users size={15} />
              Invite your team
              <ChevronRight size={14} />
            </button>
          )}
        </section>

        <section className="onboarding-panel onboarding-wide">
          <SectionHeader icon={Import} title="Starter Data Import" detail="Upload CSV, TSV, XLS, or XLSX data, inspect the mapped columns, fix validation errors, then approve the write." />
          <div className="onboarding-import-layout">
            <div className="onboarding-import-controls">
              <label className="onboarding-field">
                <span>Target module</span>
                <select value={importTarget} onChange={(event) => handleTargetChange(event.target.value)}>
                  {Object.entries(IMPORT_TARGETS).map(([key, target]) => (
                    <option key={key} value={key}>{target.label}</option>
                  ))}
                </select>
              </label>
              <label className="onboarding-field">
                <span>Apply to project</span>
                <select value={selectedProject?.id || selectedProjectId} onChange={(event) => { setCreatedProject(null); setSelectedProjectId(event.target.value); }}>
                  <option value="">Select a project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>{project.project_number ? `${project.project_number} - ${project.name}` : project.name}</option>
                  ))}
                  {createdProject && <option value={createdProject.id}>{createdProject.name}</option>}
                </select>
              </label>
              <label className="onboarding-upload">
                <Upload size={16} />
                <span>{fileBusy ? "Reading file..." : "Upload CSV/XLSX"}</span>
                <input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" onChange={handleImportFile} disabled={fileBusy} />
              </label>
              <button type="button" className="onboarding-secondary-btn" onClick={() => { setImportText(IMPORT_EXAMPLES[importTarget] || ""); setImportSourceName("Pasted sample data"); }}>
                <FileSpreadsheet size={14} />
                Load sample rows
              </button>
            </div>

            <div className="onboarding-import-editor">
              <div className="onboarding-import-meta">
                <span>{importSourceName}</span>
                <span>{stagedImport.validRecords.length} ready / {stagedImport.invalidRows.length} invalid</span>
              </div>
              <textarea value={importText} onChange={(event) => { setImportText(event.target.value); setImportApproved(false); }} spellCheck={false} />
            </div>
          </div>

          <div className="onboarding-mapping">
            <div className="onboarding-mapping-row onboarding-mapping-head">
              <span>Source column</span>
              <span>Mapped field</span>
            </div>
            {stagedImport.headers.map((header, index) => (
              <div className="onboarding-mapping-row" key={`${header}-${index}`}>
                <span>{header || "(blank)"}</span>
                <strong>{stagedImport.mappedHeaders[index] || "Ignored"}</strong>
              </div>
            ))}
            {stagedImport.headers.length === 0 && (
              <div className="onboarding-mapping-empty">Paste or upload a file to see column mapping.</div>
            )}
          </div>

          {stagedImport.invalidRows.length > 0 && (
            <div className="onboarding-validation">
              <AlertTriangle size={18} />
              <div>
                <strong>{stagedImport.invalidRows.length} row(s) need review before import.</strong>
                <ul>
                  {stagedImport.invalidRows.slice(0, 5).map((row) => (
                    <li key={row.rowNumber}>
                      Row {row.rowNumber}: {row.missing?.length ? `missing ${row.missing.join(", ")}` : ""}
                      {row.invalidValues?.length ? ` invalid ${row.invalidValues.map((item) => `${item.field}=${item.value}`).join(", ")}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="onboarding-import-approval">
            <label>
              <input
                type="checkbox"
                checked={importApproved}
                onChange={(event) => setImportApproved(event.target.checked)}
              />
              I reviewed the preview and approve writing these records.
            </label>
            <button type="button" className="onboarding-primary-btn" disabled={importDisabled} onClick={() => importMutation.mutate()}>
              <Import size={15} />
              {importMutation.isPending ? "Importing..." : `Commit ${stagedImport.validRecords.length} rows`}
            </button>
          </div>
        </section>

        <section className="onboarding-panel onboarding-wide">
          <SectionHeader icon={ClipboardCheck} title="Template Library" detail="Reusable defaults that make the first project useful without loose notes." />
          <div className="onboarding-library-grid">
            {TEMPLATE_LIBRARY.map((item) => (
              <div className="onboarding-library-card" key={item.title}>
                <span>{item.category}</span>
                <strong>{item.title}</strong>
                <div>
                  {item.items.map((entry) => <small key={entry}>{entry}</small>)}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

const onboardingStyles = `
.onboarding-page {
  padding: 24px;
  color: var(--text-primary);
  background: var(--bg);
}

.onboarding-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}

.onboarding-eyebrow,
.onboarding-template-header,
.onboarding-review-card > span,
.onboarding-library-card > span,
.onboarding-import-meta,
.onboarding-step span,
.onboarding-section-header p,
.onboarding-count span,
.onboarding-created span {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.onboarding-top h1 {
  margin: 4px 0 8px;
  font-size: 34px;
  line-height: 1.05;
  letter-spacing: 0;
}

.onboarding-top p {
  max-width: 760px;
  margin: 0;
  color: var(--text-secondary);
  font-size: 15px;
}

.onboarding-top-actions,
.onboarding-import-approval,
.onboarding-module-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.onboarding-primary-btn,
.onboarding-secondary-btn,
.onboarding-module-actions button,
.onboarding-upload {
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 7px;
  border: 1px solid var(--border-default);
  padding: 0 14px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, opacity 0.15s ease;
}

.onboarding-primary-btn {
  background: var(--accent);
  border-color: var(--accent);
  color: #061018;
}

.onboarding-secondary-btn,
.onboarding-module-actions button,
.onboarding-upload {
  background: var(--bg-surface);
  color: var(--text-primary);
}

.onboarding-primary-btn:disabled,
.onboarding-secondary-btn:disabled,
.onboarding-module-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.onboarding-checklist {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}

.onboarding-step {
  display: flex;
  gap: 10px;
  min-height: 74px;
  padding: 14px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-surface);
}

.onboarding-step.is-done {
  border-color: var(--success);
  background: var(--success-muted);
}

.onboarding-step-icon {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  background: var(--bg-surface-high);
  color: var(--accent);
  flex: 0 0 auto;
}

.onboarding-step strong {
  display: block;
  margin-bottom: 4px;
  font-size: 13px;
}

.onboarding-step span {
  display: block;
  line-height: 1.35;
}

.onboarding-main-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(340px, 0.85fr);
  gap: 16px;
}

.onboarding-panel {
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-surface);
  padding: 18px;
  min-width: 0;
}

.onboarding-wide {
  grid-column: 1 / -1;
}

.onboarding-section-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;
}

.onboarding-section-icon {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: var(--accent-muted);
  color: var(--accent);
}

.onboarding-section-header h2 {
  margin: 0 0 4px;
  font-size: 18px;
  letter-spacing: 0;
}

.onboarding-section-header p {
  margin: 0;
  line-height: 1.4;
}

.onboarding-template-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(180px, 1fr));
  gap: 10px;
}

.onboarding-template-card {
  display: flex;
  min-height: 220px;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-surface-low);
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
}

.onboarding-template-card.is-selected {
  border-color: var(--template-accent);
  box-shadow: inset 0 0 0 1px var(--template-accent);
}

.onboarding-template-card strong {
  font-size: 15px;
}

.onboarding-template-card p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.45;
}

.onboarding-template-header {
  display: flex;
  align-items: center;
  gap: 7px;
}

.onboarding-template-dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: var(--template-accent);
}

.onboarding-template-modules {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: auto;
}

.onboarding-template-modules span,
.onboarding-library-card small {
  border: 1px solid var(--border-default);
  border-radius: 999px;
  padding: 4px 7px;
  color: var(--text-secondary);
  font-size: 11px;
  background: var(--bg-surface);
}

.onboarding-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.onboarding-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.onboarding-field span,
.onboarding-subsection-title {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.onboarding-field input,
.onboarding-field select,
.onboarding-team-row input,
.onboarding-team-row select,
.onboarding-import-editor textarea {
  width: 100%;
  border: 1px solid var(--border-default);
  border-radius: 7px;
  background: var(--bg-surface-high);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
}

.onboarding-field input,
.onboarding-field select,
.onboarding-team-row input,
.onboarding-team-row select {
  height: 38px;
  padding: 0 10px;
}

.onboarding-subsection {
  margin-top: 18px;
}

.onboarding-subsection-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.onboarding-team-list {
  display: grid;
  gap: 8px;
}

.onboarding-team-row {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) 96px minmax(140px, 0.8fr) 34px;
  gap: 8px;
  align-items: center;
}

.onboarding-icon-btn {
  height: 34px;
  width: 34px;
  border: 1px solid var(--border-default);
  border-radius: 7px;
  background: var(--bg-surface-high);
  color: var(--text-secondary);
  cursor: pointer;
}

.onboarding-add-row {
  margin-top: 10px;
}

.onboarding-review-card,
.onboarding-created,
.onboarding-validation {
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-surface-low);
  padding: 14px;
}

.onboarding-review-card strong {
  display: block;
  margin-top: 5px;
  font-size: 17px;
}

.onboarding-review-card p {
  margin: 8px 0 0;
  color: var(--text-secondary);
  line-height: 1.45;
}

.onboarding-count-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 12px 0;
}

.onboarding-count {
  min-height: 66px;
  padding: 11px;
  border-radius: 8px;
  background: var(--bg-surface-high);
  border: 1px solid var(--border-default);
}

.onboarding-count strong {
  display: block;
  margin-top: 6px;
  font-size: 24px;
}

.onboarding-empty-count {
  grid-column: 1 / -1;
  color: var(--text-secondary);
}

.onboarding-created {
  display: flex;
  gap: 10px;
  margin: 12px 0;
  color: var(--success);
}

.onboarding-created strong {
  display: block;
  color: var(--text-primary);
}

.onboarding-module-actions button {
  min-height: 32px;
  justify-content: space-between;
}

.onboarding-import-layout {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 14px;
}

.onboarding-import-controls {
  display: grid;
  gap: 10px;
  align-content: start;
}

.onboarding-upload {
  position: relative;
  overflow: hidden;
}

.onboarding-upload input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.onboarding-import-editor {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.onboarding-import-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.onboarding-import-editor textarea {
  min-height: 172px;
  resize: vertical;
  padding: 12px;
  font-family: var(--font-mono);
  line-height: 1.45;
}

.onboarding-mapping {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  margin-top: 14px;
  overflow: hidden;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--border-default);
}

.onboarding-mapping-row {
  display: contents;
}

.onboarding-mapping-row span,
.onboarding-mapping-row strong,
.onboarding-mapping-empty {
  min-height: 36px;
  padding: 10px 12px;
  background: var(--bg-surface-high);
  font-size: 12px;
}

.onboarding-mapping-head span {
  background: var(--bg-surface-low);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-weight: 800;
  text-transform: uppercase;
}

.onboarding-mapping-empty {
  grid-column: 1 / -1;
  color: var(--text-secondary);
}

.onboarding-validation {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 12px;
  border-color: var(--warning);
  color: var(--warning);
}

.onboarding-validation strong {
  color: var(--text-primary);
}

.onboarding-validation ul {
  margin: 8px 0 0;
  padding-left: 18px;
  color: var(--text-secondary);
}

.onboarding-import-approval {
  justify-content: space-between;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border-default);
}

.onboarding-import-approval label {
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--text-secondary);
  font-size: 13px;
}

.onboarding-library-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(150px, 1fr));
  gap: 10px;
}

.onboarding-library-card {
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-surface-low);
  padding: 13px;
}

.onboarding-library-card strong {
  display: block;
  margin: 5px 0 10px;
}

.onboarding-library-card div {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

@media (max-width: 1200px) {
  .onboarding-checklist,
  .onboarding-template-grid,
  .onboarding-library-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .onboarding-main-grid,
  .onboarding-import-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .onboarding-page {
    padding: 16px;
  }

  .onboarding-top {
    flex-direction: column;
  }

  .onboarding-top-actions,
  .onboarding-primary-btn,
  .onboarding-secondary-btn,
  .onboarding-upload {
    width: 100%;
  }

  .onboarding-checklist,
  .onboarding-template-grid,
  .onboarding-form-grid,
  .onboarding-count-grid,
  .onboarding-library-grid {
    grid-template-columns: 1fr;
  }

  .onboarding-team-row {
    grid-template-columns: 1fr;
  }

  .onboarding-icon-btn {
    width: 100%;
  }
}
`;
