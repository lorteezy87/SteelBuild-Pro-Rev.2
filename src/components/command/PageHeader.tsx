import type { ReactNode } from "react";

export interface PageHeaderProps {
  eyebrow?: ReactNode;
  title: string;
  subtitle?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, subtitle, meta, actions }: PageHeaderProps) {
  return (
    <header className="sbp-page-header">
      <div className="sbp-page-header__identity">
        {eyebrow ? <div className="sbp-page-header__eyebrow">{eyebrow}</div> : null}
        <div className="sbp-page-header__title-row">
          <div>
            <h1 className="sbp-page-header__title">{title}</h1>
            {subtitle ? <div className="sbp-page-header__subtitle">{subtitle}</div> : null}
          </div>
          {actions ? <div className="sbp-page-header__actions">{actions}</div> : null}
        </div>
        {meta ? <div className="sbp-page-header__meta">{meta}</div> : null}
      </div>
    </header>
  );
}
