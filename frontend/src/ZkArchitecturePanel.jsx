/**
 * Explains the three layers: private verification, on-chain credential, ZK claim.
 * Matches scholarshipEligibility.circom + Registry V2 + Gate V2.
 */

export function ZkArchitecturePanel({ compact = false }) {
  const layers = [
    {
      step: "1",
      title: "Private verification (off-chain)",
      color: "slate",
      body: "Student uploads PDFs to IPFS via the portal. Only the institute (issuer) reviews files. Nothing raw is written to the blockchain.",
      items: ["Income certificate (each year)", "One-time docs at first admission: caste, ration, domicile, CAP, admission"],
    },
    {
      step: "2",
      title: "Verifiable credential (on-chain)",
      color: "blue",
      body: "After manual verification, the issuer publishes a credential: Poseidon hashes + Merkle leaf. This is Web3 trust — not the PDFs.",
      items: [
        "subjectId (pseudonymous Citizen ID)",
        "credentialHash (binds policy, income commitment, doc hashes, caste, domicile)",
        "merkleRoot + expiry",
      ],
    },
    {
      step: "3",
      title: "ZK claim — selective disclosure (Groth16)",
      color: "violet",
      body: "Each academic year the student generates a proof in the browser. No PDFs are sent again. The chain only sees the proof + 7 public fields.",
      items: [
        "Proves: same student (identity secret → subjectId)",
        "Proves: institute-issued credential (Merkle membership)",
        "Proves: eligible caste category for policy (private)",
        "Proves: Maharashtra domicile (private)",
        "Proves: income ≤ scheme limit (private amount; public commitment)",
        "Proves: one-time doc hashes still match credential (private — not IPFS links)",
        "Public on-chain: subjectId, credentialHash, nullifier, policy, epoch, incomeCommitment, merkleRoot",
      ],
    },
  ];

  if (compact) {
    return (
      <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3 text-xs text-slate-800">
        <strong className="text-violet-900">Credential + ZK:</strong> PDFs → issuer verifies → on-chain hash credential → yearly Groth16 claim without re-uploading documents.
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

      <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-xs text-slate-700">
        <strong>At renewal / claim</strong> the student does <em>not</em> send caste certificate, ration card, or full profile again. The proof shows eligibility from the{" "}
        <span className="font-semibold">already-issued credential</span> plus private witnesses (income, category, doc hashes). Only the institute re-verifies{" "}
        <strong>new income PDF</strong> off-chain before re-issuing an updated credential for that year.
      </div>
    </div>
  );
}

/** What the circom circuit checks (for claim step). */
export function ZkClaimProofChecklist() {
  const privateWitness = [
    "Income amount (₹)",
    "Income salt (per academic year)",
    "Identity secret",
    "Caste category code",
    "Domicile flag",
    "Income cert hash (CID → field)",
    "Caste cert hash (CID → field)",
    "Merkle path to your credential leaf",
  ];
  const publicOnChain = [
    "subjectId",
    "credentialHash",
    "nullifierHash (one claim per year)",
    "policyId",
    "epoch (academic year)",
    "incomeCommitment (hide exact income)",
    "merkleRoot",
  ];

  return (
    <div className="mt-3 grid gap-3 md:grid-cols-2">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="text-xs font-bold uppercase text-slate-500">Stays private (witness)</div>
        <ul className="mt-2 space-y-1 text-xs text-slate-700">
          {privateWitness.map((x) => (
            <li key={x}>• {x}</li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3">
        <div className="text-xs font-bold uppercase text-blue-800">Published with proof (public)</div>
        <ul className="mt-2 space-y-1 text-xs text-slate-700">
          {publicOnChain.map((x) => (
            <li key={x}>• {x}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-600">No PDF, no IPFS link, no wallet address in the proof inputs.</p>
      </div>
    </div>
  );
}
