/** Printable MahaDBT-style application + print preview modal */

import { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ONE_TIME_DOCUMENTS, oneTimeDocsFromApplication, oneTimeDocsComplete, isRenewalApplication } from "./documentsConfig.js";
import "./application-print.css";

function Section({ title, children }) {
  return (
    <div className="ap-section">
      <div className="ap-section-title">{title}</div>
      <div className="ap-section-body">{children}</div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="ap-row">
      <div className="ap-label">{label}</div>
      <div className="ap-value">{value ?? "—"}</div>
    </div>
  );
}

function shortCid(cid) {
  if (!cid) return "—";
  const s = String(cid);
  return s.length > 20 ? `${s.slice(0, 10)}…${s.slice(-8)}` : s;
}

/** Full application form content (screen + print) */
export function ApplicationPrintSheet({ profile, account, epoch, scheme, incomeCertCid, oneTimeDocs, applicationSnapshotCid }) {
  const p = profile || {};
  const ayLabel = `AY ${Number(epoch) - 1}–${epoch}`;
  const refId = `ZK-${epoch}-${String(account || "pending").slice(2, 10).toUpperCase() || "DRAFT"}`;
  const incomeFmt = p.familyAnnualIncome
    ? `₹${Number(String(p.familyAnnualIncome).replace(/,/g, "")).toLocaleString("en-IN")}`
    : "—";

  const docItems = [
    { label: "Income certificate (this year)", cid: incomeCertCid, required: true },
    ...ONE_TIME_DOCUMENTS.map((d) => ({
      label: d.label,
      cid: oneTimeDocs?.[d.key]?.cid || "",
      required: true,
    })),
  ];

  return (
    <div id="zk-application-print" className="ap-sheet">
      <header className="ap-header">
        <div className="ap-emblem" aria-hidden>
          🛡️
        </div>
        <div className="ap-title-block">
          <h1>ZK‑Samvidhan — Online Scholarship Application</h1>
          <p className="ap-sub">Directorate-linked demo portal · Government of Maharashtra · Zero-Knowledge eligibility</p>
        </div>
        <div className="ap-ref">
          <strong>{refId}</strong>
          <span>{ayLabel}</span>
          <span>{new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
        </div>
      </header>

      <div className="ap-banner">
        <strong>Scheme:</strong> {scheme?.name || "—"} · <strong>Department:</strong> {scheme?.department || "—"} ·{" "}
        <strong>Type:</strong> {scheme?.schemeType || "—"} · <strong>Income limit:</strong>{" "}
        {scheme?.incomeLimitINR ? `₹${scheme.incomeLimitINR.toLocaleString("en-IN")}` : "—"}
      </div>

      <div className="ap-grid-2" style={{ marginBottom: 16 }}>
        <div>
          <Section title="Personal details">
            <Row label="Applicant name (as per SSC)" value={p.applicantName} />
            <Row label="Date of birth" value={p.dateOfBirth} />
            <Row label="Gender" value={p.gender} />
            <Row label="Mobile number" value={p.mobile} />
            <Row label="Email" value={p.email} />
            <Row label="Parent / guardian mobile" value={p.parentMobile} />
            <Row label="Aadhaar (last 4 digits)" value={p.aadhaarLast4 ? `XXXX XXXX ${p.aadhaarLast4}` : "—"} />
          </Section>
        </div>
        <div>
          <div className="ap-photo-box">
            <span>Passport size</span>
            <span>photograph</span>
            <span style={{ marginTop: 8, fontSize: "0.6rem" }}>(attach before institute)</span>
          </div>
          <Section title="Wallet / ZK identity">
            <Row label="Connected wallet" value={account ? `${account.slice(0, 10)}…${account.slice(-8)}` : "Not connected"} />
            <Row label="Academic year" value={ayLabel} />
            <Row label="Policy ID (ZK)" value={scheme?.policyId != null ? String(scheme.policyId) : "—"} />
          </Section>
        </div>
      </div>

      <div className="ap-grid-2">
        <Section title="Caste & religion">
          <Row label="Caste category" value={p.casteCategory} />
          <Row label="Caste / sub-caste" value={p.casteName} />
          <Row label="Religion" value={p.religion} />
          <Row label="Caste certificate no." value={p.casteCertNo} />
          <Row label="Issuing district" value={p.issuingDistrict} />
          <Row label="Domicile of Maharashtra" value={p.domicileMH !== false ? "Yes" : "No"} />
        </Section>
        <Section title="Income details">
          <Row label="Family annual income" value={incomeFmt} />
          <Row label="Income certificate no." value={p.incomeCertNo} />
          <Row label="Income cert. issue date" value={p.incomeCertIssueDate} />
        </Section>
      </div>

      <div className="ap-grid-2">
        <Section title="Education (current course)">
          <Row label="College / institute" value={p.collegeName} />
          <Row label="Institute code" value={p.instituteCode} />
          <Row label="Department" value={p.department} />
          <Row label="Course" value={p.course} />
          <Row label="Year of study" value={p.courseYear} />
          <Row label="PRN / roll number" value={p.prn} />
        </Section>
        <Section title="Bank (Aadhaar-linked)">
          <Row label="Bank account" value={p.bankAccount ? `XXXXXX${String(p.bankAccount).slice(-4)}` : "—"} />
          <Row label="IFSC code" value={p.ifsc} />
          <Row label="Branch name" value={p.branchName} />
        </Section>
      </div>

      <Section title="Uploaded documents (IPFS)">
        <div className="ap-doc-grid">
          {docItems.map((d) => (
            <div key={d.label} className="ap-doc-item">
              <span className={d.cid ? "ap-doc-ok" : "ap-doc-miss"} aria-hidden>
                {d.cid ? "✓" : "○"}
              </span>
              <div>
                <div style={{ fontWeight: 600 }}>{d.label}</div>
                <div style={{ fontSize: "0.65rem", color: "#78909c", fontFamily: "monospace" }}>{shortCid(d.cid)}</div>
              </div>
            </div>
          ))}
        </div>
        {applicationSnapshotCid ? (
          <div className="ap-row" style={{ marginTop: 8 }}>
            <div className="ap-label">Application JSON snapshot</div>
            <div className="ap-value" style={{ fontFamily: "monospace", fontSize: "0.7rem" }}>
              {applicationSnapshotCid}
            </div>
          </div>
        ) : null}
      </Section>

      <div className="ap-footer">
        <p>
          I declare that the information above is true and matches my records. The institute will verify documents on IPFS before
          issuing the on-chain eligibility credential. This printout is for student records and institute review — not a final
          sanction order.
        </p>
        <div className="ap-sign-row">
          <div className="ap-sign-line">Signature of applicant</div>
          <div className="ap-sign-line">Date & place</div>
        </div>
        <p style={{ marginTop: 16, textAlign: "center", fontSize: "0.65rem" }}>
          ZK‑Samvidhan · MST Testnet · Generated {new Date().toLocaleString("en-IN")}
        </p>
      </div>
    </div>
  );
}

/** Modal + portal — fixes blank print (renders before window.print) */
export function PrintPreviewModal({ open, onClose, children }) {
  const runPrint = useCallback(() => {
    document.body.classList.add("zk-print-mode");
    requestAnimationFrame(() => {
      window.print();
    });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    const afterPrint = () => {
      document.body.classList.remove("zk-print-mode");
    };
    window.addEventListener("afterprint", afterPrint);
    return () => window.removeEventListener("afterprint", afterPrint);
  }, []);

  if (!open) return null;

  return createPortal(
    <div id="zk-print-root" className="zk-print-overlay">
      <div className="zk-print-toolbar">
        <div>
          <div className="font-semibold text-slate-900">Application print preview</div>
          <div className="text-xs text-slate-600">Review your data below, then print or save as PDF.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="md-btn md-btn-secondary md-btn-md" onClick={onClose}>
            Close
          </button>
          <button type="button" className="md-btn md-btn-primary md-btn-md" onClick={runPrint}>
            Print / Save PDF
          </button>
        </div>
      </div>
      <div className="zk-print-scroll">{children}</div>
    </div>,
    document.body
  );
}

/** @deprecated use ApplicationPrintSheet inside PrintPreviewModal */
export function ApplicationPrint(props) {
  return <ApplicationPrintSheet {...props} />;
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
