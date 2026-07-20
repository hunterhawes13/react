import { ISO_MDL_NAMESPACE } from './namespaces';
import { IssuerSignedItem, ValidityInfo } from './types';

export type ValidityStatus = 'VALID' | 'NOT_YET_VALID' | 'EXPIRED' | 'SIGNED_IN_FUTURE';

export interface ValidityCheckResult {
  status: ValidityStatus;
  now: Date;
  validityInfo: ValidityInfo;
  details: string[];
}

/** Checks the signed MSO's validityInfo (issuer-controlled) against the current time. */
export function checkValidity(validityInfo: ValidityInfo, now: Date = new Date()): ValidityCheckResult {
  const details: string[] = [];
  let status: ValidityStatus = 'VALID';

  if (validityInfo.signed.getTime() > now.getTime()) {
    status = 'SIGNED_IN_FUTURE';
    details.push(`MSO 'signed' timestamp (${validityInfo.signed.toISOString()}) is in the future.`);
  }
  if (now.getTime() < validityInfo.validFrom.getTime()) {
    status = 'NOT_YET_VALID';
    details.push(`Document is not valid until ${validityInfo.validFrom.toISOString()}.`);
  }
  if (now.getTime() > validityInfo.validUntil.getTime()) {
    status = 'EXPIRED';
    details.push(`MSO expired at ${validityInfo.validUntil.toISOString()}.`);
  }
  if (details.length === 0) {
    details.push("Signed, validFrom, and validUntil are all consistent with the current time.");
  }

  return { status, now, validityInfo, details };
}

export interface LicenseExpiryResult {
  found: boolean;
  expired?: boolean;
  expiryDate?: Date;
}

/** Checks the disclosed `expiry_date` data element (the license's own expiry, distinct from MSO validity). */
export function checkLicenseExpiry(
  nameSpaces: Record<string, IssuerSignedItem[]> | undefined,
  now: Date = new Date()
): LicenseExpiryResult {
  const items = nameSpaces?.[ISO_MDL_NAMESPACE];
  const expiryItem = items?.find((i) => i.elementIdentifier === 'expiry_date');
  if (!expiryItem) {
    return { found: false };
  }
  const expiryDate =
    expiryItem.elementValue instanceof Date ? expiryItem.elementValue : new Date(String(expiryItem.elementValue));
  return { found: true, expired: now.getTime() > expiryDate.getTime(), expiryDate };
}
