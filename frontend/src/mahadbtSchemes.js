/** MahaDBT-style scheme catalogue + eligibility (UI); on-chain policyId maps to ZK circuit. */

export const CASTE_CATEGORIES = [
  "OPEN",
  "EWS",
  "EBC",
  "OBC",
  "SBC",
  "VJNT",
  "SC",
  "ST",
  "PWD",
];

export const RELIGIONS = ["Hindu", "Muslim", "Christian", "Buddhist", "Jain", "Sikh", "Other"];

export const MAHADBT_SCHEMES = [
  {
    key: "SHAHU_EBC_DTE",
    policyId: 1201,
    programKey: "EBC",
    name: "Rajarshi Chhatrapati Shahu Maharaj Shikshan Shulkh Shishyavrutti Yojna (EBC)",
    department: "Directorate of Technical Education",
    schemeType: "Scholarship",
    incomeLimitINR: 800000,
    castes: ["OPEN", "EWS", "EBC"],
    religions: "ALL",
  },
  {
    key: "PANJABRAO_DTE",
    policyId: 1001,
    programKey: "PANJABRAO_HOSTEL",
    name: "Dr. Panjabrao Deshmukh Vastigruh Nirvah Bhatta Yojna (DTE)",
    department: "Directorate of Technical Education",
    schemeType: "Maintenance Allowance",
    incomeLimitINR: 800000,
    castes: "ALL",
    religions: "ALL",
  },
  {
    key: "OPEN_MERIT_JUNIOR",
    policyId: 1201,
    programKey: "EBC",
    name: "Open Merit Scholarships in Junior College",
    department: "School Education and Sports Department",
    schemeType: "Scholarship",
    incomeLimitINR: 800000,
    castes: ["OPEN", "EWS"],
    religions: "ALL",
  },
  {
    key: "MERIT_EBC",
    policyId: 1201,
    programKey: "EBC",
    name: "Merit Scholarships for Economically Backward Class Students",
    department: "School Education and Sports Department",
    schemeType: "Scholarship",
    incomeLimitINR: 800000,
    castes: ["OPEN", "EWS", "EBC"],
    religions: "ALL",
  },
  {
    key: "SHAHU_VJNT_SBC_11_12",
    policyId: 1401,
    programKey: "OBC_SBC_VJNT_SCHOLARSHIP",
    name: "Rajarshi Chhatrapati Shahu Maharaj Merit Scholarship (11th & 12th — VJNT & SBC)",
    department: "OBC, SEBC, VJNT & SBC Welfare Department",
    schemeType: "Merit Scheme",
    incomeLimitINR: 100000,
    castes: ["VJNT", "SBC", "OBC"],
    religions: "ALL",
  },
  {
    key: "TUITION_SBC",
    policyId: 1401,
    programKey: "OBC_SBC_VJNT_SCHOLARSHIP",
    name: "Tuition Fees and Examination Fees to SBC Students",
    department: "OBC, SEBC, VJNT & SBC Welfare Department",
    schemeType: "Scholarship",
    incomeLimitINR: 100000,
    castes: ["SBC"],
    religions: "ALL",
  },
  {
    key: "PANJABRAO_AGR",
    policyId: 1001,
    programKey: "PANJABRAO_HOSTEL",
    name: "Dr. Panjabrao Deshmukh Vasatigruh Nirvah Bhatta Yojna (AGR)",
    department: "Mahatma Phule Krishi Vidyapeeth, Rahuri",
    schemeType: "Maintenance Allowance",
    incomeLimitINR: 800000,
    castes: "ALL",
    religions: "ALL",
  },
  {
    key: "PANJABRAO_DOA",
    policyId: 1001,
    programKey: "PANJABRAO_HOSTEL",
    name: "Dr. Panjabrao Deshmukh Vasatigruh Nirvah Bhatta Yojna (DOA)",
    department: "Directorate of Art",
    schemeType: "Maintenance Allowance",
    incomeLimitINR: 800000,
    castes: "ALL",
    religions: "ALL",
  },
  {
    key: "PANJABRAO_MAFSU",
    policyId: 1001,
    programKey: "PANJABRAO_HOSTEL",
    name: "Dr. Panjabrao Deshmukh Vasatigruh Nirvah Bhatta Yojna (MAFSU)",
    department: "MAFSU Nagpur",
    schemeType: "Maintenance Allowance",
    incomeLimitINR: 800000,
    castes: "ALL",
    religions: "ALL",
  },
  {
    key: "TFWS_DTE",
    policyId: 1101,
    programKey: "TFWS",
    name: "Tuition Fee Waiver Scheme (TFWS)",
    department: "Directorate of Technical Education",
    schemeType: "Scholarship",
    incomeLimitINR: 800000,
    castes: ["OPEN", "EWS", "EBC", "OBC", "SBC", "VJNT"],
    religions: "ALL",
  },
  {
    key: "POST_MATRIC_PWD",
    policyId: 1001,
    programKey: "PANJABRAO_HOSTEL",
    name: "Post-Matric Scholarship for persons with disability",
    department: "Social Justice and Special Assistance Department",
    schemeType: "Scholarship",
    incomeLimitINR: 800000,
    castes: ["PWD"],
    religions: "ALL",
  },
  {
    key: "SC_POST_MATRIC",
    policyId: 1301,
    programKey: "SC_POST_MATRIC",
    name: "GOI Post Matric Scholarship (SC)",
    department: "Social Justice and Special Assistance Department",
    schemeType: "Scholarship",
    incomeLimitINR: 250000,
    castes: ["SC"],
    religions: "ALL",
  },
];

export function filterEligibleSchemes(profile) {
  const income = Number(profile?.familyAnnualIncome || 0);
  const caste = (profile?.casteCategory || "").toUpperCase();
  const religion = profile?.religion || "";
  const domicile = profile?.domicileMH !== false;

  if (!domicile || !caste || !income) return [];

  return MAHADBT_SCHEMES.filter((s) => {
    if (income > s.incomeLimitINR) return false;
    if (s.castes !== "ALL" && !s.castes.includes(caste)) return false;
    if (s.religions !== "ALL" && !s.religions.includes(religion)) return false;
    return true;
  });
}

export function schemeToProgram(scheme) {
  return {
    key: scheme.programKey,
    policyId: scheme.policyId,
    name: scheme.name,
    incomeLimitINR: scheme.incomeLimitINR,
  };
}

export const DEFAULT_STUDENT_PROFILE = {
  applicantName: "Nimje Sarthak Chandrashekhar",
  dateOfBirth: "2004",
  gender: "Male",
  mobile: "7821967686",
  email: "student@example.com",
  parentMobile: "9881484185",
  aadhaarLast4: "5958",
  casteCategory: "SBC",
  casteName: "(3)(1) Koshti",
  religion: "Hindu",
  familyAnnualIncome: "678167",
  domicileMH: true,
  incomeCertNo: "40092463837",
  incomeCertIssueDate: "13/08/2023",
  casteCertNo: "12264",
  issuingDistrict: "Amravati",
  collegeName: "Government College of Engineering, Amravati",
  instituteCode: "GCEA",
  department: "Computer Engineering",
  course: "B.Tech",
  courseYear: "Second Year",
  prn: "12345678",
  bankAccount: "3786465700",
  ifsc: "SBIN0008312",
  branchName: "Shivaji Nagar, Amravati",
};

export function validateProfileForApply(profile) {
  const missing = [];
  const req = [
    ["applicantName", "Applicant name"],
    ["mobile", "Mobile number"],
    ["email", "Email"],
    ["casteCategory", "Caste category"],
    ["religion", "Religion"],
    ["familyAnnualIncome", "Family income"],
    ["collegeName", "College name"],
    ["department", "Department"],
    ["course", "Course"],
    ["courseYear", "Course year"],
    ["prn", "PRN / roll number"],
  ];
  for (const [key, label] of req) {
    if (!String(profile?.[key] || "").trim()) missing.push(label);
  }
  return missing;
}
