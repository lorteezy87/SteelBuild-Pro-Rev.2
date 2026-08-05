/** Pure version stack + linked entity chips for DocumentDetailPanel. */

export type DocLike = {
  documentNumber?: string | null;
  document_number?: string | null;
  revisionNumber?: string | number | null;
  revision_number?: string | number | null;
  uploadedDate?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
};

export type EntityLabelMeta = {
  label: string;
  color: string;
  bg: string;
  border: string;
};

export function buildDocumentVersionStack(
  docNum: string | null | undefined,
  allDocuments: DocLike[] | null | undefined,
): DocLike[] {
  if (!docNum || !(allDocuments || []).length) return [];
  return (allDocuments || [])
    .filter((d) => (d.documentNumber || d.document_number) === docNum)
    .sort((a, b) => {
      const revA = parseInt(String(a.revisionNumber || a.revision_number || "0"), 10) || 0;
      const revB = parseInt(String(b.revisionNumber || b.revision_number || "0"), 10) || 0;
      if (revB !== revA) return revB - revA;
      return (
        Number(new Date(b.uploadedDate || b.created_at || 0)) -
        Number(new Date(a.uploadedDate || a.created_at || 0))
      );
    });
}

export function buildLinkedDocumentEntities(
  doc: Record<string, unknown> | null | undefined,
  entityLabels: Record<string, EntityLabelMeta>,
) {
  if (!doc) return [];
  return Object.entries(entityLabels)
    .filter(([key]) => doc[key])
    .map(([key, meta]) => ({ key, value: doc[key], ...meta }));
}

export function fileSizeMbFromKb(fileSizeKb: number | null | undefined): string {
  return fileSizeKb ? (fileSizeKb / 1024).toFixed(1) : "0.0";
}
