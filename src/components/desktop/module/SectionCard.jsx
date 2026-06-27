/**
 * SectionCard — the universal glass content card. Header (icon + title +
 * optional action) over body. No card-in-card nesting.
 */
import React from "react";

export default function SectionCard({ title, icon: Icon, headerAction, className = "", children }) {
  const hasHead = title || headerAction || Icon;
  return (
    <section className={`desk-section-card ${className}`.trim()}>
      {hasHead && (
        <header className="desk-section-card__head">
          {Icon ? <Icon size={16} strokeWidth={1.8} aria-hidden="true" /> : null}
          {title ? <span className="desk-section-card__title">{title}</span> : null}
          {headerAction ? <span className="desk-section-card__action">{headerAction}</span> : null}
        </header>
      )}
      <div className="desk-section-card__body">{children}</div>
    </section>
  );
}
