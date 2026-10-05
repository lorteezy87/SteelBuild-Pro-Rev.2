// @vitest-environment jsdom
/// <reference lib="dom" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const manifestPaths = [
  "ios/App/App/PrivacyInfo.xcprivacy",
  "mobile/ios/PrivacyInfo.xcprivacy",
];

function valueFor(dictionary: Element, key: string): Element | null {
  return Array.from(dictionary.children)
    .find((element) => element.tagName === "key" && element.textContent === key)
    ?.nextElementSibling ?? null;
}

function readManifest(path: string): Document {
  const source = readFileSync(resolve(process.cwd(), path), "utf8");
  const document = new DOMParser().parseFromString(source, "application/xml");
  expect(document.querySelector("parsererror"), `${path} must be valid XML`).toBeNull();
  return document;
}

describe.each(manifestPaths)("iOS privacy declarations in %s", (path) => {
  it.each([
    "NSPrivacyCollectedDataTypePhoneNumber",
    "NSPrivacyCollectedDataTypeProductInteraction",
    "NSPrivacyCollectedDataTypeEmailsOrTextMessages",
  ])("declares collected %s as linked and non-tracking", (type) => {
    const root = readManifest(path).querySelector("plist > dict")!;
    const collected = valueFor(root, "NSPrivacyCollectedDataTypes")!;
    expect(collected.tagName).toBe("array");
    const declaration = Array.from(collected.children).find((dictionary) =>
      valueFor(dictionary, "NSPrivacyCollectedDataType")?.textContent === type,
    );
    expect(declaration, `${path} must disclose ${type}`).toBeDefined();
    expect(valueFor(declaration!, "NSPrivacyCollectedDataTypeLinked")?.tagName).toBe("true");
    expect(valueFor(declaration!, "NSPrivacyCollectedDataTypeTracking")?.tagName).toBe("false");
    const purposes = valueFor(declaration!, "NSPrivacyCollectedDataTypePurposes");
    expect(purposes?.tagName).toBe("array");
    expect(Array.from(purposes!.children).map((element) => element.textContent))
      .toContain("NSPrivacyCollectedDataTypePurposeAppFunctionality");
  });
});

describe("iOS privacy manifest template", () => {
  it("keeps the platform template aligned with the manifest shipped in the app", () => {
    const sources = manifestPaths.map((path) => readFileSync(resolve(process.cwd(), path), "utf8"));
    expect(sources[1]).toBe(sources[0]);
  });
});
