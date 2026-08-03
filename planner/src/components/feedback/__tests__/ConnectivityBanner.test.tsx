// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ConnectivityBanner from "../ConnectivityBanner";

describe("ConnectivityBanner", () => {
  it("labels cached offline data and its most recent sync time", () => {
    render(<ConnectivityBanner online={false} hasCachedData pendingCount={0} lastSyncedAt="2026-08-02T10:15:00.000Z" />);

    expect(screen.getByRole("status")).toHaveTextContent("Offline—cached data");
    expect(screen.getByRole("status")).toHaveTextContent("Last synced");
  });

  it("reports active synchronization with the pending change count", () => {
    render(<ConnectivityBanner online pendingCount={3} isSyncing />);

    expect(screen.getByRole("status")).toHaveTextContent("Syncing 3 changes");
  });

  it("surfaces a sync failure", () => {
    render(<ConnectivityBanner online pendingCount={1} syncError="A record changed on another device." />);

    expect(screen.getByRole("alert")).toHaveTextContent("Sync failed");
  });

  it("does not call an unverified browser connection online", () => {
    render(<ConnectivityBanner online pendingCount={0} />);

    expect(screen.getByRole("status")).toHaveTextContent("Connection available—verifying");
  });

  it("reports no cached records while offline when none were loaded", () => {
    render(<ConnectivityBanner online={false} pendingCount={0} />);

    expect(screen.getByRole("status")).toHaveTextContent("Offline—no cached data");
  });
});
