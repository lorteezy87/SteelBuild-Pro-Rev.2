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

    // Check for duplicates only on create
    if (!costCode && selectedCode) {
      const existing = existingCodes.filter((c) => c.cost_code_number === selectedCode && c.project_id === form.project_id);
      if (existing.length > 0) {
        setErrors({ ...errors, description: `Cost code ${selectedCode} already exists for this project` });
        return;
      }
    }

    const data = {
      ...form,
      cost_code_number: selectedCode,
      description: COST_CODES.find((c) => c.code === selectedCode)?.name || "",
      phase: COST_CODES.find((c) => c.code === selectedCode)?.category || form.phase,
      budget_amount: Number(form.budget_amount) || 0,
      actual_cost: Number(form.actual_cost) || 0,
      committed_cost: Number(form.committed_cost) || 0,
      forecast_to_complete: Number(form.forecast_to_complete) || 0,
      phase: form.phase || "Materials"
    };
    const proj = projects.find((p) => p.id === form.project_id);
    if (proj) data.project_name = proj.name;

    try {
      await onSave(data);
      setForm(empty);
      setSelectedCode("");
    } catch (err) {
      console.error('Save failed:', err);
      alert(`Failed to save: ${err.message}`);
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
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        style={{
          background: 'var(--bg-surface)',
          color: '#FFFFFF',
          borderRadius: 14,
          border: '1px solid var(--accent-border)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.8)'
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
                background: 'var(--bg-sidebar)',
                border: '1px solid var(--accent-border)',
                borderRadius: 8,
                color: '#FFFFFF'
              }} className="bg-transparent text-slate-50 px-3 py-2 text-sm rounded-md flex h-9 w-full items-center justify-between whitespace-nowrap border border-input shadow-sm ring-offset-background data-[placeholder]:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1">
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent style={{ background: 'var(--bg-surface-low)' }}>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
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
                  background: 'var(--bg-sidebar)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 8,
                  padding: '0 28px 0 12px',
                  color: selectedCode ? '#FFFFFF' : 'rgba(255,255,255,0.30)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 12,
                  cursor: costCode ? 'not-allowed' : 'pointer',
                  opacity: costCode ? 0.6 : 1,
                  outline: 'none',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  MozAppearance: 'none',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%233B82F6'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 10px center',
                  backgroundSize: '10px 6px',
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
                        style={{ background: 'var(--bg-sidebar)', color: alreadyAdded ? 'rgba(160,175,210,0.25)' : '#F2F4F8' }}>

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
                background: selectedCode ? 'var(--accent-muted)' : 'var(--bg-sidebar)',
                border: '1px solid',
                borderColor: selectedCode ? 'var(--accent-border)' : 'var(--accent-border)',
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
                  color: selectedCode ? 'var(--accent)' : 'rgba(255,255,255,0.20)',
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
                background: 'var(--bg-sidebar)',
                border: '1px solid var(--accent-border)',
                borderRadius: 8,
                padding: '8px 12px',
                color: '#FFFFFF',
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
                background: 'var(--bg-sidebar)',
                border: '1px solid var(--accent-border)',
                borderRadius: 8,
                padding: '8px 12px',
                color: '#FFFFFF',
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
                background: 'var(--bg-sidebar)',
                border: '1px solid var(--accent-border)',
                borderRadius: 8,
                padding: '8px 12px',
                color: '#FFFFFF',
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
                background: 'var(--bg-sidebar)',
                border: '1px solid var(--accent-border)',
                borderRadius: 8,
                padding: '8px 12px',
                color: '#FFFFFF',
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
              background: 'var(--bg-sidebar)',
              border: '1px solid var(--border-default)',
              borderRadius: 8,
              padding: '8px 12px',
              color: variance > 0 ? '#FF1744' : '#00E676',
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
              background: 'var(--bg-sidebar)',
              border: '1px solid var(--border-default)',
              borderRadius: 8,
              padding: '8px 12px',
              color: pctUsed > 100 ? '#FF1744' : '#FFFFFF',
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
                background: 'var(--bg-sidebar)',
                border: '1px solid var(--accent-border)',
                borderRadius: 8,
                padding: '8px 12px',
                color: '#FFFFFF',
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
              cursor: 'pointer',
              boxShadow: '0 4px 14px var(--accent-muted)'
            }}>

            {costCode ? "UPDATE" : "CREATE"}
          </button>
          </DialogFooter>
      </DialogContent>
    </Dialog>);

}