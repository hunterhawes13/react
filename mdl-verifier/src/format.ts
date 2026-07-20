import { BarcodeVerificationReport } from './pdf417Report';
import { VerificationReport } from './report';

export function formatText(report: VerificationReport): string {
  const lines: string[] = [];
  lines.push('AAMVA / ISO 18013-5 mDL Verification Report');
  lines.push('='.repeat(60));
  lines.push(`mdoc version:    ${report.version || '(unknown)'}`);
  lines.push(`Response status: ${report.responseStatus.code} (${report.responseStatus.meaning})`);

  if (report.errors.length) {
    lines.push('');
    lines.push('ERRORS:');
    for (const e of report.errors) lines.push(`  - ${e}`);
  }

  for (const doc of report.documents) {
    lines.push('');
    lines.push(`Document: ${doc.docType}`);
    lines.push('-'.repeat(60));
    lines.push(`Overall structural status: ${doc.overallStatus}`);
    lines.push(
      `Validity:  ${doc.validity.status}  ` +
        `(validFrom ${isoDate(doc.validity.validityInfo.validFrom)} -> validUntil ${isoDate(
          doc.validity.validityInfo.validUntil
        )})`
    );
    if (doc.licenseExpiry.found) {
      lines.push(
        `Expiry:    expiry_date ${isoDate(doc.licenseExpiry.expiryDate!)} (${
          doc.licenseExpiry.expired ? 'EXPIRED' : 'not expired'
        })`
      );
    }
    lines.push(`Signature: NOT CRYPTOGRAPHICALLY VERIFIED — ${doc.trustChain.message}`);
    lines.push('');
    lines.push('Disclosed data elements:');
    for (const el of doc.elements) {
      lines.push(`  [${el.digestStatus.padEnd(16)}] ${el.namespace}/${el.label}: ${formatValue(el.value)}`);
    }

    if (doc.issues.length) {
      lines.push('');
      lines.push('Issues:');
      for (const i of doc.issues) lines.push(`  - ${i}`);
    }
  }

  return lines.join('\n');
}

export function formatJson(report: VerificationReport): string {
  return JSON.stringify(report, jsonReplacer, 2);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatValue(value: unknown): string {
  if (value instanceof Date) return isoDate(value);
  if (value instanceof Uint8Array) return `<${value.length} bytes>`;
  if (Array.isArray(value) || (value && typeof value === 'object')) {
    return JSON.stringify(value, jsonReplacer);
  }
  return String(value);
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Uint8Array) return `<${value.length} bytes>`;
  if (value instanceof Date) return value.toISOString();
  return value;
}

export function formatBarcodeText(report: BarcodeVerificationReport): string {
  const lines: string[] = [];
  lines.push('AAMVA DL/ID PDF417 Barcode Report');
  lines.push('='.repeat(60));
  if (report.header) {
    lines.push(
      `Header: IIN ${report.header.issuerIdentificationNumber}, AAMVA version ${report.header.aamvaVersionNumber}` +
        (report.header.jurisdictionVersionNumber !== undefined
          ? `, jurisdiction version ${report.header.jurisdictionVersionNumber}`
          : '') +
        `, ${report.header.numberOfEntries} subfile(s)`
    );
  }
  lines.push('NOTE: This format has no digital signature — see the notice under each document below.');

  if (report.errors.length) {
    lines.push('');
    lines.push('ERRORS:');
    for (const e of report.errors) lines.push(`  - ${e}`);
  }
  if (report.warnings.length) {
    lines.push('');
    lines.push('Parse warnings:');
    for (const w of report.warnings) lines.push(`  - ${w}`);
  }

  for (const doc of report.documents) {
    lines.push('');
    lines.push(`Document (subfile "${doc.subfileType}")`);
    lines.push('-'.repeat(60));
    lines.push(`Overall status: ${doc.overallStatus}`);
    if (doc.expiration.found) {
      lines.push(`Expiration:  ${isoDate(doc.expiration.date!)} (${doc.expiration.expired ? 'EXPIRED' : 'not expired'})`);
    }
    if (doc.ageOver21.found) {
      lines.push(`Age over 21: ${doc.ageOver21.over21 ? 'yes' : 'no'} (birth date ${isoDate(doc.ageOver21.birthDate!)})`);
    }
    lines.push('');
    lines.push('Decoded data elements:');
    for (const el of doc.elements) {
      lines.push(`  [${el.integrityStatus.padEnd(13)}] ${el.id} ${el.label}: ${formatValue(el.value)}`);
    }
    if (doc.issues.length) {
      lines.push('');
      lines.push('Issues:');
      for (const i of doc.issues) lines.push(`  - ${i}`);
    }
  }

  return lines.join('\n');
}

export function formatBarcodeJson(report: BarcodeVerificationReport): string {
  return JSON.stringify(report, jsonReplacer, 2);
}
