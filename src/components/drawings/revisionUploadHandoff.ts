import type { DocControlAttestations } from "@/lib/docControl";

/** Typed boundary for the reviewed-PDF handoff into the existing JSX wizard. */
export interface RevisionUploadHandoffProps {
  open: boolean;
  onClose: () => void;
  onComplete: (result: { complete?: boolean; failed?: number; historyFailed?: number }) => void;
  activeProject: { id: string; name?: string | null; [key: string]: unknown };
  preSelectedSet: { id?: string | null; [key: string]: unknown };
  drawingSets: Array<{ id?: string | null; [key: string]: unknown }>;
  initialPdfFile: File;
  initialAttestations: Record<string, Partial<DocControlAttestations>>;
  initialReview: {
    sheets: unknown[];
    setMeta: Record<string, unknown> | null;
    scanned: boolean;
    sourcePages: Record<string, number>;
    revisionLabel: string;
    issueDate: string;
    issuedBy: string;
  };
}
