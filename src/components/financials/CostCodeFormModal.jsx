import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COST_CODES, COST_CODES_GROUPED } from "../shared/costCodes";

const empty = {
  cost_code_number: "", description: "",
  budget_amount: 0, actual_cost: 0, committed_cost: 0,
  forecast_to_complete: 0, project_id: "", project_name: "", notes: "",
  phase: "Materials" // kept for backwards compat with CostCode entity
};

export default function CostCodeFormModal({ open, onClose, onSave, costCode, projects = [], existingCodes = [] }) {
  const [form, setForm] = useState(empty);
  const [selectedCode, setSelectedCode] = useState("");
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (costCode) {
      setForm({ ...empty, ...costCode });
      setSelectedCode(costCode.cost_code_number);
    } else {
      setForm(empty);
      setSelectedCode("");
    }
    setErrors({});
  }, [costCode, open]);

  const validate = () => {
    const e = {};
    if (!selectedCode) e.description = "Required";
    if (!form.project_id) e.project_id = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    if (saving) return;

    // Check for duplicates only on create
    if (!costCode && selectedCode) {
      const existing = existingCodes.filter((c) => c.cost_code_number === selectedCode && c.project_id === form.project_id);
      if (existing.length > 0) {
        setErrors({ ...errors, description: `Cost code ${selectedCode} already exists for this project` });
        return;
      }
    }

    const selectedCostCodeMeta = COST_CODES.find((c) => c.code === selectedCode);
    // Emit ONLY real, user-editable cost_codes columns — never spread ...form.
    const data = {
      project_id: form.project_id,
      project_name: form.project_name || "",
      cost_code_number: selectedCode,
      description: selectedCostCodeMeta?.name || form.description || "",
      phase: selectedCostCodeMeta?.category || form.phase || "Materials",
      budget_amount: Number(form.budget_amount) || 0,
      actual_cost: Number(form.actual_cost) || 0,
      committed_cost: Number(form.committed_cost) || 0,
      forecast_to_complete: Number(form.forecast_to_complete) || 0,
      notes: form.notes || "",
    };
    const proj = projects.find((p) => p.id === form.project_id);
    if (proj) data.project_name = proj.name;

    setSaving(true);
    try {
      await onSave(data);
      setForm(empty);
      setSelectedCode("");
    } catch (err) {
      // Mutation onError already toasts; keep modal open for retry.
      console.error("Save failed:", err);
    } finally {
      setSaving(false);
    }
  };

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));



  const budget = Number(form.budget_amount) || 0;
  const actual = Number(form.actual_cost) || 0;
  const variance = actual - budget;
  const pctUsed = budget > 0 ? actual / budget * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="sbd-card-strong max-w-2xl max-h-[90vh] overflow-y-auto"
        style={{
          // Use an OPAQUE surface token. In .steelbuild-dark, --bg-surface
          // resolves to a translucent value (rgba white ~0.035), which made
          // this modal render see-through over the dialog scrim (appeared
          // blank/unclickable). --bg-surface-secondary stays opaque in
          // both themes — matching the default DialogContent face.
          background: 'var(--bg-surface-secondary)',
          color: 'var(--text-primary)',
          borderRadius: 14,
          border: '1px solid var(--accent-border)',
          boxShadow: 'var(--shadow-card)'
        }}>

        <DialogHeader>
          <DialogTitle style={{
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)',
            fontSize: 20,
            fontWeight: 700
          }}>
            {costCode ? "Edit Cost Code" : "New Cost Code"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
          <div className="sm:col-span-2">
            <label style={{
              display: 'block',
              fontFamily: 'var(--font-mono)',
              fontSize: 8,
              letterSpacing: '0.14em',
              color: 'var(--text-muted)',
              marginBottom: 6,
              textTransform: 'uppercase'
            }}>
              Project *
            </label>
            <Select value={form.project_id} onValueChange={(v) => set("project_id", v)}>
              <SelectTrigger style={{
                background: 'var(--bg-surface-low)',
                border: '1px solid var(--accent-border)',
                borderRadius: 8,
                color: 'var(--text-primary)'
              }} className="bg-transparent text-slate-50 px-3 py-2 text-sm rounded-md flex h-9 w-full items-center justify-between whitespace-nowrap border border-input shadow-sm ring-offset-background data-[placeholder]:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1">
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent style={{ background: 'var(--bg-surface-secondary)', zIndex: 10001 }}>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
            {errors.project_id && <p className="text-xs text-rose-500 mt-1">{errors.project_id}</p>}
          </div>
          
          {/* Description + Code # row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 100px',
            gap: 12,
            gridColumn: 'span 2'
          }}>
            {/* Description dropdown */}
            <div>
              <label style={{
                display: 'block',
                fontFamily: 'var(--font-mono)',
                fontSize: 8,
                letterSpacing: '0.14em',
                color: 'var(--text-muted)',
                marginBottom: 6,
                textTransform: 'uppercase'
              }}>
                Description *
              </label>

              {/* Grouped cost code selector */}
              <select
                value={selectedCode}
                onChange={(e) => setSelectedCode(e.target.value)}
                disabled={!!costCode}
                style={{
                  width: '100%',
                  height: 38,
                  background: 'var(--bg-surface-secondary)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 8,
                  padding: '0 28px 0 12px',
                  color: selectedCode ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 12,
                  cursor: costCode ? 'not-allowed' : 'pointer',
                  opacity: costCode ? 0.6 : 1,
                  outline: 'none',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  MozAppearance: 'none',
                  backgroundImage: 'linear-gradient(45deg, transparent 50%, var(--accent) 50%), linear-gradient(135deg, var(--accent) 50%, transparent 50%)',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'calc(100% - 14px) 50%, calc(100% - 9px) 50%',
                  backgroundSize: '5px 5px, 5px 5px',
                  boxSizing: 'border-box'
                }}>

                <option value="">Select cost code...</option>
                {COST_CODES_GROUPED.map((group) =>
                <optgroup key={group.category} label={group.category}>
                    {group.codes.map((cc) => {
                    const alreadyAdded = existingCodes.some((e) => e.cost_code_number === cc.code && e.project_id === form.project_id && (!costCode || costCode.id !== e.id));
                    return (
                      <option
                        key={cc.code}
                        value={cc.code}
                        disabled={alreadyAdded}
                        style={{ background: 'var(--bg-surface-secondary)', color: alreadyAdded ? 'var(--text-muted)' : 'var(--text-primary)' }}>

                          {cc.code} — {cc.name}{alreadyAdded ? ' (already added)' : ''}
                        </option>);

                  })}
                  </optgroup>
                )}
              </select>
              {errors.description && <p className="text-xs text-rose-500 mt-1">{errors.description}</p>}
            </div>

            {/* Cost Code # — auto filled */}
            <div>
              <label style={{
                display: 'block',
                fontFamily: 'var(--font-mono)',
                fontSize: 8,
                letterSpacing: '0.14em',
                color: 'var(--text-muted)',
                marginBottom: 6,
                textTransform: 'uppercase'
              }}>
                Code #
              </label>

              <div style={{
                height: 38,
                background: selectedCode ? 'var(--accent-muted)' : 'var(--bg-surface-low)',
                border: '1px solid',
                borderColor: 'var(--accent-border)',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s'
              }}>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 18,
                  fontWeight: 700,
                  color: selectedCode ? 'var(--accent)' : 'var(--border-strong)',
                  letterSpacing: '0.05em'
                }}>
                  {selectedCode || '—'}
                </span>
              </div>
            </div>
          </div>
          <div>
            <label style={{
              display: 'block',
              fontFamily: 'var(--font-mono)',
              fontSize: 8,
              letterSpacing: '0.14em',
              color: 'var(--text-muted)',
              marginBottom: 6,
              textTransform: 'uppercase'
            }}>
              Budget Amount
            </label>
            <input
              type="number"
              value={form.budget_amount}
              onChange={(e) => set("budget_amount", e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg-surface-low)',
                border: '1px solid var(--accent-border)',
                borderRadius: 8,
                padding: '8px 12px',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                boxSizing: 'border-box'
              }} />

          </div>
          <div>
            <label style={{
              display: 'block',
              fontFamily: 'var(--font-mono)',
              fontSize: 8,
              letterSpacing: '0.14em',
              color: 'var(--text-muted)',
              marginBottom: 6,
              textTransform: 'uppercase'
            }}>
              Actual Cost to Date
            </label>
            <input
              type="number"
              value={form.actual_cost}
              onChange={(e) => set("actual_cost", e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg-surface-low)',
                border: '1px solid var(--accent-border)',
                borderRadius: 8,
                padding: '8px 12px',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                boxSizing: 'border-box'
              }} />

          </div>
          <div>
            <label style={{
              display: 'block',
              fontFamily: 'var(--font-mono)',
              fontSize: 8,
              letterSpacing: '0.14em',
              color: 'var(--text-muted)',
              marginBottom: 6,
              textTransform: 'uppercase'
            }}>
              Committed Cost
            </label>
            <input
              type="number"
              value={form.committed_cost}
              onChange={(e) => set("committed_cost", e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg-surface-low)',
                border: '1px solid var(--accent-border)',
                borderRadius: 8,
                padding: '8px 12px',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                boxSizing: 'border-box'
              }} />

          </div>
          <div>
            <label style={{
              display: 'block',
              fontFamily: 'var(--font-mono)',
              fontSize: 8,
              letterSpacing: '0.14em',
              color: 'var(--text-muted)',
              marginBottom: 6,
              textTransform: 'uppercase'
            }}>
              Forecast to Complete
            </label>
            <input
              type="number"
              value={form.forecast_to_complete}
              onChange={(e) => set("forecast_to_complete", e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg-surface-low)',
                border: '1px solid var(--accent-border)',
                borderRadius: 8,
                padding: '8px 12px',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                boxSizing: 'border-box'
              }} />

          </div>
          <div>
            <label style={{
              display: 'block',
              fontFamily: 'var(--font-mono)',
              fontSize: 8,
              letterSpacing: '0.14em',
              color: 'var(--text-muted)',
              marginBottom: 6,
              textTransform: 'uppercase'
            }}>
              Variance (calculated)
            </label>
            <div style={{
              width: '100%',
              background: 'var(--bg-surface-low)',
              border: '1px solid var(--border-default)',
              borderRadius: 8,
              padding: '8px 12px',
              color: variance > 0 ? 'var(--status-error)' : 'var(--status-success)',
              fontFamily: 'var(--font-body)',
              fontSize: 12
            }}>
              {variance >= 0 ? "+" : ""}{variance.toFixed(2)}
            </div>
          </div>
          <div>
            <label style={{
              display: 'block',
              fontFamily: 'var(--font-mono)',
              fontSize: 8,
              letterSpacing: '0.14em',
              color: 'var(--text-muted)',
              marginBottom: 6,
              textTransform: 'uppercase'
            }}>
              % Used (calculated)
            </label>
            <div style={{
              width: '100%',
              background: 'var(--bg-surface-low)',
              border: '1px solid var(--border-default)',
              borderRadius: 8,
              padding: '8px 12px',
              color: pctUsed > 100 ? 'var(--status-error)' : 'var(--text-primary)',
              fontFamily: 'var(--font-body)',
              fontSize: 12
            }}>
              {pctUsed.toFixed(1)}%
            </div>
          </div>
          <div className="sm:col-span-2">
            <label style={{
              display: 'block',
              fontFamily: 'var(--font-mono)',
              fontSize: 8,
              letterSpacing: '0.14em',
              color: 'var(--text-muted)',
              marginBottom: 6,
              textTransform: 'uppercase'
            }}>
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              style={{
                width: '100%',
                background: 'var(--bg-surface-low)',
                border: '1px solid var(--accent-border)',
                borderRadius: 8,
                padding: '8px 12px',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                boxSizing: 'border-box'
              }} />

          </div>
          </div>
          <DialogFooter style={{
          display: 'flex',
          gap: 12,
          justifyContent: 'flex-end',
          marginTop: 24
        }}>
          <button
            onClick={() => {
              setForm(empty);
              setSelectedCode("");
              onClose();
            }}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-default)',
              borderRadius: 8,
              padding: '10px 24px',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              cursor: 'pointer'
            }}>

            CANCEL
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 8,
              padding: '10px 24px',
              color: 'white',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.10em',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1,
              boxShadow: '0 4px 14px var(--accent-muted)'
            }}>

            {saving ? "SAVING…" : costCode ? "UPDATE" : "CREATE"}
          </button>
          </DialogFooter>
      </DialogContent>
    </Dialog>);

}
