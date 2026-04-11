import React, { useState } from "react";
import { Pencil, Trash2, Star, Phone, Mail, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/components/shared/formatters";

const STATUS_COLORS = {
  Active: "var(--status-success)",
  Inactive: "var(--text-muted)",
  Probation: "var(--status-warning)",
  Suspended: "var(--status-error)",
};

function StatusPill({ status }) {
  const color = STATUS_COLORS[status] || "var(--text-muted)";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: `${color}18`, color,
      fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
      padding: "3px 10px", borderRadius: 20, letterSpacing: "0.06em",
      textTransform: "uppercase", whiteSpace: "nowrap",
    }}>
      {status || "Active"}
    </span>
  );
}

function RiskBadge({ vendor }) {
  const risks = [];
  const now = new Date();
  if (vendor.certifications_expiry && new Date(vendor.certifications_expiry) < now) {
    risks.push("CERT EXPIRED");
  }
  if (vendor.insurance_expiry && new Date(vendor.insurance_expiry) < now) {
    risks.push("INS. EXPIRED");
  }
  if (vendor.status === "Probation") risks.push("PROBATION");
  if (vendor.status === "Suspended") risks.push("SUSPENDED");
  if (risks.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {risks.map(r => (
        <span key={r} style={{
          display: "inline-flex", alignItems: "center", gap: 3,
          background: "rgba(248,81,73,0.12)", color: "var(--status-error)",
          fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
          padding: "2px 6px", borderRadius: 10, letterSpacing: "0.04em",
        }}>
          <AlertTriangle size={8} />{r}
        </span>
      ))}
    </div>
  );
}

function PerformanceBar({ label, value, max = 100 }) {
  if (value == null || value === 0) return null;
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const color = pct >= 80 ? "var(--status-success)" : pct >= 60 ? "var(--status-warning)" : "var(--status-error)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 120 }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", width: 50, letterSpacing: "0.04em", textTransform: "uppercase" }}>{label}</span>
      <div style={{ flex: 1, height: 4, background: "var(--bg-void)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.3s" }} />
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color, minWidth: 30, textAlign: "right" }}>{Math.round(value)}%</span>
    </div>
  );
}

export default function VendorList({ vendors, onEdit, onDelete, vendorStats }) {
  const [expanded, setExpanded] = useState(null);

  if (vendors.length === 0) {
    return (
      <div style={{
        background: "var(--bg-surface)", borderRadius: "var(--radius-card)",
        padding: "60px 24px", textAlign: "center", border: "1px solid var(--divider)",
      }}>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 16, fontWeight: 700, color: "var(--text-disabled)", marginBottom: 8 }}>
          No Vendors Found
        </div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)" }}>
          Add vendors to track performance, costs, and accountability.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {vendors.map((vendor) => {
        const stats = vendorStats?.[vendor.company_name] || {};
        const isExpanded = expanded === vendor.id;

        return (
          <div key={vendor.id} style={{
            background: "var(--bg-surface)", borderRadius: "var(--radius-card)",
            overflow: "hidden",
            borderLeft: vendor.is_preferred ? "3px solid var(--status-success)"
              : vendor.status === "Probation" ? "3px solid var(--status-warning)"
              : vendor.status === "Suspended" ? "3px solid var(--status-error)"
              : "3px solid transparent",
            transition: "background 0.1s",
          }}>
            {/* ── Card Header ── */}
            <div style={{
              padding: "12px 16px", display: "flex", gap: 16, alignItems: "center",
              cursor: "pointer",
            }} onClick={() => setExpanded(isExpanded ? null : vendor.id)}>
              {/* Name + Type */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  {vendor.is_preferred && <Star size={11} fill="var(--status-success)" style={{ color: "var(--status-success)", flexShrink: 0 }} />}
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 700, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {vendor.company_name}
                  </span>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
                  {vendor.vendor_type}
                </div>
              </div>

              {/* Contact */}
              <div style={{ minWidth: 140, maxWidth: 200 }}>
                {vendor.contact_person && (
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-secondary)", marginBottom: 1 }}>
                    {vendor.contact_person}
                  </div>
                )}
                {vendor.phone && (
                  <div style={{ display: "flex", alignItems: "center", gap: 3, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                    <Phone size={8} />{vendor.phone}
                  </div>
                )}
              </div>

              {/* Performance stats (computed from project data) */}
              <div style={{ minWidth: 120 }}>
                {stats.deliveryCount > 0 ? (
                  <div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginBottom: 2 }}>
                      {stats.deliveryCount} deliver{stats.deliveryCount !== 1 ? "ies" : "y"}
                    </div>
                    {stats.onTimeRate != null && (
                      <PerformanceBar label="On-time" value={stats.onTimeRate} />
                    )}
                  </div>
                ) : (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-disabled)" }}>No deliveries</span>
                )}
              </div>

              {/* CO attribution */}
              <div style={{ minWidth: 80, textAlign: "right" }}>
                {stats.coCount > 0 ? (
                  <div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--status-warning)" }}>
                      {stats.coCount} CO{stats.coCount !== 1 ? "s" : ""}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                      {formatCurrency(stats.coValue || 0)}
                    </div>
                  </div>
                ) : (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-disabled)" }}>0 COs</span>
                )}
              </div>

              {/* Total spend */}
              <div style={{ minWidth: 90, textAlign: "right" }}>
                {(stats.totalSpend || 0) > 0 ? (
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--accent-light)" }}>
                    {formatCurrency(stats.totalSpend)}
                  </div>
                ) : (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-disabled)" }}>{"\u2014"}</span>
                )}
              </div>

              {/* Status */}
              <div style={{ minWidth: 80 }}>
                <StatusPill status={vendor.status} />
                <RiskBadge vendor={vendor} />
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit?.(vendor)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--status-error)" }} onClick={() => onDelete?.(vendor)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>

              {/* Expand arrow */}
              <div style={{ flexShrink: 0 }}>
                {isExpanded ? <ChevronUp size={14} style={{ color: "var(--text-muted)" }} /> : <ChevronDown size={14} style={{ color: "var(--text-muted)" }} />}
              </div>
            </div>

            {/* ── Expanded Detail ── */}
            {isExpanded && (
              <div style={{ padding: "14px 16px", borderTop: "1px solid var(--divider)", background: "var(--bg-surface-low)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                  {/* Contact & Address */}
                  <div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Contact</div>
                    {vendor.email && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-secondary)", marginBottom: 3 }}>
                        <Mail size={9} />{vendor.email}
                      </div>
                    )}
                    {vendor.address && (
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-secondary)", marginTop: 6 }}>
                        {vendor.address}{vendor.city ? `, ${vendor.city}` : ""}{vendor.state ? ` ${vendor.state}` : ""}{vendor.zip ? ` ${vendor.zip}` : ""}
                      </div>
                    )}
                    {vendor.website && (
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent-light)", marginTop: 4 }}>{vendor.website}</div>
                    )}
                  </div>

                  {/* Certifications & Insurance */}
                  <div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Compliance</div>
                    {vendor.certifications && (
                      <div style={{ marginBottom: 4 }}>
                        <span style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-secondary)" }}>{vendor.certifications}</span>
                        {vendor.certifications_expiry && (
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: new Date(vendor.certifications_expiry) < new Date() ? "var(--status-error)" : "var(--text-muted)" }}>
                            Expires: {formatDate(vendor.certifications_expiry)}
                          </div>
                        )}
                      </div>
                    )}
                    {vendor.insurance_provider && (
                      <div style={{ marginTop: 6 }}>
                        <span style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-secondary)" }}>Ins: {vendor.insurance_provider}</span>
                        {vendor.insurance_expiry && (
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: new Date(vendor.insurance_expiry) < new Date() ? "var(--status-error)" : "var(--text-muted)" }}>
                            Expires: {formatDate(vendor.insurance_expiry)}
                          </div>
                        )}
                      </div>
                    )}
                    {!vendor.certifications && !vendor.insurance_provider && (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-disabled)" }}>No compliance data</span>
                    )}
                  </div>

                  {/* Business Terms */}
                  <div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Terms</div>
                    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 10px", fontFamily: "var(--font-body)", fontSize: 10 }}>
                      <span style={{ color: "var(--text-muted)" }}>Payment</span>
                      <span style={{ color: "var(--text-secondary)" }}>{vendor.payment_terms || "N/A"}</span>
                      <span style={{ color: "var(--text-muted)" }}>Tier</span>
                      <span style={{ color: "var(--text-secondary)" }}>{vendor.pricing_tier || "Standard"}</span>
                      {vendor.years_in_business && <>
                        <span style={{ color: "var(--text-muted)" }}>Experience</span>
                        <span style={{ color: "var(--text-secondary)" }}>{vendor.years_in_business} yr{vendor.years_in_business !== 1 ? "s" : ""}</span>
                      </>}
                    </div>
                  </div>
                </div>

                {/* Linked project data */}
                {stats.deliveries?.length > 0 && (
                  <div style={{ marginTop: 14, borderTop: "1px solid var(--divider)", paddingTop: 10 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
                      Recent Deliveries
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {stats.deliveries.slice(0, 4).map((d, i) => (
                        <div key={i} style={{
                          padding: "4px 10px", background: "var(--bg-surface)", borderRadius: "var(--radius-badge)",
                          border: "1px solid var(--divider)", fontFamily: "var(--font-mono)", fontSize: 9,
                        }}>
                          <span style={{ color: "var(--accent-light)" }}>{d.delivery_number || d.delivery_title}</span>
                          <span style={{ color: d.status === "Delivered" ? "var(--status-success)" : "var(--text-muted)", marginLeft: 6 }}>{d.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
