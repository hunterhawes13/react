/**
 * Builds a synthetic AAMVA DL/ID Card Design Standard barcode payload (the
 * decoded text a PDF417 reader would hand back) for exercising pdf417.ts /
 * pdf417Report.ts end-to-end. There's no bundled real sample, and — unlike
 * the mdoc fixture — there's no signature to fake here at all, since this
 * format doesn't have one.
 *
 * Run: npm run make-fixture
 */
import * as fs from 'fs';
import * as path from 'path';

interface FixtureElement {
  id: string;
  value: string;
}

function mmddccyy(date: Date): string {
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const yyyy = String(date.getUTCFullYear());
  return `${mm}${dd}${yyyy}`;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

export function buildBarcodeFixture(now: Date, opts: { expired?: boolean } = {}): string {
  const issueDate = new Date(Date.UTC(now.getUTCFullYear() - 2, 0, 10));
  const expiryDate = opts.expired
    ? new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 10))
    : new Date(Date.UTC(now.getUTCFullYear() + 3, 0, 10));
  const birthDate = new Date(Date.UTC(now.getUTCFullYear() - 30, 4, 14));

  const elements: FixtureElement[] = [
    { id: 'DCS', value: 'SAMPLE' },
    { id: 'DAC', value: 'JANE' },
    { id: 'DAD', value: 'Q' },
    { id: 'DBD', value: mmddccyy(issueDate) },
    { id: 'DBB', value: mmddccyy(birthDate) },
    { id: 'DBA', value: mmddccyy(expiryDate) },
    { id: 'DBC', value: '2' },
    { id: 'DAY', value: 'BRN' },
    { id: 'DAU', value: '068 in' },
    { id: 'DAG', value: '123 MAIN ST' },
    { id: 'DAI', value: 'ANYTOWN' },
    { id: 'DAJ', value: 'WI' },
    { id: 'DAK', value: '000000000' },
    { id: 'DAQ', value: 'D1234567' },
    { id: 'DCA', value: 'D' },
    { id: 'DCB', value: 'NONE' },
    { id: 'DCD', value: 'NONE' },
    { id: 'DCF', value: '1234567890123456789012' },
    { id: 'DCG', value: 'USA' },
  ];

  const prefix = '@' + '\n' + '\x1e' + '\r';
  const marker = 'ANSI ';
  const iin = '999999'; // fictional test IIN, not a real jurisdiction
  const aamvaVersion = '08';
  const jurisdictionVersion = '00';
  const numberOfEntries = '01';
  const headerDigits = iin + aamvaVersion + jurisdictionVersion + numberOfEntries;

  const body = 'DL' + elements.map((e) => e.id + e.value + '\n').join('');

  const preOffsetLength = prefix.length + marker.length + headerDigits.length + 10; // 10 = one subfile designator
  const offset = preOffsetLength;
  const length = body.length;
  const designator = 'DL' + pad(offset, 4) + pad(length, 4);

  return prefix + marker + headerDigits + designator + body;
}

export function buildMalformedBarcodeFixture(): string {
  // Missing the "ANSI " marker entirely — should fail to parse as either format.
  return 'this is not an AAMVA barcode payload at all';
}

/**
 * Reproduces a real-world failure mode: barcode text that's been reformatted or copy-pasted
 * (blank lines, indentation, a stray space right after an element ID) so the header's declared
 * subfile offset/length no longer line up with the actual data, even though the field content
 * itself is intact. The parser is expected to fall back to locating the subfile by its marker
 * instead of trusting those numbers — see the "declared offset/length didn't match" warning in
 * pdf417.ts. Deliberately includes a field after where the (wrong) declared length would have
 * cut the subfile off, to prove the fallback doesn't truncate.
 */
export function buildReformattedBarcodeFixture(now: Date): string {
  const birthDate = new Date(Date.UTC(now.getUTCFullYear() - 25, 4, 14));
  const expiryDate = new Date(Date.UTC(now.getUTCFullYear() + 2, 0, 10));

  const marker = 'ANSI ';
  const iin = '999999';
  const aamvaVersion = '09';
  const jurisdictionVersion = '00';
  const numberOfEntries = '01';
  const headerDigits = iin + aamvaVersion + jurisdictionVersion + numberOfEntries;
  // A plausible-looking but wrong declared offset/length: correct for some real byte-level
  // encoding, not for this plain-text reconstruction — exactly the mismatch being tested.
  const designator = 'DL00310248';

  return [
    '@',
    '',
    marker + headerDigits + designator,
    '',
    '                               DLDAQ B656551288783',
    '',
    'DCSSAMPLE',
    'DACJANE',
    `DBA${mmddccyy(expiryDate)}`,
    `DBB${mmddccyy(birthDate)}`,
    'DDAF', // beyond where the wrong declared length (248) would have truncated a short fixture
  ].join('\n');
}

/**
 * Reproduces a second real-world failure mode found alongside the one above: an invalid AAMVA
 * version number ("00" — real versions start at 01) combined with a "number of entries" that
 * doesn't match the actual subfile count. Together these make the parser's cursor overshoot past
 * the real subfile body when locating it by declared offset, requiring the marker-search
 * fallback — which itself must not be fooled by "DL" occurring mid-word inside a name value
 * (here, "LYNN" via the DAD/middle-name element, i.e. "DADLYNN").
 */
export function buildCorruptedHeaderBarcodeFixture(now: Date): string {
  const birthDate = new Date(Date.UTC(now.getUTCFullYear() - 25, 4, 14));
  const expiryDate = new Date(Date.UTC(now.getUTCFullYear() + 2, 0, 10));

  const elements: FixtureElement[] = [
    { id: 'DAQ', value: 'B656551288783' },
    { id: 'DCS', value: 'SAMPLE' },
    { id: 'DAC', value: 'JANE' },
    { id: 'DAD', value: 'LYNN' }, // "DADLYNN" contains "DL" mid-word: the false-positive case
    { id: 'DBA', value: mmddccyy(expiryDate) },
    { id: 'DBB', value: mmddccyy(birthDate) },
    { id: 'DDA', value: 'F' }, // trailing field: proves the entries-count overshoot doesn't drop it
  ];

  const marker = 'ANSI ';
  const iin = '999999';
  const aamvaVersion = '00'; // invalid (real versions are 01+), as if corrupted/mistyped
  const jurisdictionVersion = '00';
  const numberOfEntries = '02'; // wrong: only one subfile designator is actually present below
  const headerDigits = iin + aamvaVersion + jurisdictionVersion + numberOfEntries;

  const body = 'DL' + elements.map((e) => `${e.id}${e.value}`).join('\n');
  const trueOffset = marker.length + headerDigits.length + 10;
  // Wrong on purpose, same as buildReformattedBarcodeFixture: correct for some real byte-level
  // encoding, not for this plain-text reconstruction.
  const declaredOffset = trueOffset + 4;
  const designator = 'DL' + pad(declaredOffset, 4) + pad(body.length, 4);

  return marker + headerDigits + designator + body;
}

function main(): void {
  const outDir = path.join(__dirname, 'fixtures');
  fs.mkdirSync(outDir, { recursive: true });

  const now = new Date();
  fs.writeFileSync(path.join(outDir, 'valid.pdf417.txt'), buildBarcodeFixture(now));
  fs.writeFileSync(path.join(outDir, 'expired.pdf417.txt'), buildBarcodeFixture(now, { expired: true }));
  fs.writeFileSync(path.join(outDir, 'malformed.pdf417.txt'), buildMalformedBarcodeFixture());
  fs.writeFileSync(path.join(outDir, 'reformatted.pdf417.txt'), buildReformattedBarcodeFixture(now));
  fs.writeFileSync(path.join(outDir, 'corrupted-header.pdf417.txt'), buildCorruptedHeaderBarcodeFixture(now));

  console.log(`Wrote PDF417 fixtures to ${outDir}`);
}

if (require.main === module) {
  main();
}
