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

// The literal marker is "ANSI " (with a trailing space), but that trailing space is exactly the
// kind of byte that gets silently eaten by copy/paste, terminal word-wrap, or manual retyping —
// it's cosmetic, not data. Accept any single whitespace character after "ANSI" instead of
// requiring the literal space.
const HEADER_MARKER_RE = /ANSI\s/;

/** Heuristic used by the CLI to decide whether input looks like an AAMVA barcode payload rather than mdoc CBOR. */
export function looksLikeAamvaBarcode(text: string): boolean {
  return HEADER_MARKER_RE.test(text) || text.trimStart().startsWith('@');
}

export function decodeBarcodeInput(input: string | Buffer | Uint8Array): string {
  if (typeof input === 'string') return input;
  return Buffer.from(input).toString('utf8');
}

export function parseAamvaBarcode(input: string | Buffer | Uint8Array): AamvaBarcode {
  const raw = decodeBarcodeInput(input);
  const warnings: string[] = [];

  const markerMatch = HEADER_MARKER_RE.exec(raw);
  if (!markerMatch) {
    throw new Pdf417ParseError(
      'Could not find the AAMVA header marker "ANSI" in the input; this doesn\'t look like a decoded ' +
        'AAMVA DL/ID barcode payload.'
    );
  }

  let cursor = markerMatch.index + markerMatch[0].length;
  // Floor for the marker-search fallback in parseSubfile: the header itself is pure digits (no
  // letters), so it's always safe to search for a subfile marker starting here — unlike using
  // the cursor position *after* designator parsing, which can overshoot past the real body when
  // a corrupted "number of entries" causes bogus designator bytes to be consumed.
  const headerDigitsStart = cursor;
  const iin = takeDigits(raw, cursor, 6, 'Issuer Identification Number');
  cursor += 6;
  const aamvaVersionNumber = Number(takeDigits(raw, cursor, 2, 'AAMVA Version Number'));
  cursor += 2;

  // Per spec, only the very first AAMVA version ("01") omits the jurisdiction version field;
  // every other version includes it. Versions are only ever 01+, so an out-of-range value here
  // (0, or implausibly large) is itself a sign the data is corrupted — but since the overwhelming
  // majority of real-world barcodes are version >=2 with the field present, that's the safer
  // structural assumption to fall back on rather than treating an invalid version as "no field."
  let jurisdictionVersionNumber: number | undefined;
  if (aamvaVersionNumber !== 1) {
    jurisdictionVersionNumber = Number(takeDigits(raw, cursor, 2, 'Jurisdiction Version Number'));
    cursor += 2;
  }
  if (aamvaVersionNumber < 1 || aamvaVersionNumber > 20) {
    warnings.push(
      `AAMVA Version Number "${String(aamvaVersionNumber).padStart(2, '0')}" is outside the range of ` +
        'versions AAMVA has ever issued (01-1x); the header is likely corrupted or altered.'
    );
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

  if (subfileDesignators.length !== numberOfEntries) {
    warnings.push(
      `Header declares ${numberOfEntries} subfile entr${numberOfEntries === 1 ? 'y' : 'ies'}, but only ` +
        `${subfileDesignators.length} valid subfile designator(s) were found. This is an internally ` +
        'inconsistent header — either the data is corrupted/altered, or (more likely for hand-transcribed ' +
        'input) a digit in "number of entries" was mistyped.'
    );
  }

  const documents: AamvaBarcodeDocument[] = [];
  for (let i = 0; i < subfileDesignators.length; i++) {
    const designator = subfileDesignators[i];
    const nextDesignator = subfileDesignators[i + 1];
    try {
      documents.push(parseSubfile(raw, designator, headerDigitsStart, nextDesignator, warnings));
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

/**
 * Finds the next genuine occurrence of `subfileType` (e.g. "DL") at or after `searchFrom`. A
 * plain substring search is not safe here: a two-letter subfile type can easily occur mid-word
 * inside an unrelated field value (e.g. "DL" inside the name "LYNN" in "DADLYNN"). But requiring
 * it to be preceded by a newline is *too* strict — in properly encoded (non-reformatted) data the
 * marker sits directly adjacent to the designator's own digits with no separator at all (e.g.
 * "...00310248DLDAQ..."). The distinguishing signal is what's immediately before the candidate:
 * a genuine marker is preceded by a digit, whitespace/newline, or start-of-string — never by
 * another letter, which is what happens mid-word. Combined with requiring an uppercase letter
 * right after (the start of a genuine 3-letter element ID), that rules out false positives like
 * "DADLYNN" while still matching both adjacent and reformatted/indented real occurrences.
 */
function findSubfileMarker(raw: string, subfileType: string, searchFrom: number): number {
  const escaped = subfileType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?<![A-Za-z])(${escaped})(?=[A-Z])`, 'g');
  re.lastIndex = Math.max(searchFrom, 0);
  const match = re.exec(raw);
  return match ? match.index : -1;
}

function parseSubfile(
  raw: string,
  designator: AamvaSubfileDesignator,
  searchFloor: number,
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
    const searchFrom = Math.max(searchFloor, 0);
    const markerIndex = findSubfileMarker(raw, designator.subfileType, searchFrom);
    const searchEnd =
      nextDesignator && markerIndex !== -1
        ? findSubfileMarker(raw, nextDesignator.subfileType, markerIndex + 2)
        : -1;

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
