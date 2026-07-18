type BulkWorkPackageRow = Record<string, unknown>;
type AllocateNumber = (projectId: string, recordType: string) => Promise<number>;

const MAX_ALLOCATION_ATTEMPTS = 5;

/**
 * Prepare bulk rows before any database write begins.
 * Missing official numbers come only from the injected server-backed allocator;
 * allocation failure or duplicate numbers fails the entire preparation step.
 */
export async function prepareBulkWorkPackageRows(
  rows: BulkWorkPackageRow[],
  projectId: string | null | undefined,
  allocateNumber: AllocateNumber,
): Promise<BulkWorkPackageRow[]> {
  if (!rows?.length) throw new Error("No rows to add");
  if (!projectId) throw new Error("Select a project first");

  const usedNumbers = new Set<string>();
  const prepared: BulkWorkPackageRow[] = [];

  for (const row of rows) {
    let wpNumber = String(row.wp_number || "").trim();

    if (!wpNumber) {
      for (let attempt = 0; attempt < MAX_ALLOCATION_ATTEMPTS; attempt += 1) {
        const allocated = await allocateNumber(projectId, "wp_number");
        if (!Number.isFinite(allocated)) {
          throw new Error("Unable to reserve a work package number. Please retry.");
        }
        const candidate = `WP-${String(allocated).padStart(3, "0")}`;
        if (!usedNumbers.has(candidate)) {
          wpNumber = candidate;
          break;
        }
      }
      if (!wpNumber) {
        throw new Error("Unable to reserve unique work package numbers. Please retry.");
      }
    }

    if (usedNumbers.has(wpNumber)) {
      throw new Error(`Duplicate work package number: ${wpNumber}`);
    }
    usedNumbers.add(wpNumber);
    prepared.push({
      ...row,
      wp_number: wpNumber,
      project_id: projectId,
      project_name: row.project_name || undefined,
    });
  }

  return prepared;
}
