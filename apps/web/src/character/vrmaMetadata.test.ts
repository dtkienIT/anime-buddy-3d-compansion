import { describe, expect, it } from "vitest";
import { ensureVrmaSpecVersion } from "./vrmaMetadata.js";

const JSON_CHUNK_TYPE = 0x4e4f534a;

function makeGlb(document: Record<string, unknown>, tail = new Uint8Array([1, 2, 3, 4])): ArrayBuffer {
  const json = new globalThis.TextEncoder().encode(JSON.stringify(document));
  const jsonLength = Math.ceil(json.byteLength / 4) * 4;
  const buffer = new ArrayBuffer(20 + jsonLength + tail.byteLength);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, buffer.byteLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, JSON_CHUNK_TYPE, true);
  bytes.set(json, 20);
  bytes.fill(0x20, 20 + json.byteLength, 20 + jsonLength);
  bytes.set(tail, 20 + jsonLength);
  return buffer;
}

function readDocument(buffer: ArrayBuffer): Record<string, any> {
  const length = new DataView(buffer).getUint32(12, true);
  return JSON.parse(new globalThis.TextDecoder().decode(new Uint8Array(buffer, 20, length)).trimEnd());
}

describe("ensureVrmaSpecVersion", () => {
  it("adds VRMA 1.0 metadata and preserves following GLB chunks", () => {
    const source = makeGlb({ asset: { version: "2.0" }, extensions: { VRMC_vrm_animation: {} } });
    const result = ensureVrmaSpecVersion(source);
    const view = new DataView(result);
    const jsonLength = view.getUint32(12, true);

    expect(readDocument(result).extensions.VRMC_vrm_animation.specVersion).toBe("1.0");
    expect([...new Uint8Array(result, 20 + jsonLength)]).toEqual([1, 2, 3, 4]);
    expect(view.getUint32(8, true)).toBe(result.byteLength);
  });

  it("returns the original buffer when specVersion already exists", () => {
    const source = makeGlb({ extensions: { VRMC_vrm_animation: { specVersion: "1.0" } } });
    expect(ensureVrmaSpecVersion(source)).toBe(source);
  });

  it("leaves non-GLB input unchanged", () => {
    const source = new ArrayBuffer(24);
    expect(ensureVrmaSpecVersion(source)).toBe(source);
  });
});
