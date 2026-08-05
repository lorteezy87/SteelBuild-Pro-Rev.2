import { describe, it, expect } from "vitest";
import { gzipBuffer, gunzipBuffer } from "../gzip";

describe("ifc gzip", () => {
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
});
