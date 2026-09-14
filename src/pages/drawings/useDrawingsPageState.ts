import { useEffect, useRef, useState } from "react";
import type { Drawing } from "@/hooks/useDrawings";
import type {
  AdvanceStagePlan,
  DrawingLike,
  DrawingSetGroupLike,
  MarkerSetPlan,
} from "./drawingActionHelpers";
import type { LinkableSubmittal } from "@/lib/submittalLinkGlue";

type SearchParams = Pick<URLSearchParams, "get">;
type AdvanceTarget = Extract<AdvanceStagePlan, { kind: "dialog" }>["target"];
type MarkerSet = Extract<MarkerSetPlan, { kind: "open" }>["markerSet"];

export interface ConfirmState {
  title: string;
  description: string;
  run: () => void | Promise<void>;
}

export interface AttachPrompt {
  setId: string;
  setName: string | null;
  revisionLabel: string | null;
  candidates: LinkableSubmittal[];
}

export function useDrawingsPageState(searchParams: SearchParams) {
  const [view, setView] = useState("list");
  const [search, setSearch] = useState(
    searchParams.get("search") || searchParams.get("sheet") || "",
  );
  const [setFilterId, setSetFilterId] = useState<string | null>(
    searchParams.get("set") || null,
  );
  const [discipline, setDiscipline] = useState("ALL");
  const [stageFilter, setStageFilter] = useState("ALL");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Drawing | null>(null);
  const [saving, setSaving] = useState(false);
  const [bulkStage, setBulkStage] = useState("");
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<unknown>(null);
  const [advanceTarget, setAdvanceTarget] = useState<AdvanceTarget | null>(null);
  const [approvalSet, setApprovalSet] = useState<{
    setName: string;
    setId: string | null;
    sheets: DrawingLike[];
  } | null>(null);
  const [savingApproval, setSavingApproval] = useState(false);
  const [renameSet, setRenameSet] = useState<{
    setId: string | null;
    setName: string;
    sheets: DrawingLike[];
  } | null>(null);
  const [savingRename, setSavingRename] = useState(false);
  const [markerSet, setMarkerSet] = useState<MarkerSet | null>(null);
  const [uploadSetOpen, setUploadSetOpen] = useState(false);
  const [logImportOpen, setLogImportOpen] = useState(false);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [attachPrompt, setAttachPrompt] = useState<AttachPrompt | null>(null);
  const [attachBusy, setAttachBusy] = useState(false);
  const [compareDrawing, setCompareDrawing] = useState<Drawing | null>(null);
  const [reportSet, setReportSet] = useState<DrawingSetGroupLike | null>(null);
  const [exportPkgKind, setExportPkgKind] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const contextRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setSearch(searchParams.get("search") || searchParams.get("sheet") || "");
    setSetFilterId(searchParams.get("set") || null);
  }, [searchParams]);

  return {
    view,
    setView,
    search,
    setSearch,
    setFilterId,
    setSetFilterId,
    discipline,
    setDiscipline,
    stageFilter,
    setStageFilter,
    selected,
    setSelected,
    showModal,
    setShowModal,
    editing,
    setEditing,
    saving,
    setSaving,
    bulkStage,
    setBulkStage,
    bulkEditOpen,
    setBulkEditOpen,
    contextMenu,
    setContextMenu,
    advanceTarget,
    setAdvanceTarget,
    approvalSet,
    setApprovalSet,
    savingApproval,
    setSavingApproval,
    renameSet,
    setRenameSet,
    savingRename,
    setSavingRename,
    markerSet,
    setMarkerSet,
    uploadSetOpen,
    setUploadSetOpen,
    logImportOpen,
    setLogImportOpen,
    revisionOpen,
    setRevisionOpen,
    attachPrompt,
    setAttachPrompt,
    attachBusy,
    setAttachBusy,
    compareDrawing,
    setCompareDrawing,
    reportSet,
    setReportSet,
    exportPkgKind,
    setExportPkgKind,
    confirmState,
    setConfirmState,
    contextRef,
  };
}

export type DrawingsPageState = ReturnType<typeof useDrawingsPageState>;
