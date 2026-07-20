/**
 * Type definitions for the ISO/IEC 18013-5 mdoc data model, as used by the
 * AAMVA mDL Implementation Guidelines. Field names follow the CDDL in the
 * spec so they can be cross-referenced directly.
 */

export interface DeviceResponse {
  version: string;
  documents?: MdocDocument[];
  documentErrors?: Record<string, number>[];
  status: number;
}

export interface MdocDocument {
  docType: string;
  issuerSigned: IssuerSigned;
  deviceSigned?: DeviceSigned;
  errors?: Record<string, Record<string, number>>;
}

export interface IssuerSigned {
  nameSpaces?: Record<string, IssuerSignedItem[]>;
  issuerAuth: CoseSign1;
}

/** A single disclosed data element, after unwrapping its tag-24 envelope. */
export interface IssuerSignedItem {
  digestID: number;
  random: Uint8Array;
  elementIdentifier: string;
  elementValue: unknown;
  /** Raw re-encoded bytes of this item, as transmitted (used for digest verification). */
  rawBytes: Uint8Array;
}

export interface DeviceSigned {
  nameSpaces: unknown;
  deviceAuth: unknown;
}

/** Structural (not cryptographically verified) view of a COSE_Sign1 value. */
export interface CoseSign1 {
  protectedHeaderBytes: Uint8Array;
  protectedHeader: CoseHeader;
  unprotectedHeader: CoseHeader;
  payload: Uint8Array;
  signature: Uint8Array;
}

export interface CoseHeader {
  alg?: number | string;
  x5chain?: Uint8Array[];
  kid?: Uint8Array;
  [key: string]: unknown;
}

export interface MobileSecurityObject {
  version: string;
  digestAlgorithm: 'SHA-256' | 'SHA-384' | 'SHA-512' | string;
  valueDigests: Record<string, Record<number, Uint8Array>>;
  deviceKeyInfo: unknown;
  docType: string;
  validityInfo: ValidityInfo;
}

export interface ValidityInfo {
  signed: Date;
  validFrom: Date;
  validUntil: Date;
  expectedUpdate?: Date;
}
