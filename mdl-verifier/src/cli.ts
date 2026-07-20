#!/usr/bin/env node
import * as fs from 'fs';
import { formatJson, formatText } from './format';
import { buildReport } from './report';

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

  const filePath = args[0];
  if (!filePath) {
    printUsage();
    process.exit(1);
  }

  const input = filePath === '-' ? fs.readFileSync(0) : fs.readFileSync(filePath);
  const report = buildReport(input);

  process.stdout.write((format === 'json' ? formatJson(report) : formatText(report)) + '\n');

  const hasFailure = report.errors.length > 0 || report.documents.some((d) => d.overallStatus !== 'STRUCTURAL_CHECKS_PASSED');
  process.exit(hasFailure ? 1 : 0);
}

function printUsage(): void {
  console.error(`Usage: mdl-verify <file|-> [--format text|json]

Decodes and verifies an ISO 18013-5 / AAMVA mdoc DeviceResponse.
Input may be raw CBOR bytes, hex, or base64/base64url text — auto-detected.
Use '-' as the file argument to read from stdin.

Checks performed:
  - Decodes docType, disclosed data elements, and the signed MSO
  - Recomputes and compares issuer digests for every disclosed element
  - Checks MSO validity period (signed/validFrom/validUntil) and the
    disclosed license expiry_date against the current time

NOT performed (see README.md):
  - COSE_Sign1 signature verification
  - IACA issuer certificate chain / trust anchor validation
`);
}

main();
