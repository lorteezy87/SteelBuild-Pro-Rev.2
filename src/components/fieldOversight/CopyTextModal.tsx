/**
 * CopyTextModal — shows generated, paste-ready text (a notice, a request, a
 * daily, a brief) in an editable box with a copy button. Nothing is sent from
 * here: the PM reviews it and sends it from their own mail, under their name.
 */
import { useEffect, useRef, useState } from "react";
import type { ComponentType, PropsWithChildren } from "react";
import { toast } from "sonner";
import { Modal as ModalRaw, Button as ButtonRaw } from "@/components/design-system";
import "@/styles/field-oversight.css";

type AnyProps = PropsWithChildren<Record<string, unknown>>;
const Modal = ModalRaw as unknown as ComponentType<AnyProps>;
const Button = ButtonRaw as unknown as ComponentType<AnyProps>;

export interface CopyTextModalProps {
  open: boolean;
  title: string;
  eyebrow?: string;
  text: string;
  onClose: () => void;
  /** Optional follow-up action, e.g. "Mark notice sent". */
  extraAction?: { label: string; onClick: () => void; disabled?: boolean } | null;
}

export function CopyTextModal({ open, title, eyebrow, text, onClose, extraAction }: CopyTextModalProps) {
  const [value, setValue] = useState(text);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => { if (open) setValue(text); }, [open, text]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied to clipboard");
    } catch {
      areaRef.current?.focus();
      areaRef.current?.select();
      toast.message("Text selected — press Ctrl+C (⌘C) to copy");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      eyebrow={eyebrow}
      width={720}
      footer={(
        <div className="fo-modal-actions">
          <Button variant="secondary" onClick={onClose}>Close</Button>
          {extraAction ? (
            <Button variant="secondary" onClick={extraAction.onClick} disabled={extraAction.disabled}>{extraAction.label}</Button>
          ) : null}
          <Button variant="primary" onClick={() => { void copy(); }}>Copy to clipboard</Button>
        </div>
      )}
    >
      <textarea
        ref={areaRef}
        className="fo-copytext"
        aria-label={`${title} text`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        spellCheck
      />
    </Modal>
  );
}
