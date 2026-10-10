/**
 * GcImpactModal — record whether an issuance hits steel scope.
 *
 * This is the one place the steel_impact question gets answered, and it is a
 * deliberate, separate act from logging the document. "Not reviewed" is a
 * state, not a default to be clicked past: the modal opens on whatever is
 * stored and requires a positive choice to move off it.
 */

import { useEffect, useState } from "react";
import { Modal, Button } from "./dsPrimitives";
import type { RowWithAliases } from "@/api/supabaseClient";
import {
  STEEL_IMPACT_LABELS,
  STEEL_IMPACT_STATES,
  STEEL_IMPACT_TOKENS,
  coerceSteelImpact,
  type SteelImpact,
} from "@/lib/gcDocuments/gcDocTypes";
import type { GcIssuance } from "./gcDocumentsPageDerive";

const HINTS: Record<SteelImpact, string> = {
  unknown: "Nobody has read it yet. This is not a verdict.",
  pending_review: "Being reviewed now — the answer is still open.",
  none: "Read it. Nothing in it changes our scope, quantities or sequence.",
  impacted: "Read it. It changes our scope, quantities, connections or sequence.",
};

export default function GcImpactModal({
  open,
  issuance,
  saving = false,
  shopSets = [],
  linkedShopSetIds = [],
  linksStatus = "unavailable",
  shopSetsStatus = "unavailable",
  onSave,
  onSaveLinks,
  onClose,
}: {
  open: boolean;
  issuance: GcIssuance | null;
  saving?: boolean;
  shopSets?: RowWithAliases<"drawing_sets">[];
  linkedShopSetIds?: string[];
  linksStatus?: "loading" | "available" | "unavailable";
  shopSetsStatus?: "loading" | "available" | "unavailable";
  onSave: (impact: SteelImpact, notes: string | null) => void | Promise<void>;
  onSaveLinks?: (shopSetIds: string[]) => void | Promise<void>;
  onClose: () => void;
}) {
  const [impact, setImpact] = useState<SteelImpact>("unknown");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shopSearch, setShopSearch] = useState("");
  const [selectedShopIds, setSelectedShopIds] = useState<string[]>([]);
  const serverIdsKey = [...linkedShopSetIds].sort().join("|");

  useEffect(() => {
    if (open && issuance) {
      setImpact(coerceSteelImpact(issuance.set.steel_impact));
      setNotes(String(issuance.set.impact_notes ?? ""));
      setError(null);
      setShopSearch("");
      setSelectedShopIds([]);
    }
  }, [open, issuance?.id]);

  useEffect(() => {
    if (open && linksStatus === "available") setSelectedShopIds([...linkedShopSetIds]);
  }, [open, issuance?.id, linksStatus, serverIdsKey]);

  if (!open || !issuance) return null;

  const linksReady = linksStatus === "available" && shopSetsStatus === "available";
  const selectedIdsKey = [...selectedShopIds].sort().join("|");
  const linksDirty = selectedIdsKey !== serverIdsKey;
  const shopById = new Map(shopSets.map((set) => [set.id, set]));
  const matchingShopSets = shopSets
    .filter((set) => {
      const q = shopSearch.trim().toLowerCase();
      return !q || String(set.set_name ?? "").toLowerCase().includes(q)
        || String(set.register ?? "").toLowerCase().includes(q);
    })
    .sort((a, b) => String(a.set_name ?? "").localeCompare(String(b.set_name ?? ""), undefined, { numeric: true }));
  const visibleShopSets = matchingShopSets.slice(0, 80);
  const toggleShopSet = (id: string) => {
    setSelectedShopIds((prior) => prior.includes(id)
      ? prior.filter((value) => value !== id)
      : [...prior, id]);
  };

  const handleSave = async () => {
    // A bare "impacts steel" with no note is a dead end for whoever picks this
    // up next — and it is usually the input to an RFI or a change order.
    if (impact === "impacted" && !notes.trim()) {
      setError("Say what it impacts — this is what the RFI or change order gets written from.");
      return;
    }
    if (linksDirty) {
      setError("Save or discard the affected shop-set selection before recording the impact disposition.");
      return;
    }
    if (impact === "none") {
      if (linksStatus !== "available") {
        setError("Verify the affected shop-set links before recording no steel impact.");
        return;
      }
      if (linkedShopSetIds.length > 0) {
        setError("Remove the affected shop-set links before recording no steel impact.");
        return;
      }
    }
    setError(null);
    await onSave(impact, notes.trim() || null);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow={issuance.label}
      title="Steel impact"
      width={720}
      footer={
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
          {error && (
            <span role="alert" style={{ flex: 1, fontSize: 12, color: "var(--status-error)" }}>
              {error}
            </span>
          )}
          <Button variant="ghost" onClick={onClose} disabled={saving}>CANCEL</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? "SAVING…" : "RECORD"}
          </Button>
        </div>
      }
    >
      <div style={{ display: "grid", gap: 14 }}>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-secondary, var(--text-muted))", lineHeight: 1.55 }}>
          {issuance.set.set_name}
          {issuance.sheets.length > 0 && ` · ${issuance.sheets.length} sheet(s)`}
        </p>

        <div role="radiogroup" aria-label="Steel impact" style={{ display: "grid", gap: 8 }}>
          {STEEL_IMPACT_STATES.map((state) => {
            const selected = impact === state;
            return (
              <button
                key={state}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setImpact(state)}
                style={{
                  display: "grid",
                  gap: 2,
                  textAlign: "left",
                  padding: "10px 12px",
                  borderRadius: 8,
                  cursor: "pointer",
                  background: selected ? "var(--bg-surface-high)" : "var(--bg-surface-low)",
                  border: `1px solid ${selected ? STEEL_IMPACT_TOKENS[state] : "var(--border-default)"}`,
                  color: "var(--text-primary)",
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: STEEL_IMPACT_TOKENS[state] }}>
                  {STEEL_IMPACT_LABELS[state]}
                </span>
                <span style={{ fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.45 }}>
                  {HINTS[state]}
                </span>
              </button>
            );
          })}
        </div>

        <div>
          <label
            htmlFor="gc-impact-notes"
            style={{
              display: "block", fontSize: 11, letterSpacing: "0.08em",
              textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 4,
            }}
          >
            What it affects
          </label>
          <textarea
            id="gc-impact-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Grid C canopy connections — new embed plates, affects sequence 3."
            style={{
              width: "100%", minHeight: 88, resize: "vertical", padding: "8px 10px",
              borderRadius: 8, border: "1px solid var(--border-default)",
              background: "var(--bg-surface-low)", color: "var(--text-primary)",
              fontSize: 13, outline: "none",
            }}
          />
        </div>

        <section aria-label="Affected shop drawing sets" style={{ borderTop: "1px solid var(--border-default)", paddingTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 14, color: "var(--text-primary)" }}>Affected shop drawing sets</h3>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.45 }}>
                Choose our exact shop sets after reviewing the GC issuance. This mapping does not approve sheets or release fabrication.
              </p>
            </div>
            {linksReady && (
              <Button variant="ghost" onClick={() => { void onSaveLinks?.(selectedShopIds); }} disabled={saving || !linksDirty || !onSaveLinks}>
                {saving ? "SAVING…" : "SAVE SET LINKS"}
              </Button>
            )}
          </div>

          {!linksReady ? (
            <p role="status" style={{ margin: "12px 0 0", fontSize: 12, color: "var(--status-review)" }}>
              {linksStatus === "loading" || shopSetsStatus === "loading"
                ? "Checking project-scoped link evidence…"
                : "Affected set links are unavailable. Impact notes can still be recorded; no set is assumed clear or linked."}
            </p>
          ) : (
            <>
              {selectedShopIds.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                  {selectedShopIds.map((id) => (
                    <button key={id} type="button" onClick={() => toggleShopSet(id)}
                      aria-label={`Remove ${String(shopById.get(id)?.set_name ?? id)} from affected shop sets`}
                      style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid var(--border-default)", background: "var(--bg-surface-high)", color: "var(--text-primary)", fontSize: 11.5 }}>
                      {String(shopById.get(id)?.set_name ?? `Archived set ${id}`)} ×
                    </button>
                  ))}
                </div>
              ) : (
                <p style={{ margin: "10px 0", color: "var(--text-muted)", fontSize: 12 }}>No shop sets explicitly linked.</p>
              )}
              <label htmlFor="gc-shop-set-search" style={{ display: "block", marginTop: 12, fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Find shop drawing set
              </label>
              <input id="gc-shop-set-search" value={shopSearch} onChange={(event) => setShopSearch(event.target.value)}
                placeholder="Search our set names or registers"
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border-default)", background: "var(--bg-surface-low)", color: "var(--text-primary)", fontSize: 12.5 }} />
              <div role="group" aria-label="Shop drawing set options" style={{ maxHeight: 180, overflowY: "auto", border: "1px solid var(--border-default)", borderRadius: 8, marginTop: 7 }}>
                {visibleShopSets.length ? visibleShopSets.map((set) => (
                  <label key={set.id} style={{ display: "flex", gap: 10, padding: "7px 10px", borderBottom: "1px solid var(--border-default)", color: "var(--text-primary)", fontSize: 12, cursor: "pointer" }}>
                    <input type="checkbox" checked={selectedShopIds.includes(set.id)} onChange={() => toggleShopSet(set.id)} />
                    <span>{String(set.set_name ?? "Untitled shop set")}</span>
                    <span style={{ marginLeft: "auto", color: "var(--text-muted)" }}>{set.register}</span>
                  </label>
                )) : <p style={{ padding: "8px 10px", margin: 0, color: "var(--text-muted)", fontSize: 12 }}>No matching shop drawing sets.</p>}
              </div>
              {matchingShopSets.length > visibleShopSets.length && (
                <p style={{ margin: "5px 0 0", color: "var(--text-muted)", fontSize: 11.5 }}>
                  Showing {visibleShopSets.length} of {matchingShopSets.length}. Search to narrow the list.
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </Modal>
  );
}
