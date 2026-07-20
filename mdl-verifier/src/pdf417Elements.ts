/**
 * Element ID -> human label table for the AAMVA DL/ID Card Design Standard
 * barcode format. Not exhaustive (the standard has grown over ~20 years of
 * revisions and jurisdictions add their own optional elements) — unknown
 * IDs are passed through with the raw ID as the label rather than dropped.
 */
export const AAMVA_BARCODE_ELEMENT_LABELS: Record<string, string> = {
  // Mandatory
  DCA: 'Vehicle Class',
  DCB: 'Restriction Codes',
  DCD: 'Endorsement Codes',
  DBA: 'Document Expiration Date',
  DCS: 'Family Name',
  DAC: 'First Name',
  DAD: 'Middle Name(s)',
  DBD: 'Document Issue Date',
  DBB: 'Date of Birth',
  DBC: 'Sex',
  DAY: 'Eye Color',
  DAU: 'Height',
  DAG: 'Address Street 1',
  DAI: 'Address City',
  DAJ: 'Address Jurisdiction Code',
  DAK: 'Address Postal Code',
  DAQ: 'Customer ID Number',
  DCF: 'Document Discriminator',
  DCG: 'Country Identification',
  DDE: 'Family Name Truncation',
  DDF: 'First Name Truncation',
  DDG: 'Middle Name Truncation',

  // Common optional
  DAH: 'Address Street 2',
  DAZ: 'Hair Color',
  DCI: 'Place of Birth',
  DCJ: 'Audit Information',
  DCK: 'Inventory Control Number',
  DBN: 'AKA Family Name',
  DBG: 'AKA Given Name',
  DBS: 'AKA Suffix Name',
  DCU: 'Name Suffix',
  DCE: 'Weight Range',
  DCL: 'Race / Ethnicity',
  DCM: 'Standard Vehicle Classification',
  DCN: 'Standard Endorsement Code',
  DCO: 'Standard Restriction Code',
  DCP: 'Jurisdiction Vehicle Classification Description',
  DCQ: 'Jurisdiction Endorsement Code Description',
  DCR: 'Jurisdiction Restriction Code Description',
  DDA: 'Compliance Type (REAL ID)',
  DDB: 'Card Revision Date',
  DDC: 'HAZMAT Endorsement Expiration Date',
  DDD: 'Limited Duration Document Indicator',
  DAW: 'Weight (lb)',
  DAX: 'Weight (kg)',
  DDH: 'Under 18 Until',
  DDI: 'Under 19 Until',
  DDJ: 'Under 21 Until',
  DDK: 'Organ Donor Indicator',
  DDL: 'Veteran Indicator',
};

/** Elements whose value is a date in AAMVA's MMDDCCYY (default) or CCYYMMDD format. */
export const AAMVA_BARCODE_DATE_ELEMENTS = new Set(['DBA', 'DBB', 'DBD', 'DDB', 'DDC', 'DDH', 'DDI', 'DDJ']);

export function labelForBarcodeElement(id: string): string {
  return AAMVA_BARCODE_ELEMENT_LABELS[id] ?? id;
}
