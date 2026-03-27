import React, { useState } from "react";

const STATUS_COLORS = {
  Active: "var(--status-success)",
  Inactive: "var(--text-muted)",
  Probation: "var(--status-warning)",
  Suspended: "var(--status-error)",
  Blacklisted: "var(--status-error)",
};

export default function VendorList({ vendors }) {
  const [expanded, setExpanded] = useState(null);

  if (vendors.length === 0) {
    return (
      <div style={{ background: "var(--bg-surface)", borderRadius: "var(--radius-card)", padding: "40px", textAlign: "center" }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" }}>No vendors found</p>
      </div>
    );
  }

  const getRatingColor = (rating) => {
    if (!rating) return "var(--text-muted)";
    if (rating >= 4.5) return "var(--status-success)";
    if (rating >= 4) return "var(--status-info)";
    if (rating >= 3) return "var(--status-warning)";
    return "var(--status-error)";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {vendors.map((vendor) => (
        <div key={vendor.id} style={{ background: "var(--bg-surface)", borderRadius: "var(--radius-card)", overflow: "hidden", cursor: "pointer", borderLeft: vendor.is_preferred ? "3px solid var(--status-success)" : "3px solid transparent", transition: "background 0.1s" }} onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-surface-low)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-surface)"; }}>
          {/* Header */}
          <div onClick={() => setExpanded(expanded === vendor.id ? null : vendor.id)} style={{ padding: "14px 16px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: "16px", alignItems: "center", borderBottom: expanded === vendor.id ? "1px solid var(--divider)" : "none" }}>
            <div>
              {vendor.is_preferred && <span style={{ fontSize: "8px", color: "var(--status-success)", fontWeight: 700, marginRight: "4px" }}>★ PREFERRED</span>}
              <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>{vendor.company_name}</div>
              <div style={{ fontSize: "9px", color: "var(--text-muted)", marginTop: "2px" }}>{vendor.vendor_type}</div>
            </div>

            <div>
              {vendor.contact_person && <div style={{ fontSize: "10px", color: "var(--text-secondary)", marginBottom: "2px" }}>{vendor.contact_person}</div>}
              {vendor.phone && <div style={{ fontSize: "9px", color: "var(--text-muted)" }}>📞 {vendor.phone}</div>}
              {vendor.email && <div style={{ fontSize: "9px", color: "var(--text-muted)" }}>📧 {vendor.email}</div>}
            </div>

            <div>
              {vendor.performance_rating && (
                <div style={{ marginBottom: "4px" }}>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: getRatingColor(vendor.performance_rating) }}>★ {vendor.performance_rating.toFixed(1)}</span>
                  <div style={{ fontSize: "8px", color: "var(--text-muted)" }}>Performance</div>
                </div>
              )}
              <div style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", background: `${STATUS_COLORS[vendor.status]}18`, borderRadius: 9999 }}>
                <span style={{ fontFamily: "var(--font-body)", fontSize: "9px", fontWeight: 700, color: STATUS_COLORS[vendor.status], textTransform: "uppercase", letterSpacing: "0.06em" }}>{vendor.status}</span>
              </div>
            </div>

            <div style={{ fontSize: "14px", color: "var(--text-muted)", transform: expanded === vendor.id ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>▼</div>
          </div>

          {/* Expanded */}
          {expanded === vendor.id && (
            <div style={{ padding: "16px", borderTop: "1px solid var(--divider)" }}>
              {vendor.address && (
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>Address</div>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                    {vendor.address}
                    {vendor.city && `, ${vendor.city}`}
                    {vendor.state && ` ${vendor.state}`}
                    {vendor.zip && ` ${vendor.zip}`}
                  </div>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                {vendor.certifications && (
                  <div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>Certifications</div>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>{vendor.certifications}</div>
                    {vendor.certifications_expiry && (
                      <div style={{ fontSize: "9px", color: "var(--text-muted)", marginTop: "2px" }}>Expires: {new Date(vendor.certifications_expiry).toLocaleDateString()}</div>
                    )}
                  </div>
                )}
                {vendor.insurance_expiry && (
                  <div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>Insurance</div>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>{vendor.insurance_provider}</div>
                    <div style={{ fontSize: "9px", color: "var(--text-muted)", marginTop: "2px" }}>Expires: {new Date(vendor.insurance_expiry).toLocaleDateString()}</div>
                  </div>
                )}
              </div>

              {(vendor.quality_score || vendor.delivery_score || vendor.communication_score) && (
                <div style={{ background: "var(--bg-surface-low)", padding: "8px", borderRadius: "var(--radius-card)", marginBottom: "12px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>Performance Metrics</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", fontSize: "10px" }}>
                    {vendor.quality_score !== null && (
                      <div>
                        <div style={{ color: "var(--text-muted)", fontSize: "8px", marginBottom: "2px" }}>Quality</div>
                        <div style={{ fontWeight: 600, color: vendor.quality_score >= 80 ? "var(--status-success)" : "var(--status-warning)" }}>{vendor.quality_score}%</div>
                      </div>
                    )}
                    {vendor.delivery_score !== null && (
                      <div>
                        <div style={{ color: "var(--text-muted)", fontSize: "8px", marginBottom: "2px" }}>Delivery</div>
                        <div style={{ fontWeight: 600, color: vendor.delivery_score >= 80 ? "var(--status-success)" : "var(--status-warning)" }}>{vendor.delivery_score}%</div>
                      </div>
                    )}
                    {vendor.communication_score !== null && (
                      <div>
                        <div style={{ color: "var(--text-muted)", fontSize: "8px", marginBottom: "2px" }}>Comms</div>
                        <div style={{ fontWeight: 600, color: vendor.communication_score >= 80 ? "var(--status-success)" : "var(--status-warning)" }}>{vendor.communication_score}%</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {vendor.total_spend_ytd !== null && vendor.total_spend_ytd > 0 && (
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>Spend YTD</div>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--accent)" }}>${vendor.total_spend_ytd.toLocaleString()}</div>
                </div>
              )}

              {vendor.last_order_date && (
                <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>Last order: {new Date(vendor.last_order_date).toLocaleDateString()}</div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}