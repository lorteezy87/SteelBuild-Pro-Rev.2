import { useState, useCallback, useRef } from "react";
import { validate } from "@/services/validation";

/**
 * useFormValidation — bridge between the validation service and form UI.
 *
 * Returns a fieldErrors map (field → message) for inline display,
 * plus a `runValidation(data)` function that validates + shows errors.
 *
 * Usage:
 *   const { fieldErrors, runValidation, clearErrors } = useFormValidation("action_item");
 *   const handleSave = () => {
 *     if (!runValidation(formData)) return;
 *     mutation.mutate(formData);
 *   };
 *   // In JSX: {fieldErrors.title && <span className="error">{fieldErrors.title}</span>}
 */
export function useFormValidation(entityName, mode = "create") {
  const [fieldErrors, setFieldErrors] = useState({});
  const entityRef = useRef(entityName);
  entityRef.current = entityName;

  const runValidation = useCallback((data) => {
    const errors = validate(entityRef.current, data, mode);
    if (errors.length === 0) {
      setFieldErrors({});
      return true;
    }
    const map = {};
    for (const e of errors) {
      if (!map[e.field]) map[e.field] = e.message;
    }
    setFieldErrors(map);
    return false;
  }, [mode]);

  const clearErrors = useCallback(() => setFieldErrors({}), []);
  const clearField = useCallback((field) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  return { fieldErrors, runValidation, clearErrors, clearField };
}
