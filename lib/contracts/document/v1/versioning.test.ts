import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, parseDocumentV1 } from "./index";
import { minimalDocumentFixture } from "./fixtures";

function expectUnsupportedVersion(input: unknown, receivedVersion: unknown) {
  const result = parseDocumentV1(input);
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.code).toBe("unsupported_version");
  if (result.code !== "unsupported_version") return;
  expect(result.supportedVersion).toBe(SCHEMA_VERSION);
  expect(result.receivedVersion).toEqual(receivedVersion);
  expect(result.message).toContain("schemaVersion");
}

describe("documentV1 version policy — exact discriminator 1", () => {
  it("accepts schemaVersion 1", () => {
    expect(parseDocumentV1(structuredClone(minimalDocumentFixture)).ok).toBe(
      true,
    );
  });

  it("rejects a future numeric version", () => {
    const doc = { ...structuredClone(minimalDocumentFixture), schemaVersion: 2 };
    expectUnsupportedVersion(doc, 2);
  });

  it("rejects a malformed string version, even \"1\"", () => {
    const doc = {
      ...structuredClone(minimalDocumentFixture),
      schemaVersion: "1",
    };
    expectUnsupportedVersion(doc, "1");
  });

  it("rejects a missing version", () => {
    const doc: Record<string, unknown> = structuredClone(
      minimalDocumentFixture,
    );
    delete doc.schemaVersion;
    expectUnsupportedVersion(doc, undefined);
  });

  it("rejects non-object inputs as unsupported-version, not a crash", () => {
    expectUnsupportedVersion(null, undefined);
    expectUnsupportedVersion(42, undefined);
    expectUnsupportedVersion("document", undefined);
    expectUnsupportedVersion([minimalDocumentFixture], undefined);
  });

  it("distinguishes version rejection from structural rejection", () => {
    const structurallyBroken = {
      ...structuredClone(minimalDocumentFixture),
      blocks: "not-an-array",
    };
    const result = parseDocumentV1(structurallyBroken);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("invalid_document");
    if (result.code !== "invalid_document") return;
    expect(result.issues.length).toBeGreaterThan(0);
  });
});
