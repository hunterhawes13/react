/**
 * Human-readable labels for data elements defined by:
 *  - ISO/IEC 18013-5:2021 Annex C (namespace "org.iso.18013.5.1")
 *  - AAMVA mDL Implementation Guidelines (namespace "org.iso.18013.5.1.aamva")
 *
 * This is not an exhaustive machine-checked schema (element value shapes are
 * generally accepted as decoded from CBOR and passed through as-is); it's a
 * lookup table so a report can show something more useful than raw element
 * identifiers. Extend as needed for elements not yet listed.
 */

export const ISO_MDL_NAMESPACE = 'org.iso.18013.5.1';
export const AAMVA_NAMESPACE = 'org.iso.18013.5.1.aamva';

export const ISO_MDL_ELEMENT_LABELS: Record<string, string> = {
  family_name: 'Family Name',
  given_name: 'Given Name',
  birth_date: 'Date of Birth',
  issue_date: 'Issue Date',
  expiry_date: 'Expiry Date',
  issuing_country: 'Issuing Country',
  issuing_authority: 'Issuing Authority',
  document_number: 'License/Document Number',
  portrait: 'Portrait Image',
  driving_privileges: 'Driving Privileges',
  un_distinguishing_sign: 'UN Distinguishing Sign',
  administrative_number: 'Administrative Number',
  sex: 'Sex',
  height: 'Height (cm)',
  weight: 'Weight (kg)',
  eye_colour: 'Eye Colour',
  hair_colour: 'Hair Colour',
  birth_place: 'Place of Birth',
  resident_address: 'Resident Address',
  portrait_capture_date: 'Portrait Capture Date',
  age_in_years: 'Age (years)',
  age_birth_year: 'Birth Year',
  age_over_13: 'Age Over 13',
  age_over_16: 'Age Over 16',
  age_over_18: 'Age Over 18',
  age_over_21: 'Age Over 21',
  age_over_25: 'Age Over 25',
  age_over_60: 'Age Over 60',
  age_over_62: 'Age Over 62',
  age_over_65: 'Age Over 65',
  age_over_68: 'Age Over 68',
  issuing_jurisdiction: 'Issuing Jurisdiction',
  nationality: 'Nationality',
  resident_city: 'Resident City',
  resident_state: 'Resident State/Province',
  resident_postal_code: 'Resident Postal Code',
  resident_country: 'Resident Country',
  family_name_national_character: 'Family Name (National Characters)',
  given_name_national_character: 'Given Name (National Characters)',
  signature_usual_mark: 'Signature / Usual Mark',
};

export const AAMVA_ELEMENT_LABELS: Record<string, string> = {
  domestic_driving_privileges: 'Domestic Driving Privileges',
  name_suffix: 'Name Suffix',
  organ_donor: 'Organ Donor',
  veteran: 'Veteran',
  family_name_truncation: 'Family Name Truncation',
  given_name_truncation: 'Given Name Truncation',
  aka_family_name: 'AKA Family Name',
  aka_given_name: 'AKA Given Name',
  aka_suffix: 'AKA Suffix',
  weight_range: 'Weight Range',
  race_ethnicity: 'Race / Ethnicity',
  DHS_compliance: 'DHS Compliance (REAL ID)',
  DHS_compliance_text: 'DHS Compliance Text',
  DHS_temporary_lawful_status: 'DHS Temporary Lawful Status',
  EDL_credential: 'Enhanced Driver License Indicator',
  resident_county: 'Resident County',
  hazmat_endorsement_expiration_date: 'Hazmat Endorsement Expiry Date',
  CDL_indicator: 'Commercial Driver License Indicator',
  sex: 'Sex',
};

/** Data elements whose value is a portrait/photo — typically large binary and omitted from text reports. */
export const BINARY_ELEMENTS = new Set(['portrait', 'signature_usual_mark']);

export function labelForElement(namespace: string, elementIdentifier: string): string {
  if (namespace === ISO_MDL_NAMESPACE) {
    return ISO_MDL_ELEMENT_LABELS[elementIdentifier] ?? elementIdentifier;
  }
  if (namespace === AAMVA_NAMESPACE) {
    return AAMVA_ELEMENT_LABELS[elementIdentifier] ?? elementIdentifier;
  }
  return elementIdentifier;
}
