const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const GLB_HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;

type JsonRecord = Record<string, unknown>;

export function ensureVrmaSpecVersion(source: ArrayBuffer): ArrayBuffer {
  const view = new DataView(source);
  if (source.byteLength < GLB_HEADER_BYTES + CHUNK_HEADER_BYTES || view.getUint32(0, true) !== GLB_MAGIC) {
    return source;
  }

  const jsonLength = view.getUint32(GLB_HEADER_BYTES, true);
  const jsonType = view.getUint32(GLB_HEADER_BYTES + 4, true);
  const jsonStart = GLB_HEADER_BYTES + CHUNK_HEADER_BYTES;
  const jsonEnd = jsonStart + jsonLength;
  if (jsonType !== JSON_CHUNK_TYPE || jsonEnd > source.byteLength) {
    return source;
  }

  const jsonText = new globalThis.TextDecoder().decode(new Uint8Array(source, jsonStart, jsonLength)).trimEnd();
  const document = JSON.parse(jsonText) as JsonRecord;
  const extensions = asRecord(document.extensions);
  const vrma = asRecord(extensions.VRMC_vrm_animation);
  if (typeof vrma.specVersion === "string" && vrma.specVersion.length > 0) {
    return source;
  }

  vrma.specVersion = "1.0";
  extensions.VRMC_vrm_animation = vrma;
  document.extensions = extensions;

  const encoded = new globalThis.TextEncoder().encode(JSON.stringify(document));
  const paddedJsonLength = Math.ceil(encoded.byteLength / 4) * 4;
  const remainingLength = source.byteLength - jsonEnd;
  const output = new ArrayBuffer(jsonStart + paddedJsonLength + remainingLength);
  const outputBytes = new Uint8Array(output);

  outputBytes.set(new Uint8Array(source, 0, GLB_HEADER_BYTES), 0);
  const outputView = new DataView(output);
  outputView.setUint32(8, output.byteLength, true);
  outputView.setUint32(GLB_HEADER_BYTES, paddedJsonLength, true);
  outputView.setUint32(GLB_HEADER_BYTES + 4, JSON_CHUNK_TYPE, true);
  outputBytes.set(encoded, jsonStart);
  outputBytes.fill(0x20, jsonStart + encoded.byteLength, jsonStart + paddedJsonLength);
  outputBytes.set(new Uint8Array(source, jsonEnd, remainingLength), jsonStart + paddedJsonLength);
  return output;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}
