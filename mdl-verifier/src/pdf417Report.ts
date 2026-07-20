import { parseAamvaBarcode } from './pdf417';
import { AamvaBarcode, AamvaBarcodeDocument } from './pdf417Types';

export interface BarcodeReportElement {
  id: string;
  label: string;
  value: unknown;
  /** Always UNVERIFIABLE: the AAMVA barcode format has no digest/signature mechanism to check against. */
  integrityStatus: 'UNVERIFIABLE';
}

export type BarcodeDocumentStatus = 'DECODED_NO_CRYPTOGRAPHIC_ASSURANCE';

export interface BarcodeExpirationResult {
  found: boolean;
  expired?: boolean;
  date?: Date;
}

export interface BarcodeAgeResult {
  found: boolean;
  over21?: boolean;
  birthDate?: Date;
}

export interface BarcodeDocumentReport {
  subfileType: string;
  elements: BarcodeReportElement[];
  expiration: BarcodeExpirationResult;
  ageOver21: BarcodeAgeResult;
  overallStatus: BarcodeDocumentStatus;
  issues: string[];
}

export interface BarcodeVerificationReport {
  format: 'pdf417';
  header: AamvaBarcode['header'] | undefined;
  documents: BarcodeDocumentReport[];
  warnings: string[];
  errors: string[];
}

const AGE_MAJORITY_YEARS = 21;

const NO_SIGNATURE_NOTICE =
  'PDF417 barcode data carries NO digital signature. Unlike an mDL, anyone can encode arbitrary values ' +
  'into a barcode of this format — this tool can only report what the barcode SAYS, not whether it was ' +
  'genuinely issued by a DMV. Treat this as unverified self-reported data.';

/**
 * Parses an AAMVA DL/ID barcode payload and reports its fields plus the
 * only checks that are actually meaningful for this format: expiration
 * date and a derived age-over-21 flag. There is no issuer digest or
 * signature to verify (see NO_SIGNATURE_NOTICE) — this is a fundamental
 * property of the barcode format, not a gap in this tool.
 */
export function buildBarcodeReport(
  input: string | Buffer | Uint8Array,
  now: Date = new Date()
): BarcodeVerificationReport {
  const errors: string[] = [];
  let barcode: AamvaBarcode | undefined;

  try {
    barcode = parseAamvaBarcode(input);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  const documents = (barcode?.documents ?? []).map((doc) => buildDocumentReport(doc, now));

  if (barcode && documents.length === 0) {
    errors.push(
      'No subfile documents were decoded. The header parsed, but no valid subfile designator pointed at ' +
        'readable data — check the parse warnings below for why.'
    );
  }

  return {
    format: 'pdf417',
    header: barcode?.header,
    documents,
    warnings: barcode?.warnings ?? [],
    errors,
  };
}

function buildDocumentReport(doc: AamvaBarcodeDocument, now: Date): BarcodeDocumentReport {
  const issues: string[] = [NO_SIGNATURE_NOTICE];

  const elements: BarcodeReportElement[] = doc.elements.map((el) => ({
    id: el.id,
    label: el.label,
    value: el.value,
    integrityStatus: 'UNVERIFIABLE',
  }));

  const expirationElement = doc.elements.find((e) => e.id === 'DBA');
  const expiration: BarcodeExpirationResult =
    expirationElement && expirationElement.value instanceof Date
      ? {
          found: true,
          expired: now.getTime() > expirationElement.value.getTime(),
          date: expirationElement.value,
        }
      : { found: false };
  if (expiration.found && expiration.expired) {
    issues.push(`Document Expiration Date (DBA) ${isoDate(expiration.date!)} has passed.`);
  }
  if (expirationElement && !(expirationElement.value instanceof Date)) {
    issues.push(`Document Expiration Date (DBA = "${expirationElement.rawValue}") could not be parsed as a date.`);
  }

  const birthElement = doc.elements.find((e) => e.id === 'DBB');
  const ageOver21: BarcodeAgeResult =
    birthElement && birthElement.value instanceof Date
      ? {
          found: true,
          over21: yearsSince(birthElement.value, now) >= AGE_MAJORITY_YEARS,
          birthDate: birthElement.value,
        }
      : { found: false };

  return {
    subfileType: doc.subfileType,
    elements,
    expiration,
    ageOver21,
    overallStatus: 'DECODED_NO_CRYPTOGRAPHIC_ASSURANCE',
    issues,
  };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function yearsSince(date: Date, now: Date): number {
  let years = now.getUTCFullYear() - date.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - date.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < date.getUTCDate())) {
    years--;
  }
  return years;
}
