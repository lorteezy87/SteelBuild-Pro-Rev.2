/**
 * Presentational building blocks for Onboarding.
 * Extracted from Onboarding.jsx (behavior-preserving).
 */
import type { CSSProperties, ComponentType } from "react";
import { CheckCircle2 } from "lucide-react";
import { SAMPLE_PROJECT_TEMPLATE_KEY } from "@/lib/onboardingTemplates";

export function TextField({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  placeholder = "",
  span = 1,
}: {
  label: string;
  value: string | number;
  onChange: (next: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  span?: number;
}) {
  return (
    <label className="onboarding-field" style={{ gridColumn: `span ${span}` }}>
      <span>{label}{required ? " *" : ""}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        placeholder={placeholder}
      />
    </label>
  );
}

export function StepItem({
  done,
  icon: Icon,
  title,
  detail,
}: {
  done: boolean;
  icon: ComponentType<{ size?: number }>;
  title: string;
  detail: string;
}) {
  return (
    <div className={`onboarding-step ${done ? "is-done" : ""}`}>
      <div className="onboarding-step-icon">
        {done ? <CheckCircle2 size={18} /> : <Icon size={18} />}
      </div>
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
    </div>
  );
}

export function TemplateCard({
  template,
  selected,
  onSelect,
}: {
  template: {
    key: string;
    accent?: string;
    phase?: string;
    name: string;
    description?: string;
    modules?: string[];
  };
  selected: boolean;
  onSelect: () => void;
}) {
  const isDemo = template.key === SAMPLE_PROJECT_TEMPLATE_KEY;
  return (
    <button
      type="button"
      className={`onboarding-template-card ${selected ? "is-selected" : ""}`}
      onClick={onSelect}
      style={{ "--template-accent": template.accent || "var(--accent)" } as CSSProperties}
    >
      <div className="onboarding-template-header">
        <span className="onboarding-template-dot" />
        <span>{isDemo ? "DEMO SAMPLE" : template.phase}</span>
      </div>
      <strong>{template.name}</strong>
      <p>{template.description}</p>
      <div className="onboarding-template-modules">
        {(template.modules || []).slice(0, 6).map((module) => <span key={module}>{module}</span>)}
      </div>
    </button>
  );
}

export function SectionHeader({
  icon: Icon,
  title,
  detail,
}: {
  icon: ComponentType<{ size?: number }>;
  title: string;
  detail?: string;
}) {
  return (
    <div className="onboarding-section-header">
      <div className="onboarding-section-icon"><Icon size={18} /></div>
      <div>
        <h2>{title}</h2>
        {detail && <p>{detail}</p>}
      </div>
    </div>
  );
}
