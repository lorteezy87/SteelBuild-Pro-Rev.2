import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import WorkPackageList from "@/components/workpackages/WorkPackageList";
import WorkPackageDetailModal from "@/components/workpackages/WorkPackageDetailModal";
import WPFormModal from "@/components/workpackages/WPFormModal";
import DeleteDialog from "@/components/shared/DeleteDialog";
import { getNextNumber } from "@/components/shared/numberSequencing";

const PHASE_COLORS = {
  Detailing: "var(--status-info)",
  Fabrication: "var(--status-warning)",
  Delivery: "var(--accent)",
  Erection: "var(--status-success)",
};

const STATUS_COLORS = {
  "Not Started": "var(--text-muted)",
  "In Progress": "var(--status-warning)",
  Complete: "var(--status-success)",
  "On Hold": "var(--status-error)",
};

const PHASE_COLORS_BAR = { ...PHASE_COLORS };

const DRAWING_STAGES = [
  { id: "Not Started", label: "NOT STARTED", color: "var(--text-muted)" },
  { id: "OFA", label: "OFA", color: "var(--status-info)" },
  { id: "BFA", label: "BFA", color: "var(--status-warning)" },
  { id: "OFS", label: "OFS", color: "var(--secondary)" },
  { id: "BFS", label: "BFS", color: "var(--secondary)" },
  { id: "FFF", label: "FFF", color: "var(--tertiary)" },
  { id: "Released", label: "RELEASED", color: "var(--status-success)" },
];

const STAGE_STYLES = {
  "Not Started": { bg: "rgba(144,144,149,0.12)", color: "var(--text-muted)" },
  OFA: { bg: "rgba(123,208,255,0.12)", color: "var(--status-info)" },
  BFA: { bg: "rgba(255,185,95,0.12)", color: "var(--status-warning)" },
  OFS: { bg: "rgba(68,226,205,0.12)", color: "var(--secondary)" },
  BFS: { bg: "rgba(68,226,205,0.12)", color: "var(--secondary)" },
  FFF: { bg: "rgba(255,185,95,0.15)", color: "var(--tertiary)" },
  Released: { bg: "rgba(168,240,203,0.12)", color: "var(--status-success)" },
};

const STATUS_COLUMNS = ["Not Started", "In Progress", "Complete", "On Hold"];

const VIEW_OPTIONS = [
  { id: "list", label: "≡ List" },
  { id: "board", label: "⊞ Board" },
  { id: "drawings", label: "⊟ Drawings" },
];

const formatDate = (d) =>
  d
    ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

export default function WorkPackages() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("project");
  const qc = useQueryClient();

  const [view, setView] = useState("list");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPhase, setFilterPhase] = useState("all");
  const [search, setSearch] = useState("");
  const [editingWP, setEditingWP] = useState(null);
  const [wpModalOpen, setWPModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [expandedWP, setExpandedWP] = useState(null);
  const [drawingStageFilter, setDrawingStageFilter] = useState("all");
  const [selectedBoardWP, setSelectedBoardWP] = useState(null);

  const { data: workPackages = [] } = useQuery({
    queryKey: ["work-packages", projectId],
    queryFn: async () => {
      if (projectId) {
        return base44.entities.WorkPackage.filter({ project_id: projectId });
      }
      const all = await base44.entities.WorkPackage.list();
      return all.sort((a, b) => (a.project_name || "").localeCompare(b.project_name || ""));
    },
    initialData: [],
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
  });

  const { data: drawings = [] } = useQuery({
    queryKey: ["drawings", projectId],
    queryFn: () => (projectId ? base44.entities.Drawing.filter({ project_id: projectId }) : []),
    enabled: !!projectId,
    initialData: [],
  });

  const updateWPMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.WorkPackage.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-packages"] });
      qc.invalidateQueries({ queryKey: ["wps-all"] });
      toast.success("Work package updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const createWPMut = useMutation({
    mutationFn: (data) => base44.entities.WorkPackage.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-packages"] });
      qc.invalidateQueries({ queryKey: ["wps-all"] });
      setWPModalOpen(false);
      setEditingWP(null);
      toast.success("Work package created");
    },
    onError: (err) => toast.error(err.message),
  });

  const quickCompleteMut = useMutation({
    mutationFn: (id) =>
      base44.entities.WorkPackage.update(id, {
        status: "Complete",
        percent_complete: 100,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-packages"] });
      qc.invalidateQueries({ queryKey: ["wps-all"] });
      toast.success("Work package marked complete");
    },
    onError: () => toast.error("Update failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.WorkPackage.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-packages"] });
      qc.invalidateQueries({ queryKey: ["wps-all"] });
      setDeleteTarget(null);
      toast.success("Work package deleted");
    },
    onError: () => toast.error("Delete failed"),
  });

  const filtered = useMemo(() => {
    return workPackages.filter((wp) => {
      const statusMatch = filterStatus === "all" || wp.status === filterStatus;
      const phaseMatch = filterPhase === "all" || wp.phase === filterPhase;
      const q = search.toLowerCase();
      const searchMatch =
        !q ||
        (wp.name || "").toLowerCase().includes(q) ||
        (wp.wp_number || "").toLowerCase().includes(q) ||
        (wp.crew || "").toLowerCase().includes(q);
      return statusMatch && phaseMatch && searchMatch;
    });
  }, [workPackages, filterStatus, filterPhase, search]);

  const stats = useMemo(() => {
    const totalTons = workPackages.reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
    return {
      total: workPackages.length,
      notStarted: workPackages.filter((w) => w.status === "Not Started").length,
      inProgress: workPackages.filter((w) => w.status === "In Progress").length,
      complete: workPackages.filter((w) => w.status === "Complete").length,
      onHold: workPackages.filter((w) => w.status === "On Hold").length,
      totalTons,
      fabTons: workPackages
        .filter((w) => w.phase === "Fabrication")
        .reduce((s, w) => s + (Number(w.tonnage) || 0), 0),
      erectedTons: workPackages
        .filter((w) => w.phase === "Erection" && w.status === "Complete")
        .reduce((s, w) => s + (Number(w.tonnage) || 0), 0),
      avgProgress:
        workPackages.length > 0
          ? Math.round(
              workPackages.reduce((s, w) => s + (Number(w.percent_complete) || 0), 0) / workPackages.length
            )
          : 0,
    };
  }, [workPackages]);

  const phaseTons = useMemo(() => {
    return ["Detailing", "Fabrication", "Delivery", "Erection"].map((phase) => ({
      phase,
      tons: workPackages.filter((w) => w.phase === phase).reduce((s, w) => s + (Number(w.tonnage) || 0), 0),
      color: PHASE_COLORS_BAR[phase],
    }));
  }, [workPackages]);

  const drawingsByStage = useMemo(() => {
    const m = {};
    DRAWING_STAGES.forEach((s) => (m[s.id] = 0));
    drawings.forEach((d) => {
      if (m.hasOwnProperty(d.stage)) m[d.stage] += 1;
    });
    return m;
  }, [drawings]);

  const drawingTotal = drawings.length || 1;
  const overdueDrawings = drawings.filter(
    (d) => d.due_date && new Date(`${d.due_date}T00:00:00Z`) < new Date() && d.stage !== "Released"
  );

  const handleWPEdit = (wp) => {
    if (wp?._quickComplete) {
      quickCompleteMut.mutate(wp.id);
      return;
    }
    setEditingWP(wp);
    setWPModalOpen(true);
  };

  const handleWPCreate = () => {
    const nextNum = getNextNumber(workPackages, "wp_number", "WP-");
    setEditingWP({ wp_number: nextNum, project_id: projectId });
    setWPModalOpen(true);
  };
