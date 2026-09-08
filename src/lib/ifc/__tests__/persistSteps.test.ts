import { describe, expect, it } from "vitest";
import {
  ROSTER_ROLLBACK_FIELD,
  STORAGE_OBJECT_MAX_BYTES,
  assertStorageObjectSize,
  describePersistFailure,
  describePersistProgress,
  formatMb,
  persistLeftPartialWrite,
  readRosterRollback,
} from "../persistSteps";

/** An error as importIfcRoster rethrows it, stamped with the rollback outcome. */
const stamped = (message: string, rollback: string) =>
  Object.assign(new Error(message), { [ROSTER_ROLLBACK_FIELD]: rollback });

describe("assertStorageObjectSize", () => {
  it("accepts anything up to the bucket ceiling", () => {
    expect(() => assertStorageObjectSize(0)).not.toThrow();
    expect(() => assertStorageObjectSize(STORAGE_OBJECT_MAX_BYTES)).not.toThrow();
    expect(() => assertStorageObjectSize(Number.NaN)).not.toThrow();
  });

  it("names the size and the limit when the object cannot fit", () => {
    expect(() => assertStorageObjectSize(STORAGE_OBJECT_MAX_BYTES + 1024 * 1024, "compressed model"))
      .toThrow(/compressed model is 51 MB; storage accepts files up to 50 MB/);
  });
});

describe("readRosterRollback", () => {
  it("reads the stamp importIfcRoster leaves on a failed save", () => {
    expect(readRosterRollback(stamped("boom", "clean"))).toBe("clean");
    expect(readRosterRollback(stamped("boom", "dirty"))).toBe("dirty");
  });

  it("treats anything unstamped as unknown — absence is not evidence", () => {
    expect(readRosterRollback(new Error("boom"))).toBe("unknown");
    expect(readRosterRollback({ code: "23505", message: "duplicate key" })).toBe("unknown");
    expect(readRosterRollback("Failed to fetch")).toBe("unknown");
    expect(readRosterRollback(null)).toBe("unknown");
    expect(readRosterRollback(stamped("boom", "probably"))).toBe("unknown");
  });
});

describe("describePersistFailure", () => {
  it("labels each step", () => {
    const err = new Error("boom");
    expect(describePersistFailure("extract", err)).toBe("Couldn't read the piece list from the IFC: boom");
    expect(describePersistFailure("compress", err)).toBe("Couldn't compress the IFC for upload: boom");
    expect(describePersistFailure("upload", err)).toBe("Couldn't upload the model to storage: boom");
    const register = describePersistFailure("register", err);
    expect(register).toMatch(/^Model uploaded, but the piece roster didn't finish saving: boom\./);
    // Must NOT promise the previous model is still active — that wording sent
    // operators into a retry loop that stacked extra rosters on the project.
    expect(register).not.toMatch(/previous model is still active/);
  });

  it("claims the roster is unchanged ONLY when the rollback was verified clean", () => {
    const msg = describePersistFailure("register", stamped("duplicate key", "clean"));
    expect(msg).toMatch(/^Model uploaded, but the piece roster didn't save: duplicate key\./);
    expect(msg).toMatch(/rolled back/);
    expect(msg).toMatch(/back the way it was/);
    expect(msg).toMatch(/safe to save again/);
  });

  it("does not claim an unchanged roster when the rollback failed — the reported incident", () => {
    // TypeError: Failed to fetch kills the rollback's statements too, so the old
    // roster and a partial new one can both be live. The message used to assert
    // "The project's model list was left unchanged" here — false — and then
    // contradicted itself with "if the piece count looks doubled".
    const msg = describePersistFailure("register", stamped("TypeError: Failed to fetch", "dirty"));
    expect(msg).not.toMatch(/left unchanged/);
    expect(msg).not.toMatch(/back the way it was/);
    expect(msg).toMatch(/undo couldn't be confirmed/);
    expect(msg).toMatch(/may have left rows behind/);
    // A network error proves the client saw no response, not that nothing landed.
    expect(msg).toMatch(/didn't finish saving/);
    // And the retire phase makes a completed save the repair, so it must not
    // send the operator away from the one action that fixes the count.
    expect(msg).toMatch(/replaces every earlier roster/);
    expect(msg).toMatch(/retry once you're back online/);
  });

  it("gives an unstamped register failure the cautious wording, not the reassuring one", () => {
    const msg = describePersistFailure("register", new Error("boom"));
    expect(msg).toMatch(/undo couldn't be confirmed/);
    expect(msg).not.toMatch(/left unchanged/);
    expect(msg).not.toMatch(/back the way it was/);
  });

  it("reads PostgREST-style error objects and plain strings", () => {
    expect(describePersistFailure("register", { code: "23505", message: "duplicate key" })).toContain("duplicate key");
    expect(describePersistFailure("upload", "Workspace is still loading")).toContain("Workspace is still loading");
  });
});

describe("persistLeftPartialWrite", () => {
  it("is false for a failure that never reached the roster write", () => {
    for (const step of ["extract", "compress", "upload"] as const) {
      expect(persistLeftPartialWrite(step, new Error("boom"))).toBe(false);
      expect(persistLeftPartialWrite(step, stamped("boom", "dirty"))).toBe(false);
    }
  });

  it("is false for a register failure the rollback verifiably undid", () => {
    expect(persistLeftPartialWrite("register", stamped("duplicate key", "clean"))).toBe(false);
  });

  it("is true whenever the undo is unconfirmed", () => {
    expect(persistLeftPartialWrite("register", stamped("TypeError: Failed to fetch", "dirty"))).toBe(true);
    expect(persistLeftPartialWrite("register", new Error("boom"))).toBe(true);
  });

  it("never disagrees with the message rendered beside it", () => {
    // The incident: "tell an admin rather than saving again" printed next to a
    // live Retry button, over a banner still reading "not saved yet". All three
    // now derive from the same rollback outcome.
    for (const err of [stamped("x", "clean"), stamped("x", "dirty"), new Error("x")]) {
      const message = describePersistFailure("register", err);
      expect(persistLeftPartialWrite("register", err)).toBe(message.includes("may have left rows behind"));
    }
  });
});

describe("describePersistProgress", () => {
  it("distinguishes the property index pass from the part pass", () => {
    expect(describePersistProgress({ step: "extracting", phase: "index", done: 0, total: 0 }))
      .toBe("Saving to project… indexing properties");
    expect(describePersistProgress({ step: "extracting", phase: "index", done: 1500, total: 130000 }))
      .toBe("Saving to project… indexing properties 1,500 / 130,000");
    expect(describePersistProgress({ step: "extracting", phase: "parts", done: 250, total: 26000 }))
      .toBe("Saving to project… reading pieces 250 / 26,000");
  });

  it("shows the saving stage caption", () => {
    expect(describePersistProgress({ step: "saving", stage: "uploading 8.2 MB" })).toBe("Saving to project… uploading 8.2 MB");
    expect(describePersistProgress({ step: "saving" })).toBe("Saving to project…");
  });

  it("formats megabytes", () => {
    expect(formatMb(50 * 1024 * 1024)).toBe("50 MB");
    expect(formatMb(8.24 * 1024 * 1024)).toBe("8.2 MB");
    expect(formatMb(0)).toBe("0 MB");
  });
});
