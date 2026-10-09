import { describe, it, expect } from "vitest";
import { gzipBuffer, gunzipBuffer, assertInflatedIfcSize, MAX_INFLATED_IFC_BYTES } from "../gzip";

describe("ifc gzip", () => {
  it("rejects newly persisted models that could not reopen within the inflation cap", () => {
    expect(() => assertInflatedIfcSize(MAX_INFLATED_IFC_BYTES)).not.toThrow();
    expect(() => assertInflatedIfcSize(MAX_INFLATED_IFC_BYTES + 1)).toThrow(/128 MiB/);
  });
  it("round-trips an ArrayBuffer losslessly and actually compresses", async () => {
    // Repetitive STEP-ish text stands in for an IFC payload (compresses well).
    const text = "ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(());\n".repeat(2000);
    const src = new TextEncoder().encode(text).buffer;

    const gz = await gzipBuffer(src);
    expect(gz).toBeTruthy();
    expect(gz.byteLength).toBeLessThan(src.byteLength); // smaller after gzip

    const back = await gunzipBuffer(gz);
    expect(new Uint8Array(back)).toEqual(new Uint8Array(src)); // bytes survive intact
  });

  it("rejects compressed input before inflated output exceeds the configured cap", async () => {
    const source = new Uint8Array(128 * 1024).buffer;
    const gz = await gzipBuffer(source);
    await expect(gunzipBuffer(gz, { maxBytes: 1024 })).rejects.toThrow(/decompressed.*limit/i);
    expect(await gunzipBuffer(gz, { maxBytes: source.byteLength })).toHaveProperty("byteLength", source.byteLength);
  });

  it("rejects invalid limits and respects cancellation", async () => {
    const gz = await gzipBuffer(new Uint8Array(64).buffer);
    await expect(gunzipBuffer(gz, { maxBytes: Infinity })).rejects.toThrow(/limit/i);
    const controller = new AbortController();
    controller.abort();
    await expect(gunzipBuffer(gz, { signal: controller.signal })).rejects.toHaveProperty("name", "AbortError");
  });
});
