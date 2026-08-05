/**
 * Presentational building blocks for Onboarding.
 * Extracted from Onboarding.jsx (behavior-preserving).
 */
import { CheckCircle2 } from "lucide-react";
import { SAMPLE_PROJECT_TEMPLATE_KEY } from "@/lib/onboardingTemplates";

export function TextField({ label, value, onChange, type = "text", required = false, placeholder = "", span = 1 }) {
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

export function StepItem({ done, icon: Icon, title, detail }) {
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

export function TemplateCard({ template, selected, onSelect }) {
  const isDemo = template.key === SAMPLE_PROJECT_TEMPLATE_KEY;
  return (
    <button
      type="button"
      className={`onboarding-template-card ${selected ? "is-selected" : ""}`}
      onClick={onSelect}
      style={{ "--template-accent": template.accent || "var(--accent)" }}
    >
      <div className="onboarding-template-header">
        <span className="onboarding-template-dot" />
        <span>{isDemo ? "DEMO SAMPLE" : template.phase}</span>
      </div>
      <strong>{template.name}</strong>
      <p>{template.description}</p>
      <div className="onboarding-template-modules">
        {template.modules.slice(0, 6).map((module) => <span key={module}>{module}</span>)}
      </div>
    </button>
  );
}

export function SectionHeader({ icon: Icon, title, detail }) {
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

