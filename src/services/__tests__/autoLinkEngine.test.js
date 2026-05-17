import { describe, expect, it } from "vitest";
import { findAutoLinks, suggestLinksForEntity } from "../autoLinkEngine";

const DRAWINGS = [
  { id: "d-1", sheet_number: "S3.2", title: "Roof framing plan" },
  { id: "d-2", sheet_number: "A2.1", title: "Elevation north" },
  { id: "d-3", sheet_number: "M1.04", title: "Mech plan level 1" },
  { id: "d-4", sheet_number: "E-2.3", title: "Electrical panel layout", is_deleted: true },
];

const WORK_PACKAGES = [
  { id: "wp-1", wp_number: "WP-104", name: "Mezzanine steel", sequence_number: "S2" },
  { id: "wp-2", wp_number: "WP-205", name: "Roof east", sequence_number: "S3" },
  { id: "wp-3", wp_number: "WP-300", name: "Deleted WP", is_deleted: true },
];

const RFIS = [
  { id: "rfi-1", rfi_number: "RFI-001", title: "Column base conflict" },
  { id: "rfi-2", rfi_number: "RFI-42", title: "Beam camber question" },
  { id: "rfi-3", rfi_number: "RFI-099", title: "Deleted RFI", is_deleted: true },
];

const SOURCES = {
  drawings: DRAWINGS,
  workPackages: WORK_PACKAGES,
  rfis: RFIS,
};

describe("auto-link engine", () => {
  describe("drawing number matching", () => {
    it("matches standard drawing numbers like S3.2", () => {
      const links = findAutoLinks("See sheet S3.2 for framing", SOURCES);
      expect(links).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "drawing",
            entityType: "Drawing",
            entityId: "d-1",
            confidence: "high",
          }),
        ]),
      );
    });

    it("matches architectural drawing numbers like A2.1", () => {
      const links = findAutoLinks("Refer to A2.1", SOURCES);
      expect(links.find(l => l.entityId === "d-2")).toBeDefined();
    });

    it("matches mechanical drawing numbers like M1.04", () => {
      const links = findAutoLinks("Per M1.04 ductwork routing", SOURCES);
      expect(links.find(l => l.entityId === "d-3")).toBeDefined();
    });

    it("skips deleted drawings", () => {
      const links = findAutoLinks("See E-2.3 for panel layout", SOURCES);
      expect(links.find(l => l.entityId === "d-4")).toBeUndefined();
    });

    it("returns empty for unmatched drawing numbers", () => {
      const links = findAutoLinks("See S9.9 for detail", SOURCES);
      expect(links.filter(l => l.type === "drawing")).toHaveLength(0);
    });
  });

  describe("work package code matching", () => {
    it("matches WP-104 format", () => {
      const links = findAutoLinks("Ship to WP-104 staging area", SOURCES);
      expect(links).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "work_package",
            entityType: "WorkPackage",
            entityId: "wp-1",
            confidence: "high",
          }),
        ]),
      );
    });

    it("matches WP 205 format (space separator)", () => {
      const links = findAutoLinks("Delivery for WP 205", SOURCES);
      expect(links.find(l => l.entityId === "wp-2")).toBeDefined();
    });

    it("skips deleted work packages", () => {
      const links = findAutoLinks("WP-300 notes", SOURCES);
      expect(links.find(l => l.entityId === "wp-3")).toBeUndefined();
    });
  });

  describe("RFI reference matching", () => {
    it("matches RFI-001 format", () => {
      const links = findAutoLinks("Response to RFI-001 pending", SOURCES);
      expect(links).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "rfi",
            entityType: "RFI",
            entityId: "rfi-1",
            confidence: "high",
          }),
        ]),
      );
    });

    it("matches RFI 42 format (space, no leading zeros)", () => {
      const links = findAutoLinks("See RFI 42 for clarification", SOURCES);
      expect(links.find(l => l.entityId === "rfi-2")).toBeDefined();
    });

    it("skips deleted RFIs", () => {
      const links = findAutoLinks("RFI-099 answered", SOURCES);
      expect(links.find(l => l.entityId === "rfi-3")).toBeUndefined();
    });
  });

  describe("sequence reference matching", () => {
    it("matches 'Seq 2' format", () => {
      const links = findAutoLinks("Erect Seq 2 next week", SOURCES);
      expect(links).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "sequence",
            entityType: "WorkPackage",
            entityId: "wp-1",
            confidence: "medium",
          }),
        ]),
      );
    });

    it("matches 'Sequence 3' format", () => {
      const links = findAutoLinks("Sequence 3 material release", SOURCES);
      expect(links.find(l => l.entityId === "wp-2")).toBeDefined();
    });
  });

  describe("multiple patterns in one text", () => {
    it("finds all references in a complex string", () => {
      const links = findAutoLinks(
        "Per RFI-001, update S3.2 and coordinate with WP-104 for Seq 3 delivery",
        SOURCES,
      );

      const types = links.map(l => l.type);
      expect(types).toContain("rfi");
      expect(types).toContain("drawing");
      expect(types).toContain("work_package");
      expect(types).toContain("sequence");
    });
  });

  describe("deduplication", () => {
    it("returns each entity only once even if referenced multiple times", () => {
      const links = findAutoLinks(
        "RFI-001 is related to RFI-001, see also RFI-001",
        SOURCES,
      );

      const rfiLinks = links.filter(l => l.entityId === "rfi-1");
      expect(rfiLinks).toHaveLength(1);
    });

    it("deduplicates across pattern types for the same entity", () => {
      // WP-104 is also sequence S2; if both patterns match the same WP, deduplicate
      const links = findAutoLinks("WP-104 in Seq 2 area", SOURCES);
      const wp1Links = links.filter(l => l.entityId === "wp-1");
      expect(wp1Links).toHaveLength(1);
    });
  });

  describe("edge cases", () => {
    it("returns empty array for null/empty text", () => {
      expect(findAutoLinks(null, SOURCES)).toEqual([]);
      expect(findAutoLinks("", SOURCES)).toEqual([]);
      expect(findAutoLinks(undefined, SOURCES)).toEqual([]);
    });

    it("returns empty array for empty sources", () => {
      const links = findAutoLinks("See S3.2 and RFI-001", {});
      expect(links).toEqual([]);
    });

    it("handles non-string input gracefully", () => {
      expect(findAutoLinks(12345, SOURCES)).toEqual([]);
    });
  });

  describe("suggestLinksForEntity", () => {
    it("scans title, description, and drawing_reference fields", () => {
      const entity = {
        title: "Column conflict at S3.2",
        description: "Coordinate with WP-104",
        drawing_reference: "A2.1",
      };

      const links = suggestLinksForEntity(entity, SOURCES);
      const ids = links.map(l => l.entityId);
      expect(ids).toContain("d-1");
      expect(ids).toContain("wp-1");
      expect(ids).toContain("d-2");
    });

    it("scans question and notes fields", () => {
      const entity = {
        question: "Is RFI-001 resolved?",
        notes: "Ref WP-205 schedule",
      };

      const links = suggestLinksForEntity(entity, SOURCES);
      const ids = links.map(l => l.entityId);
      expect(ids).toContain("rfi-1");
      expect(ids).toContain("wp-2");
    });

    it("handles entity with no text fields", () => {
      const links = suggestLinksForEntity({}, SOURCES);
      expect(links).toEqual([]);
    });

    it("handles entity with only null/undefined fields", () => {
      const entity = { title: null, description: undefined, notes: "" };
      const links = suggestLinksForEntity(entity, SOURCES);
      expect(links).toEqual([]);
    });
  });
});
