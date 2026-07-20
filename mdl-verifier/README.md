# aamva-mdl-verifier

A Node.js/TypeScript tool for decoding and structurally verifying AAMVA
mobile driver's license (mDL) data, per ISO/IEC 18013-5 and the AAMVA mDL
Implementation Guidelines.

## What this tool does

Given an already-captured mdoc `DeviceResponse` (the CBOR structure a
holder's device presents during an mDL transaction), this tool:

- Decodes the mdoc structure: documents, disclosed data elements (both the
  base ISO `org.iso.18013.5.1` namespace and the `org.iso.18013.5.1.aamva`
  namespace), and the signed Mobile Security Object (MSO).
- **Recomputes and checks issuer digests.** Every disclosed data element
  (`IssuerSignedItem`) is hashed and compared against the digest the issuer
  committed to in the MSO. A mismatch means the value was altered or
  substituted after issuance.
- **Checks validity periods.** Compares the MSO's `signed` / `validFrom` /
  `validUntil` timestamps, and the disclosed `expiry_date` element, against
  the current time.
- Reports what it finds as human-readable text or JSON, with a per-element
  digest status and an overall pass/fail verdict.

## What this tool does NOT do

This is **not** a full mDL trust verifier yet. In particular:

- **No transport/session layer.** It doesn't do BLE/NFC device engagement,
  QR engagement, or session encryption — it operates on a `DeviceResponse`
  you already have in hand (e.g. captured by a separate reader).
- **No cryptographic signature verification.** `issuerAuth` (the COSE_Sign1
  wrapping the MSO) is parsed structurally — algorithm, key id, and any
  `x5chain` certificates are reported — but the signature itself is never
  checked.
- **No IACA trust-chain validation.** There's no verification that the
  document signer certificate chains up to a trusted state (IACA) root.
  IACA roots are distributed out-of-band per state/AAMVA and aren't bundled
  here.

Passing digest and validity checks means the disclosed data is internally
consistent with what's in the MSO and hasn't been tampered with in transit
— **it does not prove the MSO itself was issued by a legitimate authority.**
That's what the (currently stubbed) signature/trust-chain step is for. The
CLI's "Signature: NOT CRYPTOGRAPHICALLY VERIFIED" line and each document's
`issues` list call this out explicitly so it can't be missed in a report.

See `src/trustChain.ts` for a documented extension point and the concrete
steps (x5chain extraction → IACA chain build/verify → COSE Sig_structure
signature verification) needed to close this gap.

## Install & build

```sh
npm install
npm run build
```

## Usage

```sh
node dist/src/cli.js <file|-> [--format text|json]
```

or, after `npm link` / installing globally, as `mdl-verify`.

Input may be a file containing raw CBOR bytes, hex, or base64/base64url
text (auto-detected). Use `-` to read from stdin.

```sh
node dist/src/cli.js mdoc-response.cbor
node dist/src/cli.js mdoc-response.b64 --format json
cat mdoc-response.b64 | node dist/src/cli.js -
```

Exit code is `0` if the document decoded with all digests OK and MSO
validity currently valid; `1` otherwise (parse errors, digest mismatches,
or expired/not-yet-valid). This reflects the *structural* checks only —
remember signatures are never verified, so a `0` exit is not proof of
authenticity.

## Library usage

```ts
import { buildReport, formatText } from './src';

const report = buildReport(fs.readFileSync('mdoc-response.cbor'));
console.log(formatText(report));
```

`report.documents[i].elements` gives you the decoded, labeled data elements
with per-element `digestStatus`; `report.documents[i].validity` and
`.licenseExpiry` give validity verdicts; `.trustChain` reports what's
present in `issuerAuth` (and confirms it wasn't verified).

## Testing

There's no publicly available real AAMVA mDL test vector to check in, so
`test/makeFixture.ts` synthesizes a structurally valid mdoc `DeviceResponse`
(with a random, non-cryptographic placeholder `issuerAuth` signature) to
exercise the decoder end-to-end, plus variants with an expired MSO and a
tampered data element.

```sh
npm run build
npm run make-fixture   # writes test/fixtures/*.cbor (kept in dist/ after build)
npm test               # decodes the fixtures and asserts expected verdicts
```

## Project layout

```
src/
  types.ts              mdoc/COSE/MSO TypeScript types (mirrors the CDDL)
  cborUtils.ts           low-level CBOR helpers (tag-24 embedding, normalization)
  mdoc.ts                DeviceResponse/Document/IssuerSigned/MSO/COSE_Sign1 decoding
  namespaces.ts           ISO + AAMVA data element label tables
  digestVerification.ts  issuer digest recomputation/comparison
  validity.ts             MSO validity period + license expiry_date checks
  trustChain.ts           STUB: signature/IACA trust-chain verification
  report.ts               combines the above into a VerificationReport
  format.ts               text/JSON report formatting
  cli.ts                  CLI entrypoint
test/
  makeFixture.ts          synthetic mdoc DeviceResponse generator
  run.ts                  end-to-end smoke test
```
