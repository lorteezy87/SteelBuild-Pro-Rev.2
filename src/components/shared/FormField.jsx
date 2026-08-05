import React, { useId } from "react";

/**
 * FormField — accessible label + control wrapper (H15).
 *
 * Wires a `<label htmlFor>` to its control via a stable React `useId()`, so
 * screen readers announce the field name when the control is focused, and
 * threads `aria-invalid` + `aria-describedby` through to the control when an
 * error is present. The error message renders in a `role="alert"` paragraph
 * so assistive tech announces it as it appears.
 *
 * Usage — the control is provided as a render-prop child so any input shape
 * (native <input>, <textarea>, <select>, or a custom control) can consume the
 * generated id + aria attributes:
 *
 *   <FormField label="Description *" error={errors.description}>
 *     {({ id, "aria-invalid": ai, "aria-describedby": ad }) => (
 *       <input id={id} aria-invalid={ai} aria-describedby={ad} ... />
 *     )}
 *   </FormField>
 *
 * Styling is left to the caller (the app themes controls via global CSS +
 * inline style objects); FormField only owns the label/error accessibility
 * plumbing and a thin default label style that matches the app's mono labels.
 */
export default function FormField({
  label,
  error,
  children,
  labelStyle,
  style,
  required = false,
}) {
  const id = useId();
  const errId = `${id}-err`;
  const hasError = !!error;

  const controlProps = {
    id,
    "aria-invalid": hasError ? true : undefined,
    "aria-describedby": hasError ? errId : undefined,
  };

  return (
    <div style={style}>
      {label != null && (
        <label
          htmlFor={id}
          style={
            labelStyle || {
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: "0.10em",
              color: "var(--text-muted)",
              textTransform: "uppercase",
              display: "block",
              marginBottom: 4,
            }
          }
        >
          {label}
          {required && <span aria-hidden="true"> *</span>}
        </label>
      )}
      {typeof children === "function" ? children(controlProps) : children}
      {hasError && (
        <p
          id={errId}
          role="alert"
          style={{ fontSize: 10, color: "var(--status-error)", marginTop: 3 }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
