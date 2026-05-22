/** Printable MahaDBT-style application summary for student preview and institute review. */

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

export function ApplicationDetailPanel({ application, ipfsGatewayUrl }) {
  if (!application) return null;
  const p = application.applicantProfile || {};
  const gw = ipfsGatewayUrl || ((cid) => (cid ? `https://gateway.pinata.cloud/ipfs/${cid}` : ""));

  const link = (cid, label) =>
    cid ? (
      <a className="font-semibold text-blue-700 hover:text-blue-800" href={gw(cid)} target="_blank" rel="noreferrer">
        {label} →
      </a>
    ) : (
      <span className="text-red-700">Missing</span>
    );

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-800">
      <div className="text-xs font-bold uppercase text-slate-500">Full application (institute review)</div>
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
      <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-3">
        {application.applicationType === "annual_renewal" ? (
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-900">
            Annual renewal · AY {application.applicationYear}
          </span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800">First admission</span>
        )}
        {link(application.incomeCertCid || application.encryptedDocCid, "Income certificate (year)")}
        {link(application.casteCertCid || application.oneTimeDocs?.casteCertCid, "Caste certificate")}
        {link(application.oneTimeDocs?.rationCardCid, "Ration card")}
        {link(application.oneTimeDocs?.domicileCertCid, "Domicile")}
        {link(application.oneTimeDocs?.capIdCertCid, "CAP ID")}
        {link(application.oneTimeDocs?.admissionLetterCid, "Admission letter")}
        {link(application.applicationSnapshotCid, "Application JSON snapshot")}
      </div>
    </div>
  );
}
