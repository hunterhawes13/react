/**
 * Types for the AAMVA DL/ID Card Design Standard barcode format — the
 * PDF417 symbol printed on the back of a physical driver's license/ID.
 *
 * This is a DIFFERENT specification from ISO/IEC 18013-5 (mDL, see
 * mdoc.ts/types.ts): it's plain ANSI text, pipe/line-delimited, with no
 * cryptographic signature of any kind. Field names below follow the AAMVA
 * standard's own terminology (Compliance Indicator, IIN, Subfile, Element
 * ID) so they can be cross-referenced against it.
 */

export interface AamvaBarcodeHeader {
  complianceIndicator: string;
  /** Issuer Identification Number — 6 digits identifying the issuing jurisdiction. */
  issuerIdentificationNumber: string;
  aamvaVersionNumber: number;
  jurisdictionVersionNumber?: number;
  numberOfEntries: number;
}

export interface AamvaSubfileDesignator {
  subfileType: string;
  /** Byte offset from the start of the whole barcode payload. */
  offset: number;
  length: number;
}

export interface AamvaBarcodeElement {
  id: string;
  label: string;
  rawValue: string;
  /** Best-effort typed value (Date for recognized date fields), otherwise the raw trimmed string. */
  value: unknown;
}

export interface AamvaBarcodeDocument {
  subfileType: string;
  elements: AamvaBarcodeElement[];
}

export interface AamvaBarcode {
  header: AamvaBarcodeHeader;
  subfileDesignators: AamvaSubfileDesignator[];
  documents: AamvaBarcodeDocument[];
  /** Non-fatal structural anomalies found while parsing (offset/length mismatches, unknown subfile types, etc.). */
  warnings: string[];
}
