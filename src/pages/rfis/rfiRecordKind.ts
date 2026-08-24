export type RfiRecordKind = "rfi" | "detail_query";

type RfiRecordWithMetadata = {
  metadata?: unknown;
};

function metadataRecordKind(record: RfiRecordWithMetadata): unknown {
  const metadata = record.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
  return (metadata as Record<string, unknown>).record_kind;
}

export function filterRfiRecordsByKind<T extends RfiRecordWithMetadata>(
  records: T[],
  kind: RfiRecordKind,
): T[] {
  if (kind === "detail_query") {
    return records.filter((record) => metadataRecordKind(record) === "detail_query");
  }

  // Existing RFIs predate record_kind. Treating an absent marker as an RFI
  // keeps every legacy project intact while excluding explicit Detail Queries.
  return records.filter((record) => metadataRecordKind(record) !== "detail_query");
}

export function withRfiRecordKind<T extends RfiRecordWithMetadata>(
  record: T,
  kind: RfiRecordKind,
): T & { metadata: Record<string, unknown> } {
  const metadata = record.metadata;
  const metadataObject = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};

  return {
    ...record,
    metadata: {
      ...metadataObject,
      record_kind: kind,
    },
  };
}
