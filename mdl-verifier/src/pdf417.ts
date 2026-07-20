/**
 * Parser for the AAMVA DL/ID Card Design Standard PDF417 barcode payload —
 * the plain-text, pipe/line-delimited format printed on the back of a
 * physical driver's license/ID (not the ISO 18013-5 mdoc/CBOR format; see
 * mdoc.ts for that). Operates on the barcode's *decoded* text/bytes — it
 * does not read a PDF417 symbol out of an image.
 */
import {
  AAMVA_BARCODE_DATE_ELEMENTS,
  labelForBarcodeElement,
} from './pdf417Elements';
import {
  AamvaBarcode,
  AamvaBarcodeDocument,
  AamvaBarcodeElement,
  AamvaBarcodeHeader,
  AamvaSubfileDesignator,
} from './pdf417Types';

export class Pdf417ParseError extends Error {}

const HEADER_MARKER = 'ANSI ';

/** Heuristic used by the CLI to decide whether input looks like an AAMVA barcode payload rather than mdoc CBOR. */
export function looksLikeAamvaBarcode(text: string): boolean {
  return text.includes(HEADER_MARKER) || text.trimStart().startsWith('@');
}

export function decodeBarcodeInput(input: string | Buffer | Uint8Array): string {
  if (typeof input === 'string') return input;
  return Buffer.from(input).toString('utf8');
}

export function parseAamvaBarcode(input: string | Buffer | Uint8Array): AamvaBarcode {
  const raw = decodeBarcodeInput(input);
  const warnings: string[] = [];

  const markerIndex = raw.indexOf(HEADER_MARKER);
  if (markerIndex === -1) {
    throw new Pdf417ParseError(
      `Could not find the AAMVA header marker "${HEADER_MARKER}" in the input; this doesn't look like a ` +
        'decoded AAMVA DL/ID barcode payload.'
    );
  }

  let cursor = markerIndex + HEADER_MARKER.length;
  const iin = takeDigits(raw, cursor, 6, 'Issuer Identification Number');
  cursor += 6;
  const aamvaVersionNumber = Number(takeDigits(raw, cursor, 2, 'AAMVA Version Number'));
  cursor += 2;

  let jurisdictionVersionNumber: number | undefined;
  if (aamvaVersionNumber >= 2) {
    jurisdictionVersionNumber = Number(takeDigits(raw, cursor, 2, 'Jurisdiction Version Number'));
    cursor += 2;
  }

  const numberOfEntries = Number(takeDigits(raw, cursor, 2, 'Number of Entries'));
  cursor += 2;

  const header: AamvaBarcodeHeader = {
    complianceIndicator: raw.slice(0, 1) === '@' ? '@' : '',
    issuerIdentificationNumber: iin,
    aamvaVersionNumber,
    jurisdictionVersionNumber,
    numberOfEntries,
  };

  const subfileDesignators: AamvaSubfileDesignator[] = [];
  for (let i = 0; i < numberOfEntries; i++) {
    const chunk = raw.slice(cursor, cursor + 10);
    if (chunk.length < 10) {
      warnings.push(`Subfile designator #${i + 1} is truncated; stopping designator parsing.`);
      break;
    }
    const subfileType = chunk.slice(0, 2);
    const offset = Number(chunk.slice(2, 6));
    const length = Number(chunk.slice(6, 10));
    if (!/^[A-Z]{2}$/.test(subfileType) || Number.isNaN(offset) || Number.isNaN(length)) {
      warnings.push(`Subfile designator #${i + 1} ("${chunk}") is malformed; skipping it.`);
    } else {
      subfileDesignators.push({ subfileType, offset, length });
    }
    cursor += 10;
  }

  const documents: AamvaBarcodeDocument[] = [];
  for (let i = 0; i < subfileDesignators.length; i++) {
    const designator = subfileDesignators[i];
    const nextDesignator = subfileDesignators[i + 1];
    try {
      documents.push(parseSubfile(raw, designator, cursor, nextDesignator, warnings));
    } catch (err) {
      warnings.push(`Subfile "${designator.subfileType}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { header, subfileDesignators, documents, warnings };
}

function takeDigits(raw: string, start: number, count: number, fieldName: string): string {
  const chunk = raw.slice(start, start + count);
  if (chunk.length !== count || !/^\d+$/.test(chunk)) {
    throw new Pdf417ParseError(`Expected a ${count}-digit ${fieldName} at offset ${start}, got "${chunk}".`);
  }
  return chunk;
}

function parseSubfile(
  raw: string,
  designator: AamvaSubfileDesignator,
  designatorsEnd: number,
  nextDesignator: AamvaSubfileDesignator | undefined,
  warnings: string[]
): AamvaBarcodeDocument {
  const end = designator.offset + designator.length;
  const primarySlice = raw.slice(Math.max(designator.offset, 0), Math.min(end, raw.length));

  let body: string;
  if (primarySlice.slice(0, 2) === designator.subfileType) {
    body = primarySlice.slice(2);
  } else {
    // The declared offset/length didn't land on the subfile's own marker. This happens when
    // barcode text has been reformatted or copy-pasted (extra blank lines, indentation, etc.)
    // so character offsets no longer match the original byte layout, even though the field
    // content itself is intact. Fall back to locating the marker by search instead of trusting
    // the numbers — and read to the next subfile's marker (or end of input) rather than the
    // declared length, since that's equally unreliable once offsets are off.
    const searchFrom = Math.max(designatorsEnd, 0);
    const markerIndex = raw.indexOf(designator.subfileType, searchFrom);
    const searchEnd = nextDesignator ? raw.indexOf(nextDesignator.subfileType, markerIndex + 2) : -1;

    if (markerIndex === -1) {
      warnings.push(
        `Subfile "${designator.subfileType}" data does not begin with its own subfile-type marker at its ` +
          'declared offset, and no marker could be found elsewhere; parsing the declared-offset slice anyway ' +
          '(results may be incomplete or misaligned).'
      );
      body = primarySlice;
    } else {
      warnings.push(
        `Subfile "${designator.subfileType}" declared offset/length didn't match its actual data ` +
          '(likely reformatted/copy-pasted input); located it by searching instead.'
      );
      body = raw.slice(markerIndex + 2, searchEnd !== -1 ? searchEnd : raw.length);
    }
  }

  const lines = body
    .split(/[\n\r]+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const elements: AamvaBarcodeElement[] = [];
  for (const line of lines) {
    if (line.length < 3) {
      warnings.push(`Skipping unreadably short element record "${line}" in subfile "${designator.subfileType}".`);
      continue;
    }
    const id = line.slice(0, 3);
    // A space immediately after the 3-letter ID (before any real value content) is never part
    // of genuine AAMVA data — it only shows up when barcode text has been manually reformatted.
    const rawValue = line.slice(3).replace(/^ +/, '');
    elements.push({ id, label: labelForBarcodeElement(id), rawValue, value: decodeElementValue(id, rawValue) });
  }

  return { subfileType: designator.subfileType, elements };
}

function decodeElementValue(id: string, rawValue: string): unknown {
  if (AAMVA_BARCODE_DATE_ELEMENTS.has(id)) {
    const date = parseAamvaDate(rawValue);
    if (date) return date;
  }
  return rawValue;
}

/**
 * AAMVA barcode dates are 8 digits, in either MMDDCCYY (most US
 * jurisdictions) or CCYYMMDD (Canada and some others) — the standard
 * doesn't put a machine-readable format flag in the data itself. This
 * tries MMDDCCYY first and falls back to CCYYMMDD if the result isn't a
 * plausible calendar date; for genuinely ambiguous 8-digit strings this
 * can guess wrong, so treat parsed dates as a best effort.
 */
export function parseAamvaDate(raw: string): Date | undefined {
  // Strictly speaking this isn't valid AAMVA barcode data (dates are always 8 bare digits,
  // never hyphenated) but ISO-formatted dates show up often enough in reformatted/re-typed
  // barcode dumps that it's worth accepting rather than falling back to an unparsed string.
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (isoMatch) {
    return tryDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  if (!/^\d{8}$/.test(raw)) return undefined;

  const mmddccyy = tryDate(Number(raw.slice(4, 8)), Number(raw.slice(0, 2)), Number(raw.slice(2, 4)));
  if (mmddccyy) return mmddccyy;

  return tryDate(Number(raw.slice(0, 4)), Number(raw.slice(4, 6)), Number(raw.slice(6, 8)));
}

function tryDate(year: number, month: number, day: number): Date | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2200) return undefined;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return undefined;
  }
  return date;
}
