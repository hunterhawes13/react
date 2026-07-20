/**
 * End-to-end smoke test: builds synthetic mdoc fixtures (no real mDL test
 * vectors are publicly available) and asserts the decoder/digest/validity
 * pipeline produces the expected verdicts. Run: npm run build && npm test
 */
import { decodeInputBytes } from '../src/mdoc';
import { buildReport } from '../src/report';
import { buildFixture } from './makeFixture';

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

  console.log('');
  if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log('All checks passed.');
}

main();
