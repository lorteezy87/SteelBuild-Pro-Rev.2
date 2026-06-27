import type { ComponentType, ReactNode } from "react";

export interface HeroChip { label: string; tone?: "neutral" | "good" }
export interface HeroStat { value: ReactNode; label: string }

export function PageHero({
  Icon,
  title,
  subtitle,
  projectName,
  chips = [],
  stats = [],
  photoSrc,
  children,
}: {
  Icon: ComponentType<{ size?: number | string }>;
  title: string;
  subtitle: string;
  projectName: string;
  chips?: HeroChip[];
  stats?: HeroStat[];
  photoSrc?: string;
  children?: ReactNode;
}) {
  return (
    <section className={`cmd-hero${photoSrc ? " cmd-hero--photo" : ""}`} style={photoSrc ? { ["--cmd-hero-photo" as string]: `url(${photoSrc})` } : undefined}>
      <div className="cmd-hero__left">
        <div className="cmd-hero__icon"><Icon size={26} /></div>
        <div>
          <h1 className="cmd-hero__title">{title}</h1>
          <p className="cmd-hero__subtitle">{subtitle}</p>
          <div className="cmd-hero__chips">
            <span className="cmd-hero__project">{projectName}</span>
            {chips.map((c, i) => (
              <span className={`cmd-chip${c.tone === "good" ? " cmd-chip--good" : ""}`} key={i}>{c.label}</span>
            ))}
          </div>
        </div>
      </div>
      <div className="cmd-hero__right">
        {stats.map((s, i) => (
          <div className="cmd-statcard" key={i}>
            <div className="cmd-statcard__value">{s.value}</div>
            <div className="cmd-statcard__label">{s.label}</div>
          </div>
        ))}
        {children}
      </div>
    </section>
  );
}
