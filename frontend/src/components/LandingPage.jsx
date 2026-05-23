/** Public landing — role selection + product overview */

export function LandingPage({ onChooseRole }) {
  return (
    <div className="landing-page">
      <section className="md-hero px-6 py-10 md:px-12 md:py-14">
        <div className="relative z-10 mx-auto max-w-4xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-blue-100">Government of Maharashtra</p>
          <h1
            className="mt-2 text-3xl font-bold leading-tight text-white md:text-5xl"
            style={{ fontFamily: "Roboto Slab, serif" }}
          >
            ZK‑Samvidhan Scholarship Portal
          </h1>
          <p className="mt-4 max-w-2xl text-base text-blue-50/95 md:text-lg">
            MahaDBT-style applications with zero-knowledge proofs: verify documents once, issue an on-chain credential, claim yearly
            without re-uploading caste, domicile, or admission files.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" className="md-btn md-btn-primary md-btn-lg bg-white text-blue-900 hover:bg-blue-50" onClick={() => onChooseRole("citizen")}>
              Apply as Student
            </button>
            <button type="button" className="md-btn md-btn-secondary md-btn-lg border-white/40 bg-white/10 text-white hover:bg-white/20" onClick={() => onChooseRole("issuer")}>
              Institute / Issuer
            </button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10 md:px-6">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              icon: "🔐",
              title: "Privacy by design",
              text: "Income, caste, and document contents stay in your browser witness. Chain sees only commitments and Groth16 proof.",
            },
            {
              icon: "📄",
              title: "Verify once",
              text: "First admission: all documents on IPFS. Renewal: income only — other attrs proven via ZK from first admission baseline.",
            },
            {
              icon: "⛓️",
              title: "MST testnet",
              text: "Registry credentials + Gate epoch claims on Maharashtra Scholarship Testnet with Poseidon Merkle roots.",
            },
          ].map((f) => (
            <div key={f.title} className="md-card p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="text-3xl" aria-hidden>
                {f.icon}
              </div>
              <h3 className="mt-3 text-lg font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 md-card p-6 md:p-8">
          <h2 className="text-xl font-bold text-slate-900" style={{ fontFamily: "Roboto Slab, serif" }}>
            How it works
          </h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-4">
            {[
              ["1", "Profile & schemes", "Fill student details, pick eligible MahaDBT scheme."],
              ["2", "Documents", "Upload income + one-time certs to IPFS (Pinata)."],
              ["3", "Institute issue", "Issuer verifies PDFs, publishes credential hash on-chain."],
              ["4", "ZK claim", "Annual Groth16 proof — no document re-upload."],
            ].map(([n, title, desc]) => (
              <li key={n} className="relative rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">{n}</span>
                <div className="mt-3 font-semibold text-slate-900">{title}</div>
                <p className="mt-1 text-xs text-slate-600">{desc}</p>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="md-card-flat p-6">
            <div className="text-2xl" aria-hidden>
              🎓
            </div>
            <h3 className="mt-2 text-lg font-semibold text-slate-900">Citizen portal</h3>
            <p className="mt-2 text-sm text-slate-600">Submit application, print preview, receive credential, claim per academic year.</p>
            <button type="button" className="md-btn md-btn-primary md-btn-md mt-4" onClick={() => onChooseRole("citizen")}>
              Continue as Citizen
            </button>
          </div>
          <div className="md-card-flat p-6">
            <div className="text-2xl" aria-hidden>
              🏛️
            </div>
            <h3 className="mt-2 text-lg font-semibold text-slate-900">Issuer desk</h3>
            <p className="mt-2 text-sm text-slate-600">Review queue, verify income & docs, issue credentials, update Merkle root.</p>
            <button type="button" className="md-btn md-btn-secondary md-btn-md mt-4" onClick={() => onChooseRole("issuer")}>
              Continue as Issuer
            </button>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-slate-500">
          PCCOE Cyber Security Honors · ZK-Samvidhan · MST Testnet demo — not an official MahaDBT production site.
        </p>
      </section>
    </div>
  );
}
