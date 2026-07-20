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
