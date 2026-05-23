/**
 * Explains the three layers: private verification, on-chain credential, ZK claim.
 * Matches scholarshipEligibility.circom + Registry V2 + Gate V2.
 */

export function ZkArchitecturePanel({ compact = false }) {
  const layers = [
    {
      step: "1",
      title: "Initial trust verification (real documents)",
      color: "slate",
      body: "Student uploads PDFs; college/government issuer checks them normally. ZKP does not replace this step — it replaces repeated disclosure later.",
      items: ["Income certificate", "Caste certificate", "Ration card, domicile, CAP, admission letter", "Profile (MahaDBT-style) — reviewed on IPFS, not on-chain"],
    },
    {
      step: "2",
      title: "Credential issuance (issuer attestation)",
      color: "blue",
      body: "After approval, issuer signs a cryptographic credential on MST: eligibility attributes are bound as hashes (not PDFs).",
      items: [
        "Logical claims: verified student, income under limit, eligible category, valid admission (bound in credentialHash)",
        "subjectId + Merkle leaf + expiry on Registry V2",
      ],
    },
    {
      step: "3",
      title: "ZK proof at renewal / claim (Groth16)",
      color: "violet",
      body: "At claim: Groth16 proves eligibility. Income can change every year (new cert + issuer) — that is normal. Caste, domicile, CAP, admission are proved by ZK from the first credential — no PDF re-upload.",
      items: [
        "Same student (identity secret → subjectId)",
        "Issuer credential still valid (Merkle leaf)",
        "ZK-only once: caste category + domicile + caste/admission/CAP doc hashes match credential",
        "Each year: income ≤ limit (private ₹; public incomeCommitment after issuer verified new cert)",
      ],
    },
  ];

  if (compact) {
    return (
      <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3 text-xs text-slate-800">
        <strong className="text-violet-900">Split policy:</strong> Income PDF re-shown yearly (OK). Caste, domicile, CAP, admission proved by ZK only after first verification.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-800">
      <div>
        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">ZK‑Samvidhan architecture</div>
        <p className="mt-1 text-slate-600">
          Credential-based scholarship verification with a Groth16 privacy layer — not “hash storage only”.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {layers.map((L) => (
          <div
            key={L.step}
            className={`rounded-xl border p-3 ${
              L.color === "violet"
                ? "border-violet-200 bg-violet-50/50"
                : L.color === "blue"
                  ? "border-blue-200 bg-blue-50/50"
                  : "border-slate-200 bg-slate-50"
            }`}
          >
            <div className="text-xs font-bold text-slate-500">Layer {L.step}</div>
            <div className="mt-1 font-semibold text-slate-900">{L.title}</div>
            <p className="mt-2 text-xs leading-relaxed text-slate-700">{L.body}</p>
            <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-slate-600">
              {L.items.map((it) => (
                <li key={it}>{it}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
        <div className="mb-1 font-sans font-semibold text-slate-800">Logical credential (bound inside credentialHash, not stored as JSON on-chain):</div>
        {"{"}
        <br />
        &nbsp;&nbsp;"student_verified": true,
        <br />
        &nbsp;&nbsp;"income_below_scheme_limit": true,
        <br />
        &nbsp;&nbsp;"category_eligible": true,
        <br />
        &nbsp;&nbsp;"domicile_maharashtra": true
        <br />
        {"}"}
      </div>
      <ZkSplitPolicyTable />
    </div>
  );
}

/** What we re-verify vs what ZK proves alone (viva-friendly). */
export function ZkSplitPolicyTable() {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 text-xs">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="bg-slate-100 text-slate-700">
            <th className="border-b border-slate-200 px-3 py-2 font-semibold">Attribute / document</th>
            <th className="border-b border-slate-200 px-3 py-2 font-semibold">Each year</th>
            <th className="border-b border-slate-200 px-3 py-2 font-semibold">How</th>
          </tr>
        </thead>
        <tbody className="text-slate-800">
          <tr className="bg-amber-50/80">
            <td className="border-b border-slate-100 px-3 py-2">Income certificate + amount</td>
            <td className="border-b border-slate-100 px-3 py-2">Re-submit PDF → issuer checks</td>
            <td className="border-b border-slate-100 px-3 py-2">Normal verification (income changes)</td>
          </tr>
          <tr>
            <td className="border-b border-slate-100 px-3 py-2">Caste certificate validity</td>
            <td className="border-b border-slate-100 px-3 py-2">No re-upload</td>
            <td className="border-b border-slate-100 px-3 py-2 font-medium text-violet-900">ZK: hash + category in credential</td>
          </tr>
          <tr>
            <td className="border-b border-slate-100 px-3 py-2">Domicile / Maharashtra residence</td>
            <td className="border-b border-slate-100 px-3 py-2">No re-upload</td>
            <td className="border-b border-slate-100 px-3 py-2 font-medium text-violet-900">ZK: domicile flag in credential</td>
          </tr>
          <tr>
            <td className="border-b border-slate-100 px-3 py-2">CAP ID / admission letter / ration card</td>
            <td className="border-b border-slate-100 px-3 py-2">No re-upload</td>
            <td className="border-b border-slate-100 px-3 py-2 font-medium text-violet-900">ZK: doc hashes bound at first admission</td>
          </tr>
          <tr className="bg-blue-50/50">
            <td className="px-3 py-2">Same student + anti double-claim</td>
            <td className="px-3 py-2">Per academic year</td>
            <td className="px-3 py-2">ZK nullifier + on-chain registry</td>
          </tr>
        </tbody>
      </table>
      <p className="border-t border-slate-200 bg-emerald-50/80 px-3 py-2 text-slate-700">
        <strong>Best use of ZK here:</strong> prove admission/caste/domicile validity from the institute-issued credential — not re-exposing those documents every year. Income is the one field that legitimately needs a fresh document.
      </p>
    </div>
  );
}

/** What the circom circuit checks (for claim step). */
export function ZkClaimProofChecklist() {
  const yearlyNormal = [
    "New income certificate PDF → issuer verifies (portal)",
    "New incomeCommitment on-chain after re-issue",
    "Income ≤ scheme limit (private ₹ in witness)",
  ];
  const zkOncePrivate = [
    "Caste category still eligible for policy",
    "Domicile Maharashtra (unchanged)",
    "Caste / CAP / admission / ration hashes match first-admission credential",
    "Same identity secret → subjectId",
    "Merkle proof: credential issued by institute",
  ];
  const publicOnChain = [
    "subjectId",
    "credentialHash",
    "nullifierHash (one claim per year)",
    "policyId",
    "epoch",
    "incomeCommitment",
    "merkleRoot",
  ];

  return (
    <div className="mt-3 grid gap-3 md:grid-cols-3">
      <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
        <div className="text-xs font-bold uppercase text-amber-900">Re-checked each year (not ZK magic)</div>
        <ul className="mt-2 space-y-1 text-xs text-slate-700">
          {yearlyNormal.map((x) => (
            <li key={x}>• {x}</li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3">
        <div className="text-xs font-bold uppercase text-violet-900">Proved by ZK only (no doc re-upload)</div>
        <ul className="mt-2 space-y-1 text-xs text-slate-700">
          {zkOncePrivate.map((x) => (
            <li key={x}>• {x}</li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3">
        <div className="text-xs font-bold uppercase text-blue-800">On-chain with proof</div>
        <ul className="mt-2 space-y-1 text-xs text-slate-700">
          {publicOnChain.map((x) => (
            <li key={x}>• {x}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-600">No PDF/CAP/caste file links in the transaction.</p>
      </div>
    </div>
  );
}
