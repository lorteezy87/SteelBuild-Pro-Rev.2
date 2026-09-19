/**
 * useGcDocumentsPageState — every piece of local UI state on the GC Documents
 * page, and nothing else. No queries, no mutations, no derivation: the page
 * composes this with useGcDocumentsPageData and useGcDocumentsPageController,
 * mirroring src/pages/drawings/.
 */

import { useState } from "react";
import { ALL } from "./gcDocumentsPageDerive";
import type { GcDrawingSetRow, GcIssuance } from "./gcDocumentsPageDerive";

/** Read-only view of the query string, so tests can pass a plain object. */
export type SearchParams = Pick<URLSearchParams, "get">;

export interface GcConfirmState {
  title: string;
  description: string;
  run: () => void | Promise<void>;
}

export function useGcDocumentsPageState(searchParams?: SearchParams) {
  // Deep links: /GcDocuments?docType=asi&impact=_needsReview lets the
  // dashboard and alerts point straight at a filtered register.
  const [search, setSearch] = useState("");
  const [docType, setDocType] = useState<string>(searchParams?.get("docType") || ALL);
  const [impact, setImpact] = useState<string>(searchParams?.get("impact") || ALL);

  // Which issuance rows are expanded to show their sheets.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  // Modal targets. Each is null when closed — no separate open flags to drift.
  const [editingSet, setEditingSet] = useState<GcDrawingSetRow | null>(null);
  const [impactTarget, setImpactTarget] = useState<GcIssuance | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [confirmState, setConfirmState] = useState<GcConfirmState | null>(null);
  const [saving, setSaving] = useState(false);

  return {
    search, setSearch,
    docType, setDocType,
    impact, setImpact,
    expanded, setExpanded,
    editingSet, setEditingSet,
    impactTarget, setImpactTarget,
    uploadOpen, setUploadOpen,
    confirmState, setConfirmState,
    saving, setSaving,
  };
}

export type GcDocumentsPageState = ReturnType<typeof useGcDocumentsPageState>;
