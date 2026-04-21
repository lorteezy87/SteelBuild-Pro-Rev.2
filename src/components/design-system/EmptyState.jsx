/**
 * EmptyState — dashed-border hero block for "no records" views.
 * Icon + title + body + optional CTA.
 */

import React from "react";
import Icon from "./Icon";

export default function EmptyState({ icon = "rfi", title, body, cta }) {
  return (
    <div
      style={{
        padding: "48px 24px",
        textAlign: "center",
        border: "1px dashed var(--border-default)",
        borderRadius: "var(--radius-card)",
        background: "var(--bg-surface-low)",
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          margin: "0 auto 12px",
          borderRadius: 8,
          background: "var(--bg-surface-high)",
          border: "1px solid var(--border-default)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--accent)",
        }}
      >
        <Icon name={icon} size={22} color="var(--accent)" />
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 15,
          fontWeight: 700,
          color: "var(--text-primary)",
          marginBottom: 4,
          letterSpacing: "0.02em",
        }}
      >
        {title}
      </div>
      {body && (
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 12,
            color: "var(--text-muted)",
            marginBottom: cta ? 16 : 0,
            maxWidth: 360,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          {body}
        </div>
      )}
      {cta}
    </div>
  );
}
