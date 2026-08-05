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
  buildSeedPayloads,
  stageImportText,
  summarizeSeedPayloads,
} from "@/lib/onboardingTemplates";
import {
  buildDemoProjectForm,
  buildInvitePrefill,
  buildPayloadWithTeamPlan,
  buildPreviewProject,
  createDefaultProjectForm,
  formatCountLabel,
  isProjectFormReady,
  nextProjectFormWithField,
} from "./onboarding/onboardingPageHelpers";
import {
  TextField,
  StepItem,
  TemplateCard,
  SectionHeader,
} from "./onboarding/OnboardingUi";
import {
  IMPORT_EXAMPLES,
  INVALID_IMPORT_TARGET,
  ROLE_OPTIONS,
  bulkCreateWithFallback,
  createSeedRecords,
  readOnboardingImportFile,
} from "./onboarding/onboardingMutationHelpers";
import { onboardingStyles } from "./onboarding/onboardingStyles";

const TEMPLATE_OPTIONS = [SAMPLE_PROJECT, ...PROJECT_TEMPLATES];

export default function Onboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [templateKey, setTemplateKey] = useState("fabrication_erection");
  const [projectForm, setProjectForm] = useState(createDefaultProjectForm);
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
  const projectFormReady = isProjectFormReady(projectForm, templateKey);
  const selectedProject = createdProject || projects.find((project) => project.id === selectedProjectId) || null;
  const previewProject = useMemo(
    () => buildPreviewProject(selectedProject, projectForm, isDemoTemplate),
    [isDemoTemplate, projectForm.name, projectForm.start_date, selectedProject],
  );

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
      const createdSeedRows = await createSeedRecords(seedPayloads, entities);
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
    setProjectForm((prev) => nextProjectFormWithField(prev, field, value));
  }

  function applyDemoDefaults() {
    setTemplateKey(SAMPLE_PROJECT_TEMPLATE_KEY);
    setProjectForm(buildDemoProjectForm());
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
      const { text, sourceName } = await readOnboardingImportFile(file);
      setImportText(text);
      setImportSourceName(sourceName);
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
                    prefillInvites: buildInvitePrefill(teamRows),
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

