/**
 * SavedViewsControl — pick, save and delete named register filter sets.
 * Saved on this device for the signed-in user (see savedRegisterViews.ts).
 * No <form>, no dialog: an inline name field with explicit Save / Cancel.
 */
import { useContext, useState } from "react";
import { toast } from "sonner";
import { AuthContext } from "@/lib/AuthContext";
import { loadViews, removeView, storeViews, upsertView, MAX_NAME, MAX_VIEWS } from "@/lib/savedRegisterViews";
import type { FilterValue, RegisterKey, SavedRegisterView } from "@/lib/savedRegisterViews";

export interface SavedViewsControlProps {
  register: RegisterKey;
  currentFilters: Record<string, FilterValue>;
  onApply: (view: SavedRegisterView) => void;
}

export default function SavedViewsControl({ register, currentFilters, onApply }: SavedViewsControlProps) {
  const auth = useContext(AuthContext) as { user?: { id?: string | null } | null } | null;
  const userId = auth?.user?.id ?? null;
  const [views, setViews] = useState<SavedRegisterView[]>(() => loadViews(register, userId));
  const [loadedFor, setLoadedFor] = useState(userId);
  const [selected, setSelected] = useState("");
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  // Account switch: re-read for the new user during render (no effect flash).
  if (loadedFor !== userId) {
    setLoadedFor(userId);
    setViews(loadViews(register, userId));
    setSelected("");
  }

  const persist = (next: SavedRegisterView[]) => {
    setViews(next);
    if (!storeViews(register, userId, next)) {
      toast.error("Couldn't save views on this device. Storage may be full or blocked.");
    }
  };

  const apply = (id: string) => {
    setSelected(id);
    const view = views.find((v) => v.id === id);
    if (view) onApply(view);
  };

  const save = () => {
    const result = upsertView(views, name, currentFilters);
    if ("reason" in result) {
      toast.error(result.reason === "limit" ? `Limit is ${MAX_VIEWS} saved views. Delete one first.` : "Give the view a name.");
      return;
    }
    persist(result.views);
    setSelected(result.view.id);
    setNaming(false);
    setName("");
    toast.success(`Saved view "${result.view.name}"`);
  };

  const remove = () => {
    const view = views.find((v) => v.id === selected);
    if (!view) return;
    persist(removeView(views, view.id));
    setSelected("");
    toast.success(`Deleted view "${view.name}"`);
  };

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }} data-testid="saved-views">
      <select
        className="sbd-select"
        aria-label="Saved views"
        title="Saved views (this device)"
        value={selected}
        onChange={(e) => apply(e.target.value)}
      >
        <option value="">{views.length ? "Saved views…" : "No saved views"}</option>
        {views.map((v) => (
          <option key={v.id} value={v.id}>{v.name}</option>
        ))}
      </select>
      {naming ? (
        <>
          <input
            className="cmd-search__input"
            style={{ width: 160 }}
            aria-label="View name"
            placeholder="View name"
            maxLength={MAX_NAME}
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") { setNaming(false); setName(""); }
            }}
          />
          <button type="button" className="cmd-btn cmd-btn--primary" onClick={save}>Save</button>
          <button type="button" className="cmd-btn cmd-btn--ghost" onClick={() => { setNaming(false); setName(""); }}>Cancel</button>
        </>
      ) : (
        <button type="button" className="cmd-btn cmd-btn--ghost" onClick={() => { setName(views.find((v) => v.id === selected)?.name ?? ""); setNaming(true); }}>
          Save view
        </button>
      )}
      {selected && !naming && (
        <button type="button" className="cmd-btn cmd-btn--ghost" onClick={remove} aria-label="Delete selected view">
          Delete view
        </button>
      )}
    </div>
  );
}
