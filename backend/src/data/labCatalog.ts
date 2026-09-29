/**
 * Official laboratory and hospital price lists, transcribed from the printed sheets.
 * Super Admin / Admin can change any amount later from the Price list page.
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

/** Tests on the printed laboratory price list, then extra tests the clinic already offers. */
export const CLINIC_LAB_TESTS: CatalogTest[] = [
  { code: "RBS", name: "Random Blood Sugar (RBS)", price: 100, tat: "5 Minutes", category: "CHEMISTRY", resultType: "NUMERIC", referenceRange: "mmol/L" },
  { code: "FBS", name: "Fasting Blood Sugar (FBS)", price: 100, tat: "5 Minutes", category: "CHEMISTRY", resultType: "NUMERIC", referenceRange: "mmol/L" },
  { code: "HB", name: "Haemoglobin Level (HB)", price: 300, tat: "5 Minutes", category: "HAEMATOLOGY", resultType: "NUMERIC", referenceRange: "g/dL" },
  { code: "PREG", name: "Pregnancy Test — Urine", price: 100, tat: "15 Minutes", category: "RAPID", resultType: "POSITIVE_NEGATIVE", selectOptions: ["Positive", "Negative"] },
  { code: "PREGB", name: "Pregnancy Test — Blood", price: 300, tat: "15 Minutes", category: "RAPID", resultType: "POSITIVE_NEGATIVE", selectOptions: ["Positive", "Negative"] },
  { code: "HPYL", name: "H. Pylori Antigen (Ag)", price: 500, tat: "20 Minutes", category: "SEROLOGY", resultType: "POSITIVE_NEGATIVE", selectOptions: ["Positive", "Negative"] },
  { code: "HPYLAB", name: "H. Pylori Antibody (Ab)", price: 500, tat: "20 Minutes", category: "SEROLOGY", resultType: "POSITIVE_NEGATIVE", selectOptions: ["Positive", "Negative"] },
  { code: "VDRL", name: "VDRL (Syphilis)", price: 1000, tat: "20 Minutes", category: "SEROLOGY", resultType: "POSITIVE_NEGATIVE", selectOptions: ["Positive", "Negative"] },
  { code: "UA", name: "Urinalysis", price: 200, tat: "30 Minutes", category: "URINE", resultType: "TEXT" },
  { code: "HIV", name: "HIV Test", price: 200, tat: "20 Minutes", category: "SEROLOGY", resultType: "POSITIVE_NEGATIVE", referenceRange: "Negative", selectOptions: ["Positive", "Negative"] },
  { code: "PSA", name: "PSA (Prostate Specific Antigen)", price: 1000, tat: "20 Minutes", category: "CHEMISTRY", resultType: "NUMERIC", referenceRange: "ng/mL" },
  { code: "MAL", name: "Malaria Test (MRDT)", price: 200, tat: "30 Minutes", category: "RAPID", resultType: "POSITIVE_NEGATIVE", referenceRange: "Negative", selectOptions: ["Positive", "Negative"] },
  { code: "SALM", name: "Salmonella Antigen Test", price: 500, tat: "20 Minutes", category: "SEROLOGY", resultType: "POSITIVE_NEGATIVE", selectOptions: ["Positive", "Negative"] },
  { code: "OVA", name: "Ova and Cyst", price: 200, tat: "15 Minutes", category: "STOOL", resultType: "TEXT" },
  { code: "ASOT", name: "Anti-Streptolysin Test (ASOT)", price: 300, tat: "20 Minutes", category: "SEROLOGY", resultType: "POSITIVE_NEGATIVE", referenceRange: "Negative", selectOptions: ["Positive", "Negative"] },
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
  { code: "HEP", name: "Hepatitis A/B/C Surface Antigen", price: 500, tat: "30 Minutes", category: "SEROLOGY", resultType: "TEXT" },
  { code: "FBC", name: "Full Haemogram", price: 800, tat: "15 Minutes", category: "HAEMATOLOGY", resultType: "TEXT" },
  { code: "RF", name: "Rheumatoid Factor Test", price: 200, tat: "20 Minutes", category: "SEROLOGY", resultType: "POSITIVE_NEGATIVE", selectOptions: ["Positive", "Negative"] },
  { code: "BRUC", name: "Brucella Antigen Test", price: 200, tat: "20 Minutes", category: "SEROLOGY", resultType: "POSITIVE_NEGATIVE", selectOptions: ["Positive", "Negative"] },
  { code: "ABO", name: "ABO Blood Grouping", price: 200, tat: "20 Minutes", category: "HAEMATOLOGY", resultType: "SELECT", selectOptions: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] },
  { code: "CRP", name: "C-Reactive Proteins (CRP)", price: 1000, tat: "15 Minutes", category: "CHEMISTRY", resultType: "NUMERIC" },
];

/**
 * Hospital charges from the printed services sheet.
 * Implant removal had no printed amount — starts at 500 and is editable.
 * Registration and observation are extra clinic charges, not on that sheet.
 */
export const MANUAL_CHARGE_SERVICES = [
  { code: "CONSULT", name: "Normal consultation", category: "CONSULTATION", price: 200 },
  { code: "CONSULTSP", name: "Special consultation", category: "CONSULTATION", price: 500 },
  { code: "STITCHS", name: "Stitching — small", category: "PROCEDURE", price: 300 },
  { code: "STITCHM", name: "Stitching — medium", category: "PROCEDURE", price: 500 },
  { code: "STITCHL", name: "Stitching — large", category: "PROCEDURE", price: 800 },
  { code: "CIRCCHILD", name: "Circumcision — child", category: "PROCEDURE", price: 2500 },
  { code: "CIRCADULT", name: "Circumcision — adult", category: "PROCEDURE", price: 3000 },
  { code: "DRESS", name: "Dressing — small", category: "DRESSING", price: 200 },
  { code: "DRESSM", name: "Dressing — medium", category: "DRESSING", price: 400 },
  { code: "DRESSL", name: "Dressing — large", category: "DRESSING", price: 600 },
  { code: "EARSIR", name: "Ear syringing", category: "PROCEDURE", price: 600 },
  { code: "INCDS", name: "Incision and drainage — small", category: "PROCEDURE", price: 1000 },
  { code: "INCDM", name: "Incision and drainage — medium", category: "PROCEDURE", price: 1500 },
  { code: "INCDL", name: "Incision and drainage — large", category: "PROCEDURE", price: 2500 },
  { code: "FBR", name: "Foreign body removal", category: "PROCEDURE", price: 300 },
  { code: "INJ", name: "Injection", category: "INJECTION", price: 100 },
  { code: "BPCHK", name: "Blood pressure check", category: "OTHER", price: 20 },
  { code: "NEB", name: "Nebulization", category: "PROCEDURE", price: 700 },
  { code: "FP", name: "Family planning — pills / condoms", category: "FAMILY_PLANNING", price: 200 },
  { code: "DMPA", name: "Depo Provera (DMPA)", category: "FAMILY_PLANNING", price: 700 },
  { code: "IMPLANON", name: "Implanon insertion", category: "FAMILY_PLANNING", price: 900 },
  { code: "JADELLE", name: "Jadelle insertion", category: "FAMILY_PLANNING", price: 1700 },
  { code: "IUCD", name: "IUCD insertion", category: "FAMILY_PLANNING", price: 500 },
  { code: "IMPLREM", name: "Implant removal", category: "FAMILY_PLANNING", price: 500 },
  { code: "REGFEE", name: "Registration fee", category: "REGISTRATION", price: 100 },
  { code: "OBS", name: "Observation", category: "OBSERVATION", price: 300 },
];
