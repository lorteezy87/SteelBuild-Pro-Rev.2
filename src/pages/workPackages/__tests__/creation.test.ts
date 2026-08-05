import { describe, expect, it, vi } from "vitest";
import { prepareBulkWorkPackageRows } from "../creation";

describe("bulk work package preparation", () => {
  it("preserves supplied numbers and scopes rows to the project without allocating", async () => {
    const allocate = vi.fn();
    const rows = await prepareBulkWorkPackageRows(
      [{ wp_number: "WP-101", name: "Shop" }],
      "project-1",
      allocate,
    );

    expect(allocate).not.toHaveBeenCalled();
    expect(rows).toEqual([{ wp_number: "WP-101", name: "Shop", project_id: "project-1", project_name: undefined }]);
  });

  it("uses the server allocator for missing numbers", async () => {
    const allocate = vi.fn().mockResolvedValueOnce(7).mockResolvedValueOnce(8);
    const rows = await prepareBulkWorkPackageRows(
      [{ name: "Shop" }, { name: "Field" }],
      "project-1",
      allocate,
    );

    expect(allocate).toHaveBeenNthCalledWith(1, "project-1", "wp_number");
    expect(allocate).toHaveBeenNthCalledWith(2, "project-1", "wp_number");
    expect(rows.map((row) => row.wp_number)).toEqual(["WP-007", "WP-008"]);
  });

  it("fails closed when allocation fails partway through preparation", async () => {
    const allocate = vi.fn().mockResolvedValueOnce(7).mockRejectedValueOnce(new Error("RPC unavailable"));

    await expect(
      prepareBulkWorkPackageRows([{ name: "Shop" }, { name: "Field" }], "project-1", allocate),
    ).rejects.toThrow("RPC unavailable");
  });

  it("rejects duplicate numbers before any rows are returned for writing", async () => {
    await expect(
      prepareBulkWorkPackageRows(
        [{ wp_number: "WP-101" }, { wp_number: "WP-101" }],
        "project-1",
        vi.fn(),
      ),
    ).rejects.toThrow("Duplicate work package number: WP-101");
  });
});
