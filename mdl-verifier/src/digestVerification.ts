import * as crypto from 'crypto';
import { IssuerSignedItem, MobileSecurityObject } from './types';

export type DigestStatus = 'OK' | 'MISMATCH' | 'NO_DIGEST_IN_MSO' | 'UNSUPPORTED_ALGORITHM';

export interface ElementDigestResult {
  namespace: string;
  elementIdentifier: string;
  digestID: number;
  status: DigestStatus;
}

const NODE_HASH_ALGORITHM: Record<string, string> = {
  'SHA-256': 'sha256',
  'SHA-384': 'sha384',
  'SHA-512': 'sha512',
};

/**
 * Recomputes the digest of each disclosed IssuerSignedItem (over its
 * original tag-24 encoded bytes) and compares it against the digest the
 * issuer committed to in the signed MobileSecurityObject. A mismatch means
 * the disclosed value was altered (or substituted) after issuance, or does
 * not correspond to any digest the issuer actually signed.
 *
 * This does NOT establish that the MSO itself is authentic — that requires
 * verifying the issuer's COSE signature (see trustChain.ts).
 */
export function verifyDigests(
  nameSpaces: Record<string, IssuerSignedItem[]>,
  mso: MobileSecurityObject
): ElementDigestResult[] {
  const nodeAlgorithm = NODE_HASH_ALGORITHM[mso.digestAlgorithm];
  const results: ElementDigestResult[] = [];

  for (const [namespace, items] of Object.entries(nameSpaces)) {
    const namespaceDigests = mso.valueDigests[namespace];
    for (const item of items) {
      if (!nodeAlgorithm) {
        results.push({
          namespace,
          elementIdentifier: item.elementIdentifier,
          digestID: item.digestID,
          status: 'UNSUPPORTED_ALGORITHM',
        });
        continue;
      }

      const expected = namespaceDigests?.[item.digestID];
      if (!expected) {
        results.push({
          namespace,
          elementIdentifier: item.elementIdentifier,
          digestID: item.digestID,
          status: 'NO_DIGEST_IN_MSO',
        });
        continue;
      }

      const actual = crypto.createHash(nodeAlgorithm).update(Buffer.from(item.rawBytes)).digest();
      const expectedBuf = Buffer.from(expected);
      const matches = actual.length === expectedBuf.length && crypto.timingSafeEqual(actual, expectedBuf);

      results.push({
        namespace,
        elementIdentifier: item.elementIdentifier,
        digestID: item.digestID,
        status: matches ? 'OK' : 'MISMATCH',
      });
    }
  }

  return results;
}
