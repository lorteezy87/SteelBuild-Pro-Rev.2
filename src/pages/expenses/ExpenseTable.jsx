/**
 * ExpenseTable — scrollable sticky-header table of filtered expenses
 * with per-row hover actions (edit / delete) and a running total
 * footer. Highlights paid/voided rows with appropriate colors +
 * strike-through.
 */

import React, { useState } from "react";
import { Pencil, Trash2, CheckSquare, Square } from "lucide-react";
import { formatCurrency, formatDate } from "@/components/shared/formatters";
import { thStyle, PAYMENT_STATUS_COLOR } from "./constants";
import { PaymentCircle } from "./charts";

export default function ExpenseTable({
  filtered,
  isLoading,
  selected,
  onToggleSelect,
  onToggleAll,
  onEdit,
  onDelete,
  onOpen,
}) {
  const [hoveredRow, setHoveredRow] = useState(null);

  return (
    <div className="sbd-card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ overflowX: "auto", maxHeight: 600, overflowY: "auto" }}>
        <table className="sbd-table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 40, textAlign: "center", cursor: "pointer" }} onClick={onToggleAll}>
                {selected.length === filtered.length && filtered.length > 0
                  ? <CheckSquare size={12} color="var(--accent)" />
                  : <Square size={12} color="var(--text-muted)" />}
              </th>
              <th style={{ ...thStyle, width: 90 }}>#</th>
              <th style={{ ...thStyle, width: 88 }}>Date</th>
              <th style={thStyle}>Description</th>
              <th style={{ ...thStyle, width: 110 }}>Cost Code</th>
              <th style={{ ...thStyle, width: 100 }}>Type</th>
              <th style={{ ...thStyle, width: 110 }}>Vendor</th>
              <th style={{ ...thStyle, width: 110, textAlign: "right" }}>Amount</th>
              <th style={{ ...thStyle, width: 140 }}>Status</th>
              <th style={{ ...thStyle, width: 120 }}>Work Package</th>
              <th style={{ ...thStyle, width: 76, textAlign: "center" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={11} style={{ padding: 24, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={11} style={{ padding: 32, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>No expenses found</td></tr>
            ) : (
              filtered.map((e, idx) => {
                const isSelected = selected.includes(e.id);
                const isHovered = hoveredRow === e.id;
                const isVoided = e.payment_status === "Voided";
                const isPaid = e.payment_status === "Paid";
                const rowBg = isSelected
                  ? "rgba(173,198,255,0.06)"
                  : isHovered
                    ? "var(--bg-row-hover)"
                    : idx % 2 === 0
                      ? "var(--bg-surface)"
                      : "var(--bg-surface-low)";
                const amtColor = isPaid ? "var(--status-success)" : isVoided ? "var(--text-disabled)" : "var(--status-warning)";
                const statusColor = PAYMENT_STATUS_COLOR[e.payment_status] || "var(--text-muted)";

                return (
                  <tr
                    key={e.id}
                    style={{ background: rowBg, borderBottom: "1px solid var(--divider)", transition: "background 0.1s" }}
                    onClick={onOpen ? () => onOpen(e) : undefined}
                    onMouseEnter={() => setHoveredRow(e.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                  >
                    <td style={{ padding: "9px 14px", textAlign: "center", cursor: "pointer" }} onClick={(event) => { event.stopPropagation(); onToggleSelect(e.id); }}>
                      {isSelected ? <CheckSquare size={12} color="var(--accent)" /> : <Square size={12} color="var(--text-muted)" />}
                    </td>
                    <td style={{ padding: "9px 14px", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent-light)", fontWeight: 600 }}>{e.expense_number}</td>
                    <td style={{ padding: "9px 14px", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{formatDate(e.expense_date)}</td>
                    <td style={{ padding: "9px 14px", fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: isVoided ? "line-through" : "none" }}>{e.description}</td>
                    <td style={{ padding: "9px 14px", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)" }}>{e.cost_code}</td>
                    <td style={{ padding: "9px 14px", fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-muted)" }}>{e.expense_type}</td>
                    <td style={{ padding: "9px 14px", fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-secondary)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.vendor || "—"}</td>
                    <td style={{ padding: "9px 14px", fontFamily: "var(--font-mono)", fontSize: 11, textAlign: "right", color: amtColor, fontWeight: 700, textDecoration: isVoided ? "line-through" : "none" }}>{formatCurrency(e.amount)}</td>
                    <td style={{ padding: "9px 14px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 20, background: `${statusColor}18`, border: `1px solid ${statusColor}44`, fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: statusColor, letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
                        <PaymentCircle status={e.payment_status} />
                        {e.payment_status}
                      </span>
                    </td>
                    <td style={{ padding: "9px 14px", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent-light)", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.work_package_name || "—"}</td>
                    <td style={{ padding: "9px 14px", textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "center", opacity: isHovered ? 1 : 0, transition: "opacity 0.15s" }}>
                        <button
                          onClick={(event) => { event.stopPropagation(); onEdit(e); }}
                          style={{ width: 26, height: 26, borderRadius: 6, background: "var(--bg-surface-high)", border: "1px solid var(--border-default)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text-muted)" }}
                        >
                          <Pencil size={11} />
                        </button>
                        <button
                          onClick={(event) => { event.stopPropagation(); onDelete(e); }}
                          style={{ width: 26, height: 26, borderRadius: 6, background: "var(--danger-muted)", border: "1px solid var(--danger-border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--danger)" }}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderTop: "1px solid var(--divider)", background: "var(--bg-surface-low)" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.10em" }}>
            {filtered.length} EXPENSES SHOWN
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--text-primary)" }}>
            TOTAL: {formatCurrency(filtered.reduce((s, e) => s + (Number(e.amount) || 0), 0))}
          </span>
        </div>
      )}
    </div>
  );
}
