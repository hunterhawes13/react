#!/usr/bin/env node
import * as fs from 'fs';
import { formatBarcodeJson, formatBarcodeText, formatJson, formatText } from './format';
import { decodeBarcodeInput, looksLikeAamvaBarcode } from './pdf417';
import { buildBarcodeReport } from './pdf417Report';
import { buildReport } from './report';

type InputType = 'mdl' | 'pdf417';

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    printUsage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  let format: 'text' | 'json' = 'text';
  const formatFlagIndex = args.findIndex((a) => a === '--format' || a === '-f');
  if (formatFlagIndex !== -1) {
    const value = args[formatFlagIndex + 1];
    if (value !== 'text' && value !== 'json') {
      console.error(`Invalid --format value: ${value} (expected "text" or "json")`);
      process.exit(2);
    }
    format = value;
    args.splice(formatFlagIndex, 2);
  }

  let type: InputType | 'auto' = 'auto';
  const typeFlagIndex = args.findIndex((a) => a === '--type' || a === '-t');
  if (typeFlagIndex !== -1) {
    const value = args[typeFlagIndex + 1];
    if (value !== 'mdl' && value !== 'pdf417' && value !== 'auto') {
      console.error(`Invalid --type value: ${value} (expected "mdl", "pdf417", or "auto")`);
      process.exit(2);
    }
    type = value;
    args.splice(typeFlagIndex, 2);
  }

  const filePath = args[0];
  if (!filePath) {
    printUsage();
    process.exit(1);
  }

  const input = filePath === '-' ? fs.readFileSync(0) : fs.readFileSync(filePath);

  const resolvedType = type === 'auto' ? detectType(input) : type;
  if (!resolvedType) {
    console.error(
      'Could not determine input format: this is neither a decodable mdoc DeviceResponse (CBOR/hex/base64) ' +
        'nor a recognizable AAMVA DL/ID PDF417 barcode payload. Use --type mdl|pdf417 to force one.'
    );
    process.exit(2);
  }

  if (resolvedType === 'mdl') {
    const report = buildReport(input);
    process.stdout.write((format === 'json' ? formatJson(report) : formatText(report)) + '\n');
    const hasFailure =
      report.errors.length > 0 || report.documents.some((d) => d.overallStatus !== 'STRUCTURAL_CHECKS_PASSED');
    process.exit(hasFailure ? 1 : 0);
  } else {
    const report = buildBarcodeReport(input);
    process.stdout.write((format === 'json' ? formatBarcodeJson(report) : formatBarcodeText(report)) + '\n');
    // There's no signature to pass/fail on this format, but expiration is a plain fact this format
    // does carry — treat a decode failure or an expired document as exit-worthy failures.
    const hasFailure =
      report.errors.length > 0 ||
      report.documents.length === 0 ||
      report.documents.some((d) => d.expiration.found && d.expiration.expired);
    process.exit(hasFailure ? 1 : 0);
  }
}

/** Tries the mdoc CBOR decoder first (it's the stricter format), then falls back to AAMVA barcode detection. */
function detectType(input: Buffer): InputType | undefined {
  const mdlReport = buildReport(input);
  if (mdlReport.errors.length === 0 && mdlReport.documents.length > 0) {
    return 'mdl';
  }
  if (looksLikeAamvaBarcode(decodeBarcodeInput(input))) {
    return 'pdf417';
  }
  return undefined;
}

function printUsage(): void {
  console.error(`Usage: mdl-verify <file|-> [--format text|json] [--type mdl|pdf417|auto]

Decodes and checks either of two AAMVA-related ID formats (auto-detected
by default):

  mdl      An ISO 18013-5 / AAMVA mDL mdoc DeviceResponse. Input may be
           raw CBOR bytes, hex, or base64/base64url text.
             - Recomputes and compares issuer digests for every disclosed
               element; checks MSO validity period and license expiry_date.
             - Does NOT verify the issuer's COSE_Sign1 signature or IACA
               trust chain (see README.md).

  pdf417   An already-decoded AAMVA DL/ID Card Design Standard barcode
           payload (the PDF417 symbol on the back of a physical card) —
           plain ANSI text, not CBOR. Decodes its data elements and checks
           the document expiration date.
             - This format has NO digital signature at all: it cannot be
               cryptographically verified, only decoded and reported.

Use '-' as the file argument to read from stdin.
`);
}

main();
