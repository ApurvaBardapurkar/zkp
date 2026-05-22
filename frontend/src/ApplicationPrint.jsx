/** Printable MahaDBT-style application summary for student preview and institute review. */

import { ONE_TIME_DOCUMENTS, oneTimeDocsFromApplication, oneTimeDocsComplete, isRenewalApplication } from "./documentsConfig.js";

export function ApplicationPrint({ profile, account, epoch, scheme, incomeCertCid, casteCertCid, oneTimeDocs, applicationSnapshotCid }) {
  const p = profile || {};
  const row = (label, value) => (
    <div className="grid grid-cols-2 gap-x-2 border-b border-slate-100 py-1.5 text-sm">
      <div className="font-medium text-slate-600">{label}</div>
      <div className="text-slate-900">{value || "—"}</div>
    </div>
  );

  return (
    <div id="zk-application-print" className="mt-4 rounded-xl border-2 border-slate-300 bg-white p-6 text-sm text-slate-900 print:border-0">
      <div className="text-center text-lg font-bold">ZK‑Samvidhan — Online Application (Print)</div>
      <div className="mt-1 text-center text-xs text-slate-600">
        Government of Maharashtra · Academic Year {epoch} (AY {Number(epoch) - 1}-{epoch}) · {new Date().toLocaleDateString("en-IN")}
      </div>
      <hr className="my-4" />

      <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Personal details</div>
      {row("Applicant name (SSC)", p.applicantName)}
      {row("Date of birth", p.dateOfBirth)}
      {row("Gender", p.gender)}
      {row("Mobile", p.mobile)}
      {row("Email", p.email)}
      {row("Parent / guardian mobile", p.parentMobile)}
      {row("Aadhaar (last 4)", p.aadhaarLast4 ? `xxxx xxxx ${p.aadhaarLast4}` : "—")}
      {row("Wallet (Citizen ID source)", account)}

      <div className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">Caste & religion</div>
      {row("Caste category", p.casteCategory)}
      {row("Caste", p.casteName)}
      {row("Religion", p.religion)}
      {row("Caste certificate no.", p.casteCertNo)}
      {row("Issuing district", p.issuingDistrict)}
      {row("Domicile Maharashtra", p.domicileMH !== false ? "Yes" : "No")}

      <div className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">Income details</div>
      {row("Family annual income (₹)", p.familyAnnualIncome ? `₹${Number(p.familyAnnualIncome).toLocaleString("en-IN")}` : "—")}
      {row("Income certificate no.", p.incomeCertNo)}
      {row("Income cert. issue date", p.incomeCertIssueDate)}

      <div className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">Education (current course)</div>
      {row("College / institute", p.collegeName)}
      {row("Institute code", p.instituteCode)}
      {row("Department", p.department)}
      {row("Course", p.course)}
      {row("Course year", p.courseYear)}
      {row("PRN / roll no.", p.prn)}

      <div className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">Bank (Aadhaar-linked)</div>
      {row("Bank account", p.bankAccount ? `xxxxxx${String(p.bankAccount).slice(-4)}` : "—")}
      {row("IFSC", p.ifsc)}
      {row("Branch", p.branchName)}

      <div className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">Scheme applied</div>
      {row("Scheme name", scheme?.name)}
      {row("Department (scheme)", scheme?.department)}
      {row("Scheme type", scheme?.schemeType)}
      {row("Policy ID (ZK)", scheme?.policyId)}

      <div className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">Documents (IPFS / Pinata)</div>
      {row("Income certificate (this year)", incomeCertCid)}
      {row("Caste certificate (one-time)", casteCertCid || oneTimeDocs?.casteCert?.cid)}
      {row("Ration card (one-time)", oneTimeDocs?.rationCard?.cid)}
      {row("Domicile certificate (one-time)", oneTimeDocs?.domicileCert?.cid)}
      {row("CAP ID certificate (one-time)", oneTimeDocs?.capIdCert?.cid)}
      {row("Admission letter (one-time)", oneTimeDocs?.admissionLetter?.cid)}
      {row("Application snapshot CID", applicationSnapshotCid)}

      <p className="mt-6 text-xs text-slate-600">
        I declare that the above information matches my MahaDBT profile. The institute will verify documents on IPFS before issuing the on-chain eligibility credential.
      </p>
    </div>
  );
}

function VerifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
      ✓ Verified at first admission (ZK)
    </span>
  );
}

/** Institute review: renewal = income only; first admission = all documents. */
export function IssuerDocumentReview({ application, ipfsGatewayUrl }) {
  if (!application) return null;
  const gw = ipfsGatewayUrl || ((cid) => (cid ? `https://gateway.pinata.cloud/ipfs/${cid}` : ""));
  const isRenewal = isRenewalApplication(application);
  const ot = oneTimeDocsFromApplication(application);
  const incomeCid = application.incomeCertCid || application.encryptedDocCid || "";
  const oneTimeComplete = oneTimeDocsComplete(ot);

  const oneTimeRows = ONE_TIME_DOCUMENTS.map((d) => ({
    label: d.label,
    cid: ot[d.key]?.cid || "",
  }));

  if (isRenewal) {
    return (
      <div className="mt-3 space-y-4">
        <div className="rounded-xl border border-violet-200 bg-violet-50/80 p-4 text-sm text-slate-800">
          <div className="text-xs font-bold uppercase tracking-wide text-violet-900">ZK annual renewal</div>
          <p className="mt-2 leading-relaxed">
            The student submitted <strong>only a new income certificate</strong> for AY {application.applicationYear}. They did{" "}
            <strong>not</strong> re-upload caste, ration card, domicile, CAP ID, or admission letter — those were verified once at first
            admission and stay bound in the ZK credential as <span className="font-mono text-xs">Poseidon hashes</span> (not raw files on-chain).
          </p>
          <p className="mt-2 text-xs text-slate-600">
            Your task: verify this year&apos;s income → re-issue credential (new income commitment). One-time attributes are proven via ZK at claim time.
          </p>
        </div>

        <div className="rounded-xl border border-amber-200 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold uppercase text-amber-900">
              Income certificate — AY {application.applicationYear} (verify this)
            </div>
            {incomeCid ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Pending your review</span>
            ) : (
              <span className="text-xs font-semibold text-red-700">Missing</span>
            )}
          </div>
          {incomeCid ? (
            <>
              <a className="mt-2 inline-block text-sm font-semibold text-blue-700 hover:text-blue-800" href={gw(incomeCid)} target="_blank" rel="noreferrer">
                Open on IPFS →
              </a>
              <iframe title="Income renewal" src={gw(incomeCid)} className="mt-2 h-72 w-full rounded-lg border border-slate-200" />
            </>
          ) : null}
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-semibold uppercase text-slate-600">One-time documents — already verified (reference archive)</div>
          <p className="mt-1 text-xs text-slate-600">Not re-submitted. Shown for audit only; no need to open unless you want to cross-check.</p>
          <ul className="mt-3 space-y-2">
            {oneTimeRows.map((row) => (
              <li key={row.label} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                <span className="font-medium text-slate-800">{row.label}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <VerifiedBadge />
                  {row.cid ? (
                    <a className="text-xs font-semibold text-blue-700 hover:text-blue-800" href={gw(row.cid)} target="_blank" rel="noreferrer">
                      View archive →
                    </a>
                  ) : (
                    <span className="text-xs text-red-700">Missing on file</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {!oneTimeComplete ? (
            <p className="mt-2 text-xs text-red-800">First-admission file is incomplete — contact admin; do not issue until first admission docs exist.</p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
        <strong>First admission</strong> — verify income and all one-time documents below before issuing the initial credential.
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-amber-200 bg-white p-3">
          <div className="text-xs font-semibold uppercase text-amber-900">Income certificate</div>
          {incomeCid ? (
            <>
              <a className="mt-2 inline-block text-sm font-semibold text-blue-700" href={gw(incomeCid)} target="_blank" rel="noreferrer">
                Open on IPFS →
              </a>
              <iframe title="Income" src={gw(incomeCid)} className="mt-2 h-64 w-full rounded-lg border border-slate-200" />
            </>
          ) : (
            <p className="mt-2 text-sm text-red-700">Missing</p>
          )}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-xs font-semibold uppercase text-slate-600">Caste certificate (one-time)</div>
          {ot.casteCert?.cid ? (
            <>
              <a className="mt-2 inline-block text-sm font-semibold text-blue-700" href={gw(ot.casteCert.cid)} target="_blank" rel="noreferrer">
                Open on IPFS →
              </a>
              <iframe title="Caste" src={gw(ot.casteCert.cid)} className="mt-2 h-64 w-full rounded-lg border border-slate-200" />
            </>
          ) : (
            <p className="mt-2 text-sm text-red-700">Missing</p>
          )}
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="text-xs font-semibold uppercase text-slate-600">Other one-time documents</div>
        <ul className="mt-2 flex flex-wrap gap-2">
          {oneTimeRows
            .filter((r) => r.label !== "Caste certificate")
            .map((row) => (
              <li key={row.label}>
                {row.cid ? (
                  <a
                    className="inline-flex rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                    href={gw(row.cid)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {row.label} →
                  </a>
                ) : (
                  <span className="inline-flex rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">{row.label} missing</span>
                )}
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}

export function ApplicationDetailPanel({ application, ipfsGatewayUrl }) {
  if (!application) return null;
  const p = application.applicantProfile || {};
  const gw = ipfsGatewayUrl || ((cid) => (cid ? `https://gateway.pinata.cloud/ipfs/${cid}` : ""));
  const isRenewal = isRenewalApplication(application);
  const ot = oneTimeDocsFromApplication(application);

  const link = (cid, label, opts = {}) =>
    cid ? (
      <a className={`font-semibold text-blue-700 hover:text-blue-800 ${opts.muted ? "text-xs" : ""}`} href={gw(cid)} target="_blank" rel="noreferrer">
        {label} →
      </a>
    ) : (
      <span className="text-red-700">Missing</span>
    );

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-800">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-xs font-bold uppercase text-slate-500">Application summary</div>
        {isRenewal ? (
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-900">Annual renewal · AY {application.applicationYear}</span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800">First admission</span>
        )}
      </div>
      {isRenewal ? (
        <p className="text-xs text-slate-600">
          Only <strong>income</strong> was submitted for this year. Other documents are marked <strong>already verified (ZK)</strong> from first admission.
        </p>
      ) : null}
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <span className="text-slate-500">Name:</span> {p.applicantName || "—"}
        </div>
        <div>
          <span className="text-slate-500">Mobile:</span> {p.mobile || "—"}
        </div>
        <div>
          <span className="text-slate-500">Email:</span> {p.email || "—"}
        </div>
        <div>
          <span className="text-slate-500">Caste:</span> {p.casteCategory} {p.casteName ? `(${p.casteName})` : ""}
        </div>
        <div>
          <span className="text-slate-500">Religion:</span> {p.religion || "—"}
        </div>
        <div>
          <span className="text-slate-500">Income:</span> ₹{Number(p.familyAnnualIncome || 0).toLocaleString("en-IN")}
        </div>
        <div>
          <span className="text-slate-500">College:</span> {p.collegeName || "—"}
        </div>
        <div>
          <span className="text-slate-500">Department:</span> {p.department || "—"}
        </div>
        <div>
          <span className="text-slate-500">Course:</span> {p.course || "—"} ({p.courseYear || "—"})
        </div>
        <div>
          <span className="text-slate-500">PRN:</span> {p.prn || "—"}
        </div>
        <div>
          <span className="text-slate-500">AY:</span> {application.applicationYear || "—"}
        </div>
        <div>
          <span className="text-slate-500">Wallet:</span>{" "}
          <span className="font-mono text-xs">{application.citizenAddress}</span>
        </div>
      </div>
      <div className="space-y-2 border-t border-slate-100 pt-3">
        <div className="text-xs font-semibold uppercase text-amber-800">
          {isRenewal ? `Income certificate — AY ${application.applicationYear} (review)` : "Income certificate (this year)"}
        </div>
        {link(application.incomeCertCid || application.encryptedDocCid, "Income certificate")}
        {isRenewal ? (
          <>
            <div className="mt-2 text-xs font-semibold uppercase text-slate-500">One-time documents (ZK — already verified)</div>
            <ul className="space-y-1.5">
              {ONE_TIME_DOCUMENTS.map((d) => {
                const cid = ot[d.key]?.cid || "";
                return (
                  <li key={d.key} className="flex flex-wrap items-center gap-2">
                    <VerifiedBadge />
                    <span className="text-slate-700">{d.label}</span>
                    {cid ? link(cid, "Archive", { muted: true }) : <span className="text-red-700 text-xs">missing on file</span>}
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <div className="flex flex-wrap gap-3 pt-1">
            {ONE_TIME_DOCUMENTS.map((d) => {
              const cid = ot[d.key]?.cid || "";
              return (
                <span key={d.key}>
                  {link(cid, d.label)}
                </span>
              );
            })}
            {link(application.applicationSnapshotCid, "Application JSON snapshot")}
          </div>
        )}
      </div>
    </div>
  );
}
