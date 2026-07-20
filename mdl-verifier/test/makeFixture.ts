/**
 * Builds a structurally valid, self-signed-placeholder mdoc DeviceResponse
 * for exercising the decoder/digest/validity logic end-to-end. There is no
 * publicly available real AAMVA mDL test vector to use here, and the
 * issuerAuth signature is NOT a real signature (this tool doesn't verify
 * signatures — see src/trustChain.ts) — it's random bytes, standing in for
 * whatever a real issuer would have produced.
 *
 * Run: npm run make-fixture
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as cbor from 'cbor';
import { AAMVA_NAMESPACE, ISO_MDL_NAMESPACE } from '../src/namespaces';

const DIGEST_ALGORITHM = 'SHA-256';

interface RawElement {
  elementIdentifier: string;
  elementValue: unknown;
}

function encodeIssuerSignedItem(digestID: number, el: RawElement): { tagged: cbor.Tagged; rawBytes: Buffer } {
  const item = {
    digestID,
    random: crypto.randomBytes(16),
    elementIdentifier: el.elementIdentifier,
    elementValue: el.elementValue,
  };
  const innerBytes = cbor.encode(item);
  const tagged = new cbor.Tagged(24, innerBytes);
  const rawBytes = cbor.encode(tagged); // full tag-24 wire encoding, used for the digest
  return { tagged, rawBytes };
}

function buildNamespace(elements: RawElement[], startDigestId: number) {
  const items: cbor.Tagged[] = [];
  const digests: Map<number, Buffer> = new Map();

  elements.forEach((el, i) => {
    const digestID = startDigestId + i;
    const { tagged, rawBytes } = encodeIssuerSignedItem(digestID, el);
    items.push(tagged);
    digests.set(digestID, crypto.createHash('sha256').update(rawBytes).digest());
  });

  return { items, digests };
}

function fullDate(value: string): cbor.Tagged {
  return new cbor.Tagged(1004, value);
}

export function buildFixture(now: Date, opts: { expired?: boolean; tamperElement?: string } = {}): Buffer {
  const validFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const validUntil = opts.expired
    ? new Date(now.getTime() - 24 * 60 * 60 * 1000)
    : new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  const isoElements: RawElement[] = [
    { elementIdentifier: 'family_name', elementValue: 'SAMPLE' },
    { elementIdentifier: 'given_name', elementValue: 'JANE' },
    { elementIdentifier: 'birth_date', elementValue: fullDate('1990-05-14') },
    { elementIdentifier: 'issue_date', elementValue: fullDate('2023-01-10') },
    { elementIdentifier: 'expiry_date', elementValue: fullDate(opts.expired ? '2024-01-10' : '2028-01-10') },
    { elementIdentifier: 'issuing_country', elementValue: 'US' },
    { elementIdentifier: 'issuing_authority', elementValue: 'Sample State DMV' },
    { elementIdentifier: 'document_number', elementValue: 'D1234567' },
    { elementIdentifier: 'sex', elementValue: 2 },
    { elementIdentifier: 'height', elementValue: 168 },
    { elementIdentifier: 'eye_colour', elementValue: 'brn' },
    {
      elementIdentifier: 'driving_privileges',
      elementValue: [{ vehicle_category_code: 'D', issue_date: fullDate('2023-01-10'), expiry_date: fullDate('2028-01-10') }],
    },
    { elementIdentifier: 'portrait', elementValue: crypto.randomBytes(256) },
  ];

  const aamvaElements: RawElement[] = [
    { elementIdentifier: 'DHS_compliance', elementValue: 'F' },
    { elementIdentifier: 'EDL_credential', elementValue: false },
    { elementIdentifier: 'sex', elementValue: 2 },
  ];

  const isoNs = buildNamespace(isoElements, 0);
  const aamvaNs = buildNamespace(aamvaElements, 100);

  if (opts.tamperElement) {
    // Simulate a disclosed value that was altered after issuance: swap in a
    // different value than what the issuer actually digested/signed.
    const idx = isoElements.findIndex((e) => e.elementIdentifier === opts.tamperElement);
    if (idx >= 0) {
      const { tagged } = encodeIssuerSignedItem(idx, { elementIdentifier: isoElements[idx].elementIdentifier, elementValue: 'TAMPERED' });
      isoNs.items[idx] = tagged;
    }
  }

  const valueDigests = {
    [ISO_MDL_NAMESPACE]: isoNs.digests,
    [AAMVA_NAMESPACE]: aamvaNs.digests,
  };

  const mso = {
    version: '1.0',
    digestAlgorithm: DIGEST_ALGORITHM,
    valueDigests,
    deviceKeyInfo: { deviceKey: {} },
    docType: 'org.iso.18013.5.1.mDL',
    validityInfo: {
      signed: new cbor.Tagged(0, now.toISOString()),
      validFrom: new cbor.Tagged(0, validFrom.toISOString()),
      validUntil: new cbor.Tagged(0, validUntil.toISOString()),
    },
  };

  const msoBytes = cbor.encode(mso);
  const msoTagged = new cbor.Tagged(24, msoBytes);
  const payload = cbor.encode(msoTagged); // COSE_Sign1 payload bstr content

  const protectedHeader = cbor.encode(new Map<number, unknown>([[1, -7]])); // alg: ES256
  const unprotectedHeader = new Map<number, unknown>([[33, crypto.randomBytes(300)]]); // placeholder "certificate"
  const signature = crypto.randomBytes(64); // NOT a real signature — this tool doesn't verify it (see trustChain.ts)

  const issuerAuth = [protectedHeader, unprotectedHeader, payload, signature];

  const deviceResponse = {
    version: '1.0',
    documents: [
      {
        docType: 'org.iso.18013.5.1.mDL',
        issuerSigned: {
          nameSpaces: {
            [ISO_MDL_NAMESPACE]: isoNs.items,
            [AAMVA_NAMESPACE]: aamvaNs.items,
          },
          issuerAuth,
        },
        deviceSigned: {
          nameSpaces: cbor.encode(new Map()),
          deviceAuth: { deviceSignature: [protectedHeader, new Map(), null, crypto.randomBytes(64)] },
        },
      },
    ],
    status: 0,
  };

  return cbor.encode(deviceResponse);
}

function main() {
  const outDir = path.join(__dirname, 'fixtures');
  fs.mkdirSync(outDir, { recursive: true });

  const now = new Date();

  const valid = buildFixture(now);
  fs.writeFileSync(path.join(outDir, 'valid.cbor'), valid);
  fs.writeFileSync(path.join(outDir, 'valid.b64'), valid.toString('base64url'));

  const expired = buildFixture(now, { expired: true });
  fs.writeFileSync(path.join(outDir, 'expired.cbor'), expired);

  const tampered = buildFixture(now, { tamperElement: 'family_name' });
  fs.writeFileSync(path.join(outDir, 'tampered.cbor'), tampered);

  console.log(`Wrote fixtures to ${outDir}`);
}

if (require.main === module) {
  main();
}
