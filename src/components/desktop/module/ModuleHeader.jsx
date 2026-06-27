/**
 * ModuleHeader — the photo-accent identity band that opens every module page.
 * Reuses the module's launcher photo (photoFor) as a darkened banner; falls
 * back to a dark gradient when none exists. Icon + title + subtitle on the
 * left; KPI stat cluster + actions on the right; optional tabs via children.
 * White text on the dark band in both themes (mirrors ModuleTile).
 */
import React, { useState } from "react";
import { getPageIcon } from "@/config/pageIcons";
import { photoFor } from "@/config/launcherConfig";
import StatTile from "./StatTile";

export default function ModuleHeader({ page, title, subtitle, stats = [], actions, photoSrc, children }) {
  const Icon = getPageIcon(page);
  const photo = photoSrc ?? photoFor(page);
  const [imgFailed, setImgFailed] = useState(false);
  const showPhoto = !!photo && !imgFailed;

  return (
    <header className="desk-module-header">
      {showPhoto && (
        <img
          className="desk-module-header__photo"
          src={photo}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          onError={() => setImgFailed(true)}
        />
      )}
      <span className="desk-module-header__scrim" aria-hidden="true" />
      <div className="desk-module-header__main">
        <div className="desk-module-header__id">
          <Icon size={28} color="#fff" strokeWidth={1.6} aria-hidden="true" style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.65))" }} />
          <div>
            <h1 className="desk-module-header__title">{title}</h1>
            {subtitle ? <p className="desk-module-header__subtitle">{subtitle}</p> : null}
          </div>
        </div>
        <div className="desk-module-header__right">
          {stats.length > 0 && (
            <div className="desk-module-header__stats">
              {stats.map((s) => <StatTile key={s.label} label={s.label} value={s.value} tone={s.tone} />)}
            </div>
          )}
          {actions ? <div className="desk-module-header__actions">{actions}</div> : null}
        </div>
      </div>
      {children ? <div className="desk-module-header__tabs">{children}</div> : null}
    </header>
  );
}
