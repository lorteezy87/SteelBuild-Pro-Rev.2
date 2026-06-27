/**
 * PdfImportReview.jsx — Standalone page for the PDF Import Review Queue.
 *
 * Accessible from:
 *   - Integrations page (Bluebeam / PDF Workflows card action)
 *   - Drawings page toolbar
 *   - Direct URL: /PdfImportReview
 *
 * Project-scoped: requires an active project to function.
 */

import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, FileText, Upload } from "lucide-react";
import { toast } from "sonner";

import { useProjectContext } from "@/components/shared/ProjectContext";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { CommandBar, Button } from "@/components/design-system";
import PdfImportQueue from "@/components/integrations/PdfImportQueue";
import { generateMarkupExportPackage, suggestExportFilename } from "@/lib/integrations/markupExport";

const mono = { fontFamily: "var(--font-mono)" };

export default function PdfImportReview() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { activeProject } = useProjectContext();
  const projectId = activeProject?.id;
  const [exporting, setExporting] = useState(false);

  // Load drawings for the markup export feature.
  const { data: drawings = [] } = useQuery({
    queryKey: ["drawings", projectId],
    queryFn: () => base44.entities.Drawing.filter({ project_id: projectId }, undefined, 2000),
    enabled: !!projectId,
  });

  // Drawings that have markup content.
  const markedUpDrawings = useMemo(
    () => drawings.filter((d) => Array.isArray(d.markup) && d.markup.length > 0),
    [drawings]
  );

  const handleExportMarkups = async () => {
    if (markedUpDrawings.length === 0) {
      toast.error("No drawings with markups to export.");
      return;
    }
    setExporting(true);
    try {
      const pdf = generateMarkupExportPackage({
        project: {
          id: projectId,
          name: activeProject?.name,
          project_number: activeProject?.project_number,
        },
        drawings: markedUpDrawings,
        options: {
          openOnly: false,
          includeSummary: true,
          title: `${activeProject?.project_number || ""} Markup Export`.trim(),
        },
      });
      const filename = suggestExportFilename({
        projectNumber: activeProject?.project_number,
        label: activeProject?.name,
      });
      pdf.save(filename);
      toast.success(`Exported ${markedUpDrawings.length} sheets to ${filename}`);
    } catch (e) {
      toast.error(e?.message || "Export failed.");
    } finally {
      setExporting(false);
    }
  };

  const handleRecordCreated = (records) => {
    if (records?.length) {
      qc.invalidateQueries({ queryKey: ["drawings", projectId] });
      qc.invalidateQueries({ queryKey: ["rfis", projectId] });
      qc.invalidateQueries({ queryKey: ["documents", projectId] });
    }
  };

  if (!projectId) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <div style={{ ...mono, fontSize: 12, color: "var(--text-muted)" }}>
          Select a project to access the PDF Import Review Queue.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: "0 0 40px" }}>
      <CommandBar
        eyebrow="INTEGRATIONS"
        title="PDF Import Review"
        subtitle="Bluebeam, PlanGrid, and generic PDF imports staged for human review"
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(createPageUrl("Integrations"))}
        >
          <ArrowLeft size={12} /> Integrations
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(createPageUrl("Drawings"))}
        >
          <FileText size={12} /> Drawings
        </Button>
        {markedUpDrawings.length > 0 && (
          <Button
            variant="primary"
            size="sm"
            onClick={handleExportMarkups}
            disabled={exporting}
          >
            <Download size={12} />
            {exporting ? "Exporting..." : `Export Markups (${markedUpDrawings.length} sheets)`}
          </Button>
        )}
      </CommandBar>

      <div style={{ padding: "0 20px" }}>
        <PdfImportQueue
          projectId={projectId}
          projectName={activeProject?.name}
          projectNumber={activeProject?.project_number}
          onRecordCreated={handleRecordCreated}
        />
      </div>
    </div>
  );
}
