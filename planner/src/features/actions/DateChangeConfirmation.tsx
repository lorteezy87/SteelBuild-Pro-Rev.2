import { useEffect, useRef, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

export type ConfirmedChange = {
  label: string;
  previousValue: string | null | undefined;
  nextValue: string | null | undefined;
};

type DateChangeConfirmationProps = {
  changes: readonly ConfirmedChange[];
  onCancel: () => void;
  onConfirm: () => void;
  restoreFocusElement?: HTMLElement | null;
};

function displayValue(value: string | null | undefined): string {
  return value?.trim() || "Not set";
}

/** Native confirmation panel; Planner intentionally does not use forms or Radix Dialog. */

function focusableElements(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
}

export default function DateChangeConfirmation({ changes, onCancel, onConfirm, restoreFocusElement }: DateChangeConfirmationProps) {
  const panelRef = useRef<HTMLElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    confirmRef.current?.focus();
    return () => (restoreFocusElement ?? openerRef.current)?.focus();
  }, [restoreFocusElement]);
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") { event.preventDefault(); onCancel(); return; }
    if (event.key !== "Tab" || !panelRef.current) return;
    const elements = focusableElements(panelRef.current);
    if (elements.length === 0) return;
    const first = elements[0]; const last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  const content = (
    <section ref={panelRef} className="planner-action-panel" aria-labelledby="planner-change-confirmation-heading" role="alertdialog" aria-modal="true" onKeyDown={handleKeyDown}>
      <h3 id="planner-change-confirmation-heading">Confirm required-date change</h3>
      <p>Review the schedule or ownership change before it is sent to SteelBuild.</p>
      <dl>
        {changes.map((change) => (
          <div key={change.label}>
            <dt>{change.label}</dt>
            <dd><span>{displayValue(change.previousValue)}</span> → <span>{displayValue(change.nextValue)}</span></dd>
          </div>
        ))}
      </dl>
      <div className="planner-action-panel__actions">
        <button className="planner-button" type="button" onClick={onCancel}>Cancel</button>
        <button ref={confirmRef} className="planner-button planner-button--primary" type="button" onClick={onConfirm}>Confirm change</button>
      </div>
    </section>
  );
  return typeof document === "undefined" ? content : createPortal(content, document.body);
}
