/** Citizen ZK claim readiness — on-chain credential is source of truth. */

export function ClaimStatusCard({
  hasIssuedCredential,
  canClaim,
  alreadyClaimed,
  epoch,
  issuedAppYear,
  onRefresh,
}) {
  if (alreadyClaimed) {
    return (
      <div className="md-card-flat border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl" aria-hidden>
            ✓
          </span>
          <div>
            <div className="font-semibold text-emerald-900">Already claimed for AY {epoch}</div>
            <p className="mt-1 text-sm text-emerald-800">Your eligibility for this year is recorded on MST testnet.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!hasIssuedCredential) {
    return (
      <div className="md-card-flat border-amber-200 bg-amber-50 p-4">
        <div className="font-semibold text-amber-900">Credential not on-chain yet</div>
        <p className="mt-1 text-sm text-amber-800">
          Wait for the institute to issue your credential after reviewing documents. Then return here.
        </p>
      </div>
    );
  }

  if (canClaim) {
    return (
      <div className="md-card-flat border-emerald-300 bg-gradient-to-r from-emerald-50 to-teal-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-semibold text-emerald-900">Ready to claim — AY {epoch}</div>
            <p className="mt-1 text-sm text-slate-700">
              Institute credential detected on-chain. Tap the button below to generate Groth16 proof (30–90 sec).
            </p>
            {issuedAppYear && String(issuedAppYear) !== String(epoch) ? (
              <p className="mt-2 text-xs text-amber-800">
                Note: portal record is for year {issuedAppYear}; you selected {epoch}. If claim fails, match academic year to
                issued credential.
              </p>
            ) : null}
          </div>
          <span className="md-chip md-chip-success">● Issued</span>
        </div>
        {onRefresh ? (
          <button type="button" className="mt-3 text-sm font-medium text-blue-700 hover:underline" onClick={onRefresh}>
            Refresh status
          </button>
        ) : null}
      </div>
    );
  }

  return null;
}
