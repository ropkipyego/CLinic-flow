/**
 * Printed laboratory price list, transcribed into seed data.
 *
 * Each row is one billable test:
 * - code     unique per clinic, used to create the matching Service price
 * - name     what the doctor, lab, and receipt all show
 * - price    KES from the printed list (never hard-coded in the UI)
 * - tat      turnaround time from the same sheet
 * - category grouping only, so the consultation list is scannable
 * - resultType how lab staff enter the result
 *
 * Changing a price later is an ADMIN catalog edit, not a frontend change.
 */
export type CatalogTest = {
  code: string;
  name: string;
  price: number;
  tat: string;
  category: string;
  resultType: "TEXT" | "NUMERIC" | "POSITIVE_NEGATIVE" | "SELECT";
  referenceRange?: string | null;
  selectOptions?: string[];
};

export const CLINIC_LAB_TESTS: CatalogTest[] = [
  { code: "OVA", name: "Ova and Cyst", price: 200, tat: "15 Minutes", category: "STOOL", resultType: "TEXT" },
  { code: "ASOT", name: "Anti-Streptolysin Test (ASOT)", price: 300, tat: "20 Minutes", category: "SEROLOGY", resultType: "POSITIVE_NEGATIVE", referenceRange: "Negative", selectOptions: ["Positive", "Negative"] },
  { code: "HIV", name: "HIV Test (P24)", price: 200, tat: "20 Minutes", category: "SEROLOGY", resultType: "POSITIVE_NEGATIVE", referenceRange: "Negative", selectOptions: ["Positive", "Negative"] },
  { code: "TFT", name: "Thyroid Function Tests", price: 3000, tat: "40 Minutes", category: "CHEMISTRY", resultType: "TEXT" },
  { code: "HVS", name: "High Vaginal Swab", price: 500, tat: "20 Minutes", category: "MICROBIOLOGY", resultType: "TEXT" },
  { code: "ROTA", name: "Rota-Adenovirus Test", price: 500, tat: "20 Minutes", category: "STOOL", resultType: "POSITIVE_NEGATIVE", selectOptions: ["Positive", "Negative"] },
  { code: "HBA1C", name: "Glycated Hemoglobin (HbA1c)", price: 1000, tat: "30 Minutes", category: "CHEMISTRY", resultType: "NUMERIC", referenceRange: "%" },
  { code: "RFT", name: "Renal Function Tests", price: 1500, tat: "1 Hour", category: "CHEMISTRY", resultType: "TEXT" },
  { code: "LFT", name: "Liver Function Tests", price: 2500, tat: "2 Hours", category: "CHEMISTRY", resultType: "TEXT" },
  { code: "LIPID", name: "Lipid Panel Test", price: 3000, tat: "30 Minutes", category: "CHEMISTRY", resultType: "TEXT" },
  { code: "CA", name: "Calcium Levels", price: 1000, tat: "30 Minutes", category: "CHEMISTRY", resultType: "NUMERIC", referenceRange: "mmol/L" },
  { code: "DDIMER", name: "Plasma D-Dimer Test", price: 1000, tat: "30 Minutes", category: "HAEMATOLOGY", resultType: "NUMERIC" },
  { code: "URIC", name: "Uric Acid Levels", price: 1000, tat: "20 Minutes", category: "CHEMISTRY", resultType: "NUMERIC", referenceRange: "mmol/L" },
  { code: "ESR", name: "Erythrocyte Sedimentation Rate (ESR)", price: 500, tat: "1 Hour", category: "HAEMATOLOGY", resultType: "NUMERIC", referenceRange: "mm/hr" },
  { code: "DUT", name: "DU-Test (Reverse Blood Grouping)", price: 500, tat: "30 Minutes", category: "HAEMATOLOGY", resultType: "SELECT", selectOptions: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] },
  { code: "FOB", name: "Stool Analysis for Occult Blood", price: 500, tat: "20 Minutes", category: "STOOL", resultType: "POSITIVE_NEGATIVE", selectOptions: ["Positive", "Negative"] },
  { code: "UA", name: "Urine Analysis and Microscopy", price: 300, tat: "30 Minutes", category: "URINE", resultType: "TEXT" },
  { code: "HPYL", name: "Helicobacter Pylori Test", price: 500, tat: "20 Minutes", category: "SEROLOGY", resultType: "POSITIVE_NEGATIVE", selectOptions: ["Positive", "Negative"] },
  { code: "SALM", name: "Salmonella Antigen Test", price: 500, tat: "20 Minutes", category: "SEROLOGY", resultType: "POSITIVE_NEGATIVE", selectOptions: ["Positive", "Negative"] },
  { code: "VDRL", name: "Syphilis Test (VDRL)", price: 300, tat: "20 Minutes", category: "SEROLOGY", resultType: "POSITIVE_NEGATIVE", selectOptions: ["Positive", "Negative"] },
  { code: "HEP", name: "Hepatitis A/B/C Surface Antigen", price: 500, tat: "30 Minutes", category: "SEROLOGY", resultType: "TEXT" },
  { code: "FBC", name: "Full Haemogram", price: 800, tat: "15 Minutes", category: "HAEMATOLOGY", resultType: "TEXT" },
  { code: "PREG", name: "Pregnancy Diagnostic Test (Urine/Serum)", price: 200, tat: "15 Minutes", category: "RAPID", resultType: "POSITIVE_NEGATIVE", selectOptions: ["Positive", "Negative"] },
  { code: "MAL", name: "BS for Malaria Parasites", price: 200, tat: "30 Minutes", category: "RAPID", resultType: "POSITIVE_NEGATIVE", referenceRange: "Negative", selectOptions: ["Positive", "Negative"] },
  { code: "HB", name: "Check Hemoglobin", price: 200, tat: "5 Minutes", category: "HAEMATOLOGY", resultType: "NUMERIC", referenceRange: "g/dL" },
  { code: "RBS", name: "Random Blood Sugar", price: 100, tat: "5 Minutes", category: "CHEMISTRY", resultType: "NUMERIC", referenceRange: "mmol/L" },
  { code: "RF", name: "Rheumatoid Factor Test", price: 200, tat: "20 Minutes", category: "SEROLOGY", resultType: "POSITIVE_NEGATIVE", selectOptions: ["Positive", "Negative"] },
  { code: "BRUC", name: "Brucella Antigen Test", price: 200, tat: "20 Minutes", category: "SEROLOGY", resultType: "POSITIVE_NEGATIVE", selectOptions: ["Positive", "Negative"] },
  { code: "ABO", name: "ABO Blood Grouping", price: 200, tat: "20 Minutes", category: "HAEMATOLOGY", resultType: "SELECT", selectOptions: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] },
  { code: "CRP", name: "C-Reactive Proteins (CRP)", price: 1000, tat: "15 Minutes", category: "CHEMISTRY", resultType: "NUMERIC" },
  { code: "PSA", name: "Prostate Surface Antigen (PSA)", price: 1000, tat: "20 Minutes", category: "CHEMISTRY", resultType: "NUMERIC", referenceRange: "ng/mL" },
];

/**
 * Extra billable items that are not lab tests.
 * Cashier can still type a custom charge; these are shortcuts.
 */
export const MANUAL_CHARGE_SERVICES = [
  { code: "CONSULT", name: "Consultation", category: "CONSULTATION", price: 500 },
  { code: "REGFEE", name: "Registration fee", category: "OTHER", price: 100 },
  { code: "DRESS", name: "Dressing", category: "OTHER", price: 200 },
  { code: "INJ", name: "Injection", category: "OTHER", price: 150 },
  { code: "OBS", name: "Observation", category: "OTHER", price: 300 },
];
