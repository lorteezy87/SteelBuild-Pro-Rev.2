/**
 * Pure layout/catalog atoms for documents ListView.
 */

export const DOCUMENTS_LIST_GRID = "28px 1fr 100px 80px 70px 80px 90px 100px";

export type DocumentsSortableColumn = {
  label: string;
  sort: string | null;
  sortAlt: string | null;
};

export const DOCUMENTS_SORTABLE_COLUMNS: DocumentsSortableColumn[] = [
  { label: "Name", sort: "name-asc", sortAlt: "name-desc" },
  { label: "Doc #", sort: "doc-num", sortAlt: null },
  { label: "Rev", sort: null, sortAlt: null },
  { label: "Type", sort: null, sortAlt: null },
  { label: "Status", sort: "status", sortAlt: null },
  { label: "Size", sort: "size-desc", sortAlt: "size-asc" },
  { label: "Date", sort: "date-desc", sortAlt: "date-asc" },
];
