import { describe, expect, it } from "vitest";
import {
  groupAttachmentsByMessage,
  collectAllLabels,
  filterMessages,
  computeEmailStats,
  computeFolderCounts,
  countMessagesWithLabel,
  labelsWithAdded,
  labelsWithout,
  allFilteredSelected,
  nextSelectedIdsForToggleAll,
  nextSelectedIdsForToggle,
  findMessageById,
} from "../emailInboxHelpers";
import type { EmailMessage } from "../types";

function msg(partial: Partial<EmailMessage> & { id: string }): EmailMessage {
  return {
    subject: "",
    sender_email: "",
    sender_name: "",
    labels: [],
    import_status: "pending",
    direction: "inbound",
    is_read: false,
    is_starred: false,
    ...partial,
  } as EmailMessage;
}

describe("emailInboxHelpers", () => {
  it("groups attachments by message id", () => {
    const map = groupAttachmentsByMessage([
      { id: "a1", message_id: "m1" } as any,
      { id: "a2", message_id: "m1" } as any,
      { id: "a3", message_id: "m2" } as any,
      { id: "a4", message_id: null } as any,
    ]);
    expect(map.m1).toHaveLength(2);
    expect(map.m2).toHaveLength(1);
  });

  it("collects and sorts labels with defaults", () => {
    const labels = collectAllLabels([
      msg({ id: "1", labels: ["CustomZ"] }),
      msg({ id: "2", labels: ["Urgent"] }),
    ]);
    expect(labels).toContain("Urgent");
    expect(labels).toContain("CustomZ");
    expect(labels).toEqual([...labels].sort());
  });

  it("filters by folder, label, and search", () => {
    const messages = [
      msg({ id: "1", subject: "RFI response", import_status: "pending", direction: "inbound", labels: ["Urgent"] }),
      msg({ id: "2", subject: "Hello", import_status: "pending", direction: "outbound" }),
      msg({ id: "3", subject: "Archived note", import_status: "archived", direction: "inbound", labels: ["Urgent"] }),
    ];
    expect(filterMessages(messages, { activeFolder: "inbox", activeLabelFilter: null, search: "" })).toHaveLength(1);
    expect(filterMessages(messages, { activeFolder: "sent", activeLabelFilter: null, search: "" }).map((m) => m.id)).toEqual(["2"]);
    expect(
      filterMessages(messages, { activeFolder: "all", activeLabelFilter: "Urgent", search: "" }).map((m) => m.id),
    ).toEqual(["1", "3"]);
    expect(
      filterMessages(messages, { activeFolder: "all", activeLabelFilter: null, search: "rfi" }).map((m) => m.id),
    ).toEqual(["1"]);
  });

  it("computes stats and folder counts", () => {
    const messages = [
      msg({ id: "1", import_status: "pending", direction: "inbound", is_read: false, is_starred: true }),
      msg({ id: "2", import_status: "pending", direction: "inbound", is_read: true }),
      msg({ id: "3", direction: "outbound", import_status: "pending" }),
      msg({ id: "4", import_status: "archived", is_starred: true }),
    ];
    const stats = computeEmailStats(messages);
    expect(stats.total).toBe(2);
    expect(stats.unread).toBe(1);
    expect(stats.starred).toBe(1);
    expect(stats.sent).toBe(1);
    const counts = computeFolderCounts(messages);
    expect(counts.inbox).toBe(2);
    expect(counts.sent).toBe(1);
    expect(counts.all).toBe(4);
  });

  it("label helpers and selection toggles", () => {
    expect(countMessagesWithLabel([msg({ id: "1", labels: ["A"] }), msg({ id: "2", labels: [] })], "A")).toBe(1);
    expect(labelsWithAdded(["A"], "A")).toBeNull();
    expect(labelsWithAdded(["A"], "B")).toEqual(["A", "B"]);
    expect(labelsWithout(["A", "B"], "A")).toEqual(["B"]);

    const filtered = [{ id: "1" }, { id: "2" }];
    expect(allFilteredSelected(filtered, new Set(["1"]))).toBe(false);
    expect(allFilteredSelected(filtered, new Set(["1", "2"]))).toBe(true);
    expect([...nextSelectedIdsForToggleAll(filtered, new Set())].sort()).toEqual(["1", "2"]);
    expect([...nextSelectedIdsForToggleAll(filtered, new Set(["1", "2"]))]).toEqual([]);
    expect([...nextSelectedIdsForToggle(new Set(["1"]), "2")].sort()).toEqual(["1", "2"]);
    expect([...nextSelectedIdsForToggle(new Set(["1"]), "1")]).toEqual([]);
  });

  it("finds selected message by id", () => {
    const messages = [msg({ id: "1" }), msg({ id: "2" })];
    expect(findMessageById(messages, "2")?.id).toBe("2");
    expect(findMessageById(messages, null)).toBeNull();
    expect(findMessageById(messages, "missing")).toBeNull();
  });
});
