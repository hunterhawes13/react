/**
 * End-to-end smoke test: builds synthetic mdoc fixtures (no real mDL test
 * vectors are publicly available) and asserts the decoder/digest/validity
 * pipeline produces the expected verdicts. Run: npm run build && npm test
 */
import { decodeInputBytes } from '../src/mdoc';
import { looksLikeAamvaBarcode } from '../src/pdf417';
import { buildBarcodeReport } from '../src/pdf417Report';
import { buildReport } from '../src/report';
import { buildFixture } from './makeFixture';
import {
  buildBarcodeFixture,
  buildCorruptedHeaderBarcodeFixture,
  buildMalformedBarcodeFixture,
  buildReformattedBarcodeFixture,
} from './makePdf417Fixture';

let failures = 0;

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  ok - ${name}`);
  } else {
    failures++;
    console.error(`  FAIL - ${name}${detail ? `: ${detail}` : ''}`);
  }
}

function main(): void {
  const now = new Date();

  console.log('valid fixture');
  {
    const bytes = buildFixture(now);
    const report = buildReport(bytes, now);
    check('no top-level errors', report.errors.length === 0, JSON.stringify(report.errors));
    check('one document decoded', report.documents.length === 1);
    const doc = report.documents[0];
    check('docType is mDL', doc?.docType === 'org.iso.18013.5.1.mDL');
    check('overall status PASSED', doc?.overallStatus === 'STRUCTURAL_CHECKS_PASSED');
    check('validity VALID', doc?.validity.status === 'VALID');
    check(
      'all digests OK',
      doc?.elements.every((e) => e.digestStatus === 'OK') ?? false,
      JSON.stringify(doc?.elements.filter((e) => e.digestStatus !== 'OK'))
    );
    check('16 elements decoded (13 ISO + 3 AAMVA)', doc?.elements.length === 16, String(doc?.elements.length));
    const familyName = doc?.elements.find((e) => e.elementIdentifier === 'family_name');
    check('family_name value decoded', familyName?.value === 'SAMPLE', String(familyName?.value));
    const birthDate = doc?.elements.find((e) => e.elementIdentifier === 'birth_date');
    check('birth_date decoded as Date', birthDate?.value instanceof Date);
    check(
      'trust chain explicitly reports NOT_VERIFIED',
      doc?.trustChain.status === 'NOT_VERIFIED'
    );

    // Round-trip through hex/base64 auto-detection like the CLI would.
    const viaBase64 = buildReport(Buffer.from(bytes).toString('base64'), now);
    check('base64 input parses identically', viaBase64.documents[0]?.overallStatus === 'STRUCTURAL_CHECKS_PASSED');
    const viaHex = buildReport(Buffer.from(bytes).toString('hex'), now);
    check('hex input parses identically', viaHex.documents[0]?.overallStatus === 'STRUCTURAL_CHECKS_PASSED');
    const decoded = decodeInputBytes(Buffer.from(bytes).toString('base64url'));
    check('base64url decodes to identical bytes', Buffer.compare(Buffer.from(decoded), bytes) === 0);
  }

  console.log('expired fixture');
  {
    const bytes = buildFixture(now, { expired: true });
    const report = buildReport(bytes, now);
    const doc = report.documents[0];
    check('validity EXPIRED', doc?.validity.status === 'EXPIRED');
    check('overall status FAILED', doc?.overallStatus === 'STRUCTURAL_CHECKS_FAILED');
    check('license expiry flagged expired', doc?.licenseExpiry.expired === true);
  }

  console.log('tampered fixture');
  {
    const bytes = buildFixture(now, { tamperElement: 'family_name' });
    const report = buildReport(bytes, now);
    const doc = report.documents[0];
    const familyName = doc?.elements.find((e) => e.elementIdentifier === 'family_name');
    check('tampered element digest MISMATCH', familyName?.digestStatus === 'MISMATCH');
    check('untampered elements still OK', doc?.elements.find((e) => e.elementIdentifier === 'given_name')?.digestStatus === 'OK');
    check('overall status FAILED', doc?.overallStatus === 'STRUCTURAL_CHECKS_FAILED');
  }

  console.log('malformed input');
  {
    const report = buildReport(Buffer.from('not cbor at all, just text'));
    check('reports a top-level error rather than throwing', report.errors.length > 0);
  }

  console.log('pdf417 valid fixture');
  {
    const text = buildBarcodeFixture(now);
    check('looksLikeAamvaBarcode detects it', looksLikeAamvaBarcode(text));
    const report = buildBarcodeReport(text, now);
    check('no top-level errors', report.errors.length === 0, JSON.stringify(report.errors));
    check('one document decoded', report.documents.length === 1);
    const doc = report.documents[0];
    check('overall status reflects no crypto assurance', doc?.overallStatus === 'DECODED_NO_CRYPTOGRAPHIC_ASSURANCE');
    check('19 elements decoded', doc?.elements.length === 19, String(doc?.elements.length));
    check(
      'every element flagged UNVERIFIABLE',
      doc?.elements.every((e) => e.integrityStatus === 'UNVERIFIABLE') ?? false
    );
    const familyName = doc?.elements.find((e) => e.id === 'DCS');
    check('DCS (family name) decoded', familyName?.value === 'SAMPLE', String(familyName?.value));
    check('expiration found and not expired', doc?.expiration.found === true && doc?.expiration.expired === false);
    check('birth date parsed as a Date', doc?.ageOver21.birthDate instanceof Date);
    check('age-over-21 computed true for a 30-year-old', doc?.ageOver21.over21 === true);
    check(
      'no-signature notice present in issues',
      doc?.issues.some((i) => i.includes('NO digital signature')) ?? false
    );

    // Buffer input (as the CLI would read from a file) should parse identically.
    const viaBuffer = buildBarcodeReport(Buffer.from(text, 'utf8'), now);
    check('Buffer input parses identically', viaBuffer.documents[0]?.overallStatus === 'DECODED_NO_CRYPTOGRAPHIC_ASSURANCE');
  }

  console.log('pdf417 expired fixture');
  {
    const report = buildBarcodeReport(buildBarcodeFixture(now, { expired: true }), now);
    const doc = report.documents[0];
    check('expiration found and expired', doc?.expiration.found === true && doc?.expiration.expired === true);
  }

  console.log('pdf417 reformatted/offset-mismatched input');
  {
    const text = buildReformattedBarcodeFixture(now);
    const report = buildBarcodeReport(text, now);
    check('no top-level errors', report.errors.length === 0, JSON.stringify(report.errors));
    check('one document decoded', report.documents.length === 1);
    const doc = report.documents[0];
    check('all 6 elements decoded despite bad offsets', doc?.elements.length === 6, String(doc?.elements.length));
    const daq = doc?.elements.find((e) => e.id === 'DAQ');
    check('DAQ recovered without leading-space artifact', daq?.value === 'B656551288783', String(daq?.value));
    const trailing = doc?.elements.find((e) => e.id === 'DDA');
    check(
      'field beyond the wrong declared length is not truncated away',
      trailing?.value === 'F',
      String(trailing?.value)
    );
    check(
      'a fallback warning is reported',
      report.warnings.some((w) => w.includes("didn't match")),
      JSON.stringify(report.warnings)
    );
  }

  console.log('pdf417 corrupted header (invalid version + miscounted entries + name containing "DL")');
  {
    const text = buildCorruptedHeaderBarcodeFixture(now);
    const report = buildBarcodeReport(text, now);
    check('no top-level errors', report.errors.length === 0, JSON.stringify(report.errors));
    check('one document decoded', report.documents.length === 1);
    const doc = report.documents[0];
    check('all 7 elements decoded', doc?.elements.length === 7, String(doc?.elements.length));
    const daq = doc?.elements.find((e) => e.id === 'DAQ');
    check('DAQ recovered correctly', daq?.value === 'B656551288783', String(daq?.value));
    const dad = doc?.elements.find((e) => e.id === 'DAD');
    check(
      'DAD ("LYNN", containing "DL" mid-word) is not mistaken for the subfile marker',
      dad?.value === 'LYNN',
      String(dad?.value)
    );
    const trailing = doc?.elements.find((e) => e.id === 'DDA');
    check('trailing field survives the entries-count overshoot', trailing?.value === 'F', String(trailing?.value));
    check(
      'invalid version number warning present',
      report.warnings.some((w) => w.includes('outside the range of')),
      JSON.stringify(report.warnings)
    );
    check(
      'entries-count mismatch warning present',
      report.warnings.some((w) => w.includes('subfile entr')),
      JSON.stringify(report.warnings)
    );
  }

  console.log('pdf417 malformed input');
  {
    const text = buildMalformedBarcodeFixture();
    check('looksLikeAamvaBarcode rejects it', !looksLikeAamvaBarcode(text));
    const report = buildBarcodeReport(text, now);
    check('reports a top-level error rather than throwing', report.errors.length > 0);
    check('no documents decoded', report.documents.length === 0);
  }

  console.log('');
  if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log('All checks passed.');
}

main();
