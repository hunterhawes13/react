import { CoseSign1 } from './types';

export type TrustChainStatus = 'NOT_VERIFIED';

export interface TrustChainResult {
  status: TrustChainStatus;
  algorithm: number | string | undefined;
  certificatesPresent: number;
  message: string;
}

/**
 * Placeholder for full issuer trust verification. This does NOT verify the
 * COSE_Sign1 signature and does NOT validate the document signer
 * certificate against an IACA (state DMV) trust anchor. It only inspects
 * what's present in the COSE headers so the report can say what would need
 * checking.
 *
 * A real implementation needs to, in order:
 *
 *   1. Extract the leaf (document signer) certificate — and any
 *      intermediates — from issuerAuth.unprotectedHeader.x5chain (DER-
 *      encoded X.509, per RFC 9360 draft used by ISO 18013-5 §9.1.2.5) or
 *      look it up out-of-band by kid.
 *   2. Build the certificate chain up to an IACA root and verify it against
 *      a trust store of state-issued IACA root certificates (these are not
 *      bundled here — states/AAMVA distribute them out of band, e.g. via
 *      the AAMVA Digital Trust Service). Check each certificate's validity
 *      period, key usage/extended key usage constraints, and any
 *      AAMVA mDL certificate profile requirements.
 *   3. Recompute the COSE Sig_structure:
 *        ["Signature1", protectedHeaderBytes, <<external_aad = h''>>, payload]
 *      and verify `issuerAuth.signature` over it using the leaf
 *      certificate's public key and the algorithm named in the protected
 *      header (issuerAuth.protectedHeader.alg — typically ES256/-7).
 *   4. Only if both (2) and (3) succeed can the disclosed data (already
 *      digest-checked by digestVerification.ts) be trusted as genuinely
 *      issued and untampered.
 *
 * Wire a real implementation in by replacing this function; report.ts
 * calls it once per document and surfaces `status`/`message` verbatim.
 */
export function verifyTrustChain(issuerAuth: CoseSign1): TrustChainResult {
  const certs = issuerAuth.unprotectedHeader.x5chain ?? [];
  return {
    status: 'NOT_VERIFIED',
    algorithm: issuerAuth.protectedHeader.alg,
    certificatesPresent: certs.length,
    message:
      certs.length > 0
        ? `${certs.length} certificate(s) present in x5chain, but signature and IACA trust-chain verification are not implemented (see src/trustChain.ts).`
        : 'No x5chain certificates found in issuerAuth headers; signature and trust-chain verification are not implemented (see src/trustChain.ts).',
  };
}
