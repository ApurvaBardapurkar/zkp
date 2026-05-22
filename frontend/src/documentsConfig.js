/** Document policy: one-time at first admission vs every academic year. */

export const ONE_TIME_DOCUMENTS = [
  { key: "casteCert", label: "Caste certificate", required: true },
  { key: "rationCard", label: "Ration card", required: true },
  { key: "domicileCert", label: "Domicile / Maharashtra residence certificate", required: true },
  { key: "capIdCert", label: "CAP allotment / ID certificate", required: true },
  { key: "admissionLetter", label: "College admission letter", required: true },
];

export function emptyOneTimeDocs() {
  const out = {};
  for (const d of ONE_TIME_DOCUMENTS) {
    out[d.key] = { cid: "", name: "", file: null };
  }
  return out;
}

export function oneTimeDocsFromApplication(app) {
  const base = emptyOneTimeDocs();
  if (!app) return base;
  const stored = app.oneTimeDocs || {};
  for (const d of ONE_TIME_DOCUMENTS) {
    base[d.key] = {
      cid: stored[`${d.key}Cid`] || (d.key === "casteCert" ? app.casteCertCid : "") || "",
      name: stored[`${d.key}Name`] || (d.key === "casteCert" ? app.casteCertName : "") || "",
      file: null,
    };
  }
  return base;
}

export function oneTimeDocsToPayload(docs) {
  const payload = { oneTimeDocs: {} };
  for (const d of ONE_TIME_DOCUMENTS) {
    payload.oneTimeDocs[`${d.key}Cid`] = docs[d.key]?.cid || "";
    payload.oneTimeDocs[`${d.key}Name`] = docs[d.key]?.name || "";
  }
  payload.casteCertCid = docs.casteCert?.cid || "";
  payload.casteCertName = docs.casteCert?.name || "";
  return payload;
}

export function oneTimeDocsComplete(docs) {
  return ONE_TIME_DOCUMENTS.filter((d) => d.required).every((d) => Boolean(docs[d.key]?.cid));
}

export function missingOneTimeLabels(docs) {
  return ONE_TIME_DOCUMENTS.filter((d) => d.required && !docs[d.key]?.cid).map((d) => d.label);
}
