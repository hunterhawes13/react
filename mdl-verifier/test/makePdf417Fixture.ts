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

function main(): void {
  const outDir = path.join(__dirname, 'fixtures');
  fs.mkdirSync(outDir, { recursive: true });

  const now = new Date();
  fs.writeFileSync(path.join(outDir, 'valid.pdf417.txt'), buildBarcodeFixture(now));
  fs.writeFileSync(path.join(outDir, 'expired.pdf417.txt'), buildBarcodeFixture(now, { expired: true }));
  fs.writeFileSync(path.join(outDir, 'malformed.pdf417.txt'), buildMalformedBarcodeFixture());

  console.log(`Wrote PDF417 fixtures to ${outDir}`);
}

if (require.main === module) {
  main();
}
