import * as cbor from 'cbor';

/** Decode the first (and expected only) CBOR data item in a buffer. */
export function decodeCbor(bytes: Uint8Array): unknown {
  return cbor.decodeFirstSync(Buffer.from(bytes));
}

export function encodeCbor(value: unknown): Uint8Array {
  return cbor.encode(value);
}

/**
 * ISO 18013-5 wraps several structures as `#6.24(bstr .cbor X)` — a CBOR tag
 * 24 whose content is a byte string holding the CBOR encoding of X. This is
 * done so the *original bytes* of X survive intact for digesting/signing
 * even though the outer structure gets re-encoded. Returns both the decoded
 * value and the raw bytes that were digested/signed.
 */
export function unwrapEmbeddedCbor(value: unknown): { decoded: unknown; rawBytes: Uint8Array } {
  let innerBytes: Uint8Array;
  if (value instanceof cbor.Tagged && value.tag === 24) {
    innerBytes = value.value as Uint8Array;
  } else if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    // Some encoders/tools omit the tag 24 wrapper and just hand over the
    // raw embedded-CBOR bytes directly. Accept that too.
    innerBytes = value as Uint8Array;
  } else {
    throw new Error('Expected a tag-24 (embedded CBOR) value, got: ' + describe(value));
  }

  const decoded = decodeCbor(innerBytes);
  // Per ISO 18013-5, digests (and the COSE Sig_structure for issuerAuth's
  // payload) are computed over the *entire* tag-24 encoding —
  // `#6.24(bstr .cbor X)` as transmitted — not just the inner CBOR bytes of
  // X. node-cbor encodes tags/byte-strings with definite lengths, so
  // re-encoding the tag reproduces the original wire bytes.
  const rawBytes = new Uint8Array(cbor.encode(new cbor.Tagged(24, Buffer.from(innerBytes))));
  return { decoded, rawBytes };
}

/** Unwrap an optional COSE tag (e.g. #6.18 for COSE_Sign1) if present. */
export function unwrapCoseTag(value: unknown, expectedTag: number): unknown {
  if (value instanceof cbor.Tagged) {
    if (value.tag !== expectedTag) {
      throw new Error(`Expected COSE tag ${expectedTag}, got tag ${value.tag}`);
    }
    return value.value;
  }
  return value;
}

export function isTagged(value: unknown, tag: number): value is cbor.Tagged {
  return value instanceof cbor.Tagged && value.tag === tag;
}

/**
 * Recursively converts CBOR-decoded values into plain, report-friendly JS
 * values: Buffers -> Uint8Array, tag 0 (tdate) is already a Date via the
 * cbor library, tag 1004 (full-date, RFC 8943) -> Date, tag 24 left alone
 * (callers unwrap those explicitly where expected), Maps -> plain objects.
 */
export function normalizeValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value;
  }
  if (value instanceof cbor.Tagged) {
    if (value.tag === 1004 && typeof value.value === 'string') {
      return new Date(value.value + 'T00:00:00Z');
    }
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return new Uint8Array(value);
  }
  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }
  if (value instanceof Map) {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of value) obj[String(k)] = normalizeValue(v);
    return obj;
  }
  if (value && typeof value === 'object') {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      obj[k] = normalizeValue(v);
    }
    return obj;
  }
  return value;
}

function describe(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  return (value as { constructor?: { name?: string } }).constructor?.name ?? typeof value;
}
