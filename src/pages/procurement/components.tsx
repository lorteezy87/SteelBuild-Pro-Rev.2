import { useMemo, useState } from "react";
import StatusBadgeRaw from "@/components/shared/StatusBadge";
import {
  PROCUREMENT_CATEGORIES, CAT_COLORS, PIPELINE_STATUSES, ALL_STATUSES,
  iStyle, labelStyle, sectionLabelStyle,
  daysBetween, addWeeks, fmtDate, todayISO,
} from "./format";

// StatusBadge is a still-.jsx component; cast at the boundary.
const StatusBadge = StatusBadgeRaw as any;

export function PipelineView({ items, wpById, onEdit }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${PIPELINE_STATUSES.length}, 1fr)`,
      gap: 10,
    }}>
      {PIPELINE_STATUSES.map((stage) => {
        const stageItems = items.filter((i) => i.status === stage.id);
        const tons = stageItems.reduce((s, i) => s + (Number(i.weight_tons) || 0), 0);
        return (
          <div
            key={stage.id}
            style={{
              background: 'var(--bg-surface)',
              borderRadius: 'var(--radius-card)',
              borderTop: `3px solid ${stage.color}`,
              padding: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              height: 540,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
                letterSpacing: '0.12em', color: stage.color,
              }}>
                {stage.label.toUpperCase()}
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)',
              }}>
                {stageItems.length}{tons > 0 ? ` · ${tons.toFixed(1)}T` : ''}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {stageItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 12, fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)' }}>
                  NONE
                </div>
              ) : (
                stageItems.map((i) => (
                  <PipelineCard key={i.id} item={i} wpById={wpById} onClick={() => onEdit(i)} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PipelineCard({ item, wpById, onClick }) {
  const catColor = CAT_COLORS[item.procurement_category] || 'var(--text-muted)';
  const wp = item.work_package_id ? wpById.get(item.work_package_id) : null;
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg-surface-low)',
        border: '1px solid var(--border-default)',
        borderLeft: item.isOverdue
          ? '3px solid var(--status-error)'
          : item.longLeadSlipping
          ? '3px solid var(--status-warning)'
          : `3px solid ${catColor}`,
        borderRadius: 'var(--radius-card)',
        padding: '8px 10px',
        marginBottom: 6,
        cursor: 'pointer',
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-surface-mid)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-surface-low)')}
    >
      <div style={{
        fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
        color: 'var(--text-primary)', lineHeight: 1.3,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {item.description || 'Unnamed item'}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', marginTop: 3 }}>
        {item.vendor || '—'}
        {item.po_number ? ` · ${item.po_number}` : ''}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
        <Pill color={catColor} text={(item.procurement_category || '').split(' ')[0] || 'Other'} />
        {Number(item.weight_tons) > 0 && (
          <Pill color="var(--text-muted)" text={`${Number(item.weight_tons).toFixed(1)}T`} />
        )}
        {item.is_long_lead && item.lead_time_weeks && (
          <Pill
            color="var(--status-warning)"
            text={`${item.lead_time_weeks}wk lead`}
          />
        )}
        {item.longLeadSlipping && (
          <Pill color="var(--status-error)" text="SLIPPING" />
        )}
        {wp && (
          <Pill color="var(--accent)" text={wp.wp_number || 'WP'} />
        )}
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', marginTop: 5,
        fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)',
      }}>
        <span>Req: {fmtDate(item.required_date)}</span>
        <span>Ship: {fmtDate(item.effectiveShipDate)}</span>
      </div>
    </div>
  );
}

export function Pill({ color, text }) {
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
      color, background: color + '22',
      padding: '2px 6px', borderRadius: 3,
      textTransform: 'uppercase', letterSpacing: '0.04em',
      whiteSpace: 'nowrap',
    }}>
      {text}
    </span>
  );
}

/* ----------------------------------------------------------------------
 * List view - flat table mirroring schema columns
 * ---------------------------------------------------------------------- */
export function ListView({ items, wpById, onEdit, onDelete }) {
  // Item · Category · Vendor · PO · Required · Promised · Lead · Weight · Status · Actions
  const GRID = '1.4fr 130px 130px 100px 90px 90px 70px 70px 110px 80px';
  return (
    <div className="sbd-card" style={{
      padding: 0, overflow: 'hidden',
    }}>
      <div style={{
        display: 'grid', gridTemplateColumns: GRID,
        padding: '10px 16px',
        background: 'var(--bg-surface-low)',
        borderBottom: '1px solid var(--divider)',
        gap: 12,
      }}>
        {['Item', 'Category', 'Vendor', 'PO', 'Required', 'Promised', 'Lead', 'Weight', 'Status', 'Actions'].map(col => (
          <div key={col} style={{
            fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
            color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase',
          }}>
            {col}
          </div>
        ))}
      </div>

      {items.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 32,
          fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)',
          letterSpacing: '0.12em',
        }}>
          NO PROCUREMENT ITEMS
        </div>
      ) : items.map((item) => {
        const catColor = CAT_COLORS[item.procurement_category] || 'var(--text-muted)';
        const wp = item.work_package_id ? wpById.get(item.work_package_id) : null;
        return (
          <div key={item.id} style={{
            display: 'grid', gridTemplateColumns: GRID,
            padding: '10px 16px',
            borderBottom: '1px solid var(--divider)',
            borderLeft: item.isOverdue
              ? '3px solid var(--status-error)'
              : item.longLeadSlipping
              ? '3px solid var(--status-warning)'
              : item.isLate
              ? '3px solid var(--status-warning)'
              : '3px solid transparent',
            gap: 12,
            alignItems: 'center',
          }}>
            <div>
              <div style={{
                fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {item.description || 'Unnamed Item'}
              </div>
              {wp && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent)', marginTop: 2 }}>
                  → {wp.wp_number || wp.name}
                </div>
              )}
            </div>
            <div>
              <Pill color={catColor} text={(item.procurement_category || '').split(' ').slice(0, 2).join(' ')} />
            </div>
            <div style={{
              fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-secondary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {item.vendor || '—'}
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {item.po_number || '—'}
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10,
              color: item.isOverdue ? 'var(--status-error)' : 'var(--text-muted)',
              fontWeight: item.isOverdue ? 700 : 400,
            }}>
              {fmtDate(item.required_date)}
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10,
              color: item.isLate ? 'var(--status-warning)' : 'var(--text-secondary)',
            }}>
              {fmtDate(item.effectiveShipDate)}
              {!item.expected_ship_date && item.computedShipDate && (
                <span style={{ fontSize: 8, color: 'var(--text-muted)', marginLeft: 4 }}>(calc)</span>
              )}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>
              {item.is_long_lead && item.lead_time_weeks ? `${item.lead_time_weeks}wk` : '—'}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>
              {Number(item.weight_tons || 0) > 0 ? `${Number(item.weight_tons).toFixed(1)}T` : '—'}
            </div>
            <div>
              <StatusBadge status={item.status} />
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => onEdit(item)}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-default)',
                  borderRadius: 4, padding: '3px 8px',
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                EDIT
              </button>
              <button
                onClick={() => onDelete(item)}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--danger-border)',
                  borderRadius: 4, padding: '3px 7px',
                  color: 'var(--status-error)',
                  fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------------
 * Board view - grouped by procurement_category
 * ---------------------------------------------------------------------- */
export function BoardView({ items, wpById, onEdit }) {
  // Bucket by category. Render only categories that have rows so the
  // board doesn't show 10 empty columns on a small project.
  const groups = useMemo(() => {
    const map = new Map();
    for (const i of items) {
      const cat = i.procurement_category || 'Other';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat).push(i);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  if (groups.length === 0) {
    return (
      <div style={{
        textAlign: 'center', padding: 40,
        fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)',
        letterSpacing: '0.12em',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-card)',
      }}>
        NO PROCUREMENT ITEMS
      </div>
    );
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
      gap: 12,
    }}>
      {groups.map(([cat, rows]) => {
        const color = CAT_COLORS[cat] || 'var(--text-muted)';
        const tons = rows.reduce((s, r) => s + (Number(r.weight_tons) || 0), 0);
        return (
          <div
            key={cat}
            style={{
              background: 'var(--bg-surface)',
              borderRadius: 'var(--radius-card)',
              borderTop: `3px solid ${color}`,
              padding: 10,
              minHeight: 260,
            }}
          >
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 8, gap: 6,
            }}>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                letterSpacing: '0.10em', color, textTransform: 'uppercase',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {cat}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {rows.length}{tons > 0 ? ` · ${tons.toFixed(1)}T` : ''}
              </span>
            </div>
            {rows.map((i) => (
              <PipelineCard key={i.id} item={i} wpById={wpById} onClick={() => onEdit(i)} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------------
 * Form drawer - every column the schema offers
 * ---------------------------------------------------------------------- */
export function ProcurementFormModal({ projectId, item, vendors, workPackages, onClose, onSave, isSaving = false }) {
  void projectId; // unused - Procurement page injects project_id at create
  const initial = item ? {
    ...item,
    metadata: item.metadata || {},
  } : {
    description: '',
    procurement_category: 'Other',
    vendor: '',
    status: 'Identified',
    po_number: '',
    order_placed_date: '',
    required_date: '',
    scheduled_date: '',
    expected_ship_date: '',
    weight_tons: '',
    pieces: '',
    is_long_lead: false,
    lead_time_weeks: '',
    work_package_id: '',
    notes: '',
    metadata: { cost_estimate: '' },
  };
  const [form, setForm] = useState(initial);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setMeta = (k, v) => setForm(f => ({
    ...f,
    metadata: { ...(f.metadata || {}), [k]: v },
  }));

  // Lead-time math: when the user has order_placed AND lead_time_weeks
  // but no expected_ship_date, suggest the computed ship date inline.
  const computedShip = (form.order_placed_date && form.lead_time_weeks)
    ? addWeeks(form.order_placed_date, Number(form.lead_time_weeks))
    : null;

  // Sort WPs by wp_number ascending so the dropdown is browsable. Show
  // both number and short name. Once the project has 50+ WPs we'd
  // swap this for a search input - not yet a problem in practice but
  // flagged in the rebuild brief.
  const sortedWPs = useMemo(
    () => [...workPackages].sort((a, b) =>
      String(a.wp_number || '').localeCompare(String(b.wp_number || ''))
    ),
    [workPackages],
  );

  const handleSave = () => {
    if (isSaving) return;
    if (!form.description?.trim()) return;
    // Coerce numerics - empty strings should hit the DB as null.
    const payload = {
      description: form.description?.trim(),
      procurement_category: form.procurement_category || null,
      vendor: form.vendor?.trim() || null,
      status: form.status || 'Identified',
      po_number: form.po_number?.trim() || null,
      order_placed_date: form.order_placed_date || null,
      required_date: form.required_date || null,
      scheduled_date: form.scheduled_date || null,
      expected_ship_date: form.expected_ship_date
        || (form.order_placed_date && form.lead_time_weeks ? computedShip : null),
      weight_tons: form.weight_tons === '' || form.weight_tons == null ? null : Number(form.weight_tons),
      pieces: form.pieces === '' || form.pieces == null ? null : Number(form.pieces),
      is_long_lead: !!form.is_long_lead,
      lead_time_weeks: form.lead_time_weeks === '' || form.lead_time_weeks == null
        ? null
        : Number(form.lead_time_weeks),
      work_package_id: form.work_package_id || null,
      notes: form.notes?.trim() || null,
      metadata: {
        ...(form.metadata || {}),
        cost_estimate: form.metadata?.cost_estimate || null,
      },
    };
    onSave(payload);
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--bg-surface-secondary)',
        border: '1px solid var(--border-default)',
        borderRadius: 16, padding: 24,
        maxWidth: 720, width: '95%',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <h2 style={{
          fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
          color: 'var(--text-primary)', margin: '0 0 20px 0',
          textTransform: 'uppercase', letterSpacing: '0.10em',
        }}>
          {item ? 'Edit Procurement Item' : 'Add Procurement Item'}
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {/* IDENTIFICATION */}
          <div style={sectionLabelStyle}>Identification</div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={labelStyle}>Item Description *</label>
            <input
              style={iStyle}
              value={form.description || ''}
              onChange={e => set('description', e.target.value)}
              required
              placeholder="e.g. W-Shape Mill Order, Joist Package A"
            />
          </div>
          <div>
            <label style={labelStyle}>Category</label>
            <select
              style={iStyle}
              value={form.procurement_category || 'Other'}
              onChange={e => set('procurement_category', e.target.value)}
            >
              {PROCUREMENT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Vendor / Supplier</label>
            <input
              style={iStyle}
              value={form.vendor || ''}
              onChange={e => set('vendor', e.target.value)}
              placeholder="Vendor name"
              list="vendor-list"
            />
            <datalist id="vendor-list">
              {vendors.map(v => (
                <option key={v.id} value={v.company_name} />
              ))}
            </datalist>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={labelStyle}>Estimated Value ($)</label>
            <input
              style={iStyle}
              value={form?.metadata?.cost_estimate || ''}
              onChange={e => setMeta('cost_estimate', e.target.value)}
              placeholder="e.g. 125000 — stored in metadata.cost_estimate"
            />
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', marginTop: 3, letterSpacing: '0.06em' }}>
              Stored on metadata.cost_estimate (no dedicated column on deliveries).
            </div>
          </div>

          {/* PO & STATUS */}
          <div style={sectionLabelStyle}>PO &amp; Status</div>
          <div>
            <label style={labelStyle}>PO Number</label>
            <input
              style={iStyle}
              value={form.po_number || ''}
              onChange={e => set('po_number', e.target.value)}
              placeholder="e.g. PO-2024-0142"
            />
          </div>
          <div>
            <label style={labelStyle}>Order Placed Date</label>
            <input
              type="date"
              style={iStyle}
              value={form.order_placed_date || ''}
              onChange={e => set('order_placed_date', e.target.value)}
            />
          </div>
          <div>
            <label style={labelStyle}>Status</label>
            <select
              style={iStyle}
              value={form.status || 'Identified'}
              onChange={e => set('status', e.target.value)}
            >
              {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Linked Work Package</label>
            <select
              style={iStyle}
              value={form.work_package_id || ''}
              onChange={e => set('work_package_id', e.target.value)}
            >
              <option value="">— None —</option>
              {sortedWPs.map(wp => (
                <option key={wp.id} value={wp.id}>
                  {wp.wp_number || wp.id.slice(0, 6)} · {wp.name || 'WP'}
                </option>
              ))}
            </select>
          </div>

          {/* SCHEDULE */}
          <div style={sectionLabelStyle}>Schedule</div>
          <div>
            <label style={labelStyle}>Required On Site Date</label>
            <input
              type="date"
              style={iStyle}
              value={form.required_date || ''}
              onChange={e => set('required_date', e.target.value)}
            />
          </div>
          <div>
            <label style={labelStyle}>Promised Date</label>
            <input
              type="date"
              style={iStyle}
              value={form.scheduled_date || ''}
              onChange={e => set('scheduled_date', e.target.value)}
            />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={labelStyle}>Expected Ship Date</label>
            <input
              type="date"
              style={iStyle}
              value={form.expected_ship_date || ''}
              onChange={e => set('expected_ship_date', e.target.value)}
              placeholder={computedShip ? `Auto: ${computedShip}` : 'YYYY-MM-DD'}
            />
            {!form.expected_ship_date && computedShip && (
              <button
                type="button"
                onClick={() => set('expected_ship_date', computedShip)}
                style={{
                  marginTop: 4,
                  background: 'transparent',
                  border: '1px solid var(--accent)',
                  borderRadius: 4, padding: '3px 8px',
                  color: 'var(--accent)',
                  fontFamily: 'var(--font-mono)', fontSize: 8, fontWeight: 700,
                  cursor: 'pointer', letterSpacing: '0.06em',
                }}
              >
                USE COMPUTED · {computedShip} ({form.lead_time_weeks}wk from order)
              </button>
            )}
          </div>

          {/* MATERIAL */}
          <div style={sectionLabelStyle}>Material</div>
          <div>
            <label style={labelStyle}>Weight (tons)</label>
            <input
              type="number"
              step="0.1"
              style={iStyle}
              value={form.weight_tons ?? ''}
              onChange={e => set('weight_tons', e.target.value)}
              placeholder="0.0"
            />
          </div>
          <div>
            <label style={labelStyle}>Pieces</label>
            <input
              type="number"
              step="1"
              style={iStyle}
              value={form.pieces ?? ''}
              onChange={e => set('pieces', e.target.value)}
              placeholder="0"
            />
          </div>

          {/* LONG LEAD */}
          <div style={sectionLabelStyle}>Long-Lead</div>
          <div>
            <label style={{
              ...labelStyle, display: 'flex', alignItems: 'center', gap: 8,
              cursor: 'pointer', marginBottom: 0, marginTop: 6,
            }}>
              <input
                type="checkbox"
                checked={!!form.is_long_lead}
                onChange={e => set('is_long_lead', e.target.checked)}
                style={{ width: 14, height: 14, cursor: 'pointer' }}
              />
              <span>Mark as long-lead item</span>
            </label>
          </div>
          <div>
            <label style={labelStyle}>Lead Time (weeks)</label>
            <input
              type="number"
              step="1"
              min="0"
              style={iStyle}
              value={form.lead_time_weeks ?? ''}
              onChange={e => set('lead_time_weeks', e.target.value)}
              placeholder="e.g. 16"
              disabled={!form.is_long_lead}
            />
          </div>

          {/* NOTES */}
          <div style={sectionLabelStyle}>Notes</div>
          <div style={{ gridColumn: 'span 2' }}>
            <textarea
              style={{ ...iStyle, minHeight: 60, resize: 'vertical' }}
              value={form.notes || ''}
              onChange={e => set('notes', e.target.value)}
              placeholder="PO terms, special requirements, vendor contact..."
            />
          </div>

          <div style={{
            gridColumn: 'span 2', display: 'flex', gap: 8,
            justifyContent: 'flex-end', paddingTop: 12,
            borderTop: '1px solid var(--divider)', marginTop: 4,
          }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 8, padding: '8px 16px',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                cursor: isSaving ? 'not-allowed' : 'pointer', textTransform: 'uppercase',
                opacity: isSaving ? 0.6 : 1,
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !form.description?.trim()}
              style={{
                background: 'var(--accent)', color: '#fff',
                border: 'none', borderRadius: 8, padding: '8px 20px',
                fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                cursor: isSaving || !form.description?.trim() ? 'not-allowed' : 'pointer',
                textTransform: 'uppercase',
                opacity: isSaving || !form.description?.trim() ? 0.5 : 1,
              }}
            >
              {isSaving ? (item ? 'Saving...' : 'Adding...') : (item ? 'Save' : 'Add Item')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Re-export for any future inline-test convenience.
export { addWeeks, daysBetween };
// `todayISO` is used internally; export keeps it tree-shakable for tests
// without polluting the module-level import surface.
void todayISO;
