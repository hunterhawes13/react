# aamva-mdl-verifier

A Node.js/TypeScript tool for decoding and checking AAMVA-related driver's
license / ID data. It supports **two unrelated formats** that both happen to
carry the AAMVA name:

| | **mDL** (`mdl`) | **PDF417 barcode** (`pdf417`) |
|---|---|---|
| Spec | ISO/IEC 18013-5 + AAMVA mDL Implementation Guidelines | AAMVA DL/ID Card Design Standard |
| Where it comes from | A phone, over NFC/BLE/QR (digital) | The barcode printed on the back of a physical card |
| Encoding | CBOR, COSE-signed | Plain ANSI text, pipe/line-delimited |
| Cryptographic signature | Yes — issuer-signed MSO (COSE_Sign1) | **None at all** |

The CLI auto-detects which one you gave it; you can also force it with
`--type mdl|pdf417`.

## mDL (ISO 18013-5 / CBOR)

Given an already-captured mdoc `DeviceResponse`, this tool:

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

### What it does NOT do

This is **not** a full mDL trust verifier yet:

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

## PDF417 barcode (AAMVA DL/ID Card Design Standard)

Given an **already-decoded** PDF417 payload (the text/bytes a barcode reader
handed you — this tool does not read a barcode symbol out of an image), it:

- Parses the AAMVA header (IIN, AAMVA/jurisdiction version, subfile
  designators) and each subfile's data elements (`DAQ`, `DCS`, `DBB`, `DBA`,
  driving-privilege codes, address fields, etc.), with a label table in
  `src/pdf417Elements.ts`.
- Parses `DBA`/`DBB`/etc. 8-digit dates, trying both AAMVA date encodings
  (`MMDDCCYY` used by most US jurisdictions, `CCYYMMDD` used elsewhere) and
  picking whichever produces a plausible calendar date.
- Checks the document expiration date (`DBA`) against the current time and
  derives an age-over-21 flag from date of birth (`DBB`).

### This format has no signature — full stop

**This is a fundamental property of the barcode format, not a gap in this
tool.** The AAMVA DL/ID barcode has no digest, no signature, no issuer
public key — nothing cryptographic at all. Anyone can encode arbitrary
field values into a PDF417 symbol of this format; this tool can only report
*what the barcode says*, never whether a DMV actually issued it. Every
barcode report carries this notice, and every decoded element is marked
`UNVERIFIABLE` rather than given a pass/fail digest status (contrast with
the `mdl` path, where each element gets `OK`/`MISMATCH`/etc.). If you need
actual issuer-authenticity assurance, that's what mDL (above) is for — it's
the part of the AAMVA/ISO ecosystem designed to replace this exact
weakness.

## Install & build

```sh
npm install
npm run build
```

## Usage

```sh
node dist/src/cli.js <file|-> [--format text|json] [--type mdl|pdf417|auto]
```

or, after `npm link` / installing globally, as `mdl-verify`.

- `mdl` input may be raw CBOR bytes, hex, or base64/base64url text
  (auto-detected).
- `pdf417` input is the decoded barcode text (raw bytes/UTF-8 also
  accepted) — starts with `@` and contains an `ANSI ` header marker.
- `--type` defaults to `auto`, which tries `mdl` first (the stricter
  format) and falls back to `pdf417` detection.
- Use `-` as the file argument to read from stdin.

```sh
node dist/src/cli.js mdoc-response.cbor
node dist/src/cli.js mdoc-response.b64 --format json
cat mdoc-response.b64 | node dist/src/cli.js -

node dist/src/cli.js barcode-payload.txt
node dist/src/cli.js barcode-payload.txt --type pdf417 --format json
```

**Exit codes:**
- `mdl`: `0` if all digests are `OK` and the MSO is currently valid; `1` on
  parse errors, digest mismatches, or expired/not-yet-valid. This reflects
  *structural* checks only — signatures are never verified, so `0` is not
  proof of authenticity.
- `pdf417`: `0` if it decoded successfully and (when present) the
  expiration date hasn't passed; `1` on decode failure or an expired
  document. There is no signature check to factor in — see above.
- `2`: usage error (bad flags, or the input didn't match either format).

## Library usage

```ts
import { buildReport, formatText, buildBarcodeReport, formatBarcodeText } from './src';

// mDL
const mdlReport = buildReport(fs.readFileSync('mdoc-response.cbor'));
console.log(formatText(mdlReport));

// PDF417
const barcodeReport = buildBarcodeReport(fs.readFileSync('barcode-payload.txt', 'utf8'));
console.log(formatBarcodeText(barcodeReport));
```

`mdlReport.documents[i].elements` gives you the decoded, labeled data
elements with per-element `digestStatus`; `.validity` and `.licenseExpiry`
give validity verdicts; `.trustChain` reports what's present in
`issuerAuth` (and confirms it wasn't verified).

`barcodeReport.documents[i].elements` gives labeled elements (all
`integrityStatus: 'UNVERIFIABLE'`); `.expiration` and `.ageOver21` give the
only checks this format supports.

## Testing

There's no publicly available real AAMVA test vector (mDL or barcode) to
check in, so:

- `test/makeFixture.ts` synthesizes a structurally valid mdoc
  `DeviceResponse` (with a random, non-cryptographic placeholder
  `issuerAuth` signature), plus variants with an expired MSO and a
  tampered data element.
- `test/makePdf417Fixture.ts` synthesizes an AAMVA barcode payload — no
  signature to fake here, since the format doesn't have one — plus an
  expired variant and a malformed one.

```sh
npm run build
npm run make-fixture   # writes test/fixtures/* (kept in dist/ after build)
npm test               # decodes the fixtures and asserts expected verdicts
```

## Project layout

```
src/
  types.ts                mdoc/COSE/MSO TypeScript types (mirrors the CDDL)
  cborUtils.ts             low-level CBOR helpers (tag-24 embedding, normalization)
  mdoc.ts                  DeviceResponse/Document/IssuerSigned/MSO/COSE_Sign1 decoding
  namespaces.ts            ISO + AAMVA mDL data element label tables
  digestVerification.ts    issuer digest recomputation/comparison
  validity.ts              MSO validity period + license expiry_date checks
  trustChain.ts            STUB: signature/IACA trust-chain verification
  report.ts                combines the above into a VerificationReport (mDL)
  pdf417Types.ts           AAMVA barcode TypeScript types
  pdf417Elements.ts        AAMVA barcode element ID -> label table
  pdf417.ts                AAMVA barcode header/subfile/element parser
  pdf417Report.ts          builds a BarcodeVerificationReport (expiry/age, no-signature notice)
  format.ts                text/JSON formatting for both report types
  cli.ts                   CLI entrypoint (format auto-detection)
test/
  makeFixture.ts           synthetic mdoc DeviceResponse generator
  makePdf417Fixture.ts     synthetic AAMVA barcode payload generator
  run.ts                   end-to-end smoke test for both formats
```
