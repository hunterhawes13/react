import * as cbor from 'cbor';
import { decodeCbor, isTagged, normalizeValue, unwrapEmbeddedCbor } from './cborUtils';
import {
  CoseHeader,
  CoseSign1,
  DeviceResponse,
  IssuerSigned,
  IssuerSignedItem,
  MdocDocument,
  MobileSecurityObject,
} from './types';

const COSE_SIGN1_TAG = 18;

export const DEVICE_RESPONSE_STATUS: Record<number, string> = {
  0: 'OK',
  10: 'General error',
  11: 'CBOR decoding error',
  12: 'CBOR validation error',
};

export class MdocParseError extends Error {}

/** Auto-detects raw binary / hex / base64(url) mdoc bytes from a string or buffer. */
export function decodeInputBytes(input: Buffer | string): Uint8Array {
  if (Buffer.isBuffer(input)) {
    // Looks like a text encoding (hex/base64) was read as raw bytes from a file.
    const asText = input.toString('utf8').trim();
    if (looksLikeText(asText)) {
      return decodeInputBytes(asText);
    }
    return new Uint8Array(input);
  }

  const text = input.trim();
  if (/^[0-9a-fA-F\s]+$/.test(text) && text.replace(/\s/g, '').length % 2 === 0) {
    return new Uint8Array(Buffer.from(text.replace(/\s/g, ''), 'hex'));
  }
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  if (/^[A-Za-z0-9+/=\s]+$/.test(padded)) {
    return new Uint8Array(Buffer.from(padded, 'base64'));
  }
  throw new MdocParseError('Unrecognized input encoding: expected raw CBOR bytes, hex, or base64/base64url.');
}

function looksLikeText(s: string): boolean {
  return /^[0-9a-fA-F\s]+$/.test(s) || /^[A-Za-z0-9+/_=\s-]+$/.test(s);
}

export function parseDeviceResponse(bytes: Uint8Array): DeviceResponse {
  const top = decodeCbor(bytes) as Record<string, unknown>;
  if (!top || typeof top !== 'object') {
    throw new MdocParseError('Top-level CBOR item is not a map; not a DeviceResponse.');
  }

  const documents = Array.isArray(top.documents)
    ? (top.documents as unknown[]).map(parseDocument)
    : undefined;

  return {
    version: String(top.version ?? ''),
    documents,
    documentErrors: top.documentErrors as Record<string, number>[] | undefined,
    status: Number(top.status ?? -1),
  };
}

function parseDocument(raw: unknown): MdocDocument {
  const doc = raw as Record<string, unknown>;
  if (!doc || typeof doc !== 'object' || typeof doc.docType !== 'string' || !doc.issuerSigned) {
    throw new MdocParseError('Document is missing docType or issuerSigned.');
  }
  return {
    docType: doc.docType,
    issuerSigned: parseIssuerSigned(doc.issuerSigned as Record<string, unknown>),
    deviceSigned: doc.deviceSigned as MdocDocument['deviceSigned'],
    errors: doc.errors as MdocDocument['errors'],
  };
}

function parseIssuerSigned(raw: Record<string, unknown>): IssuerSigned {
  if (!raw.issuerAuth) {
    throw new MdocParseError('issuerSigned is missing issuerAuth.');
  }

  let nameSpaces: Record<string, IssuerSignedItem[]> | undefined;
  if (raw.nameSpaces && typeof raw.nameSpaces === 'object') {
    nameSpaces = {};
    for (const [ns, items] of Object.entries(raw.nameSpaces as Record<string, unknown[]>)) {
      nameSpaces[ns] = (items as unknown[]).map(parseIssuerSignedItem);
    }
  }

  return {
    nameSpaces,
    issuerAuth: parseCoseSign1(raw.issuerAuth),
  };
}

function parseIssuerSignedItem(rawTagged: unknown): IssuerSignedItem {
  const { decoded, rawBytes } = unwrapEmbeddedCbor(rawTagged);
  const item = decoded as Record<string, unknown>;
  if (
    typeof item.digestID !== 'number' ||
    typeof item.elementIdentifier !== 'string' ||
    !('elementValue' in item)
  ) {
    throw new MdocParseError('Malformed IssuerSignedItem.');
  }
  return {
    digestID: item.digestID,
    random: new Uint8Array(item.random as Buffer),
    elementIdentifier: item.elementIdentifier,
    elementValue: normalizeValue(item.elementValue),
    rawBytes,
  };
}

function parseCoseSign1(raw: unknown): CoseSign1 {
  const arr = isTagged(raw, COSE_SIGN1_TAG) ? raw.value : raw;
  if (!Array.isArray(arr) || arr.length !== 4) {
    throw new MdocParseError('issuerAuth is not a well-formed COSE_Sign1 (expected a 4-element array).');
  }
  const [protectedBytes, unprotectedMap, payload, signature] = arr as [Buffer, Map<number, unknown>, Buffer, Buffer];

  if (payload === null) {
    throw new MdocParseError('issuerAuth has a null payload; detached payloads are not supported.');
  }

  return {
    protectedHeaderBytes: new Uint8Array(protectedBytes),
    protectedHeader: decodeCoseHeader(protectedBytes.length ? decodeCbor(protectedBytes) : {}),
    unprotectedHeader: decodeCoseHeader(unprotectedMap),
    payload: new Uint8Array(payload),
    signature: new Uint8Array(signature),
  };
}

const COSE_HEADER_LABELS: Record<number, string> = {
  1: 'alg',
  4: 'kid',
  33: 'x5chain',
};

function decodeCoseHeader(raw: unknown): CoseHeader {
  const header: CoseHeader = {};
  const entries =
    raw instanceof Map
      ? Array.from(raw.entries())
      : raw && typeof raw === 'object'
      ? Object.entries(raw as Record<string, unknown>)
      : [];

  for (const [rawKey, value] of entries) {
    const key = typeof rawKey === 'number' ? rawKey : Number(rawKey);
    const name = COSE_HEADER_LABELS[key] ?? String(rawKey);
    if (name === 'x5chain') {
      const chain = Array.isArray(value) ? value : [value];
      header.x5chain = chain.map((c) => new Uint8Array(c as Buffer));
    } else if (Buffer.isBuffer(value)) {
      header[name] = new Uint8Array(value);
    } else {
      header[name] = value;
    }
  }
  return header;
}

/** Decodes the MobileSecurityObject embedded in a COSE_Sign1's payload. */
export function parseMobileSecurityObject(issuerAuth: CoseSign1): {
  mso: MobileSecurityObject;
  rawBytes: Uint8Array;
} {
  const payloadDecoded = decodeCbor(issuerAuth.payload);
  const { decoded, rawBytes } = unwrapEmbeddedCbor(payloadDecoded);
  const mso = decoded as Record<string, unknown>;

  if (typeof mso.docType !== 'string' || !mso.validityInfo || !mso.valueDigests) {
    throw new MdocParseError('Malformed MobileSecurityObject payload.');
  }

  const validity = mso.validityInfo as Record<string, unknown>;
  const valueDigests: Record<string, Record<number, Uint8Array>> = {};
  for (const [ns, digests] of Object.entries(mso.valueDigests as Record<string, unknown>)) {
    valueDigests[ns] = {};
    const digestEntries =
      digests instanceof Map ? Array.from(digests.entries()) : Object.entries(digests as Record<string, unknown>);
    for (const [id, digest] of digestEntries) {
      valueDigests[ns][Number(id)] = new Uint8Array(digest as Buffer);
    }
  }

  return {
    mso: {
      version: String(mso.version ?? ''),
      digestAlgorithm: String(mso.digestAlgorithm ?? ''),
      valueDigests,
      deviceKeyInfo: mso.deviceKeyInfo,
      docType: mso.docType,
      validityInfo: {
        signed: toDate(validity.signed),
        validFrom: toDate(validity.validFrom),
        validUntil: toDate(validity.validUntil),
        expectedUpdate: validity.expectedUpdate ? toDate(validity.expectedUpdate) : undefined,
      },
    },
    rawBytes,
  };
}

function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string') return new Date(value);
  throw new MdocParseError('Expected a date value in validityInfo.');
}

// Re-exported so callers don't need a direct dependency on the `cbor` package.
export { cbor };
