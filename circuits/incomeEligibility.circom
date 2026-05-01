pragma circom 2.1.6;

/*
  ZK-Samvidhan demo circuit (Groth16-ready)

  Proves:
    income <= threshold
  While binding to:
    subjectId, credentialHash, nullifierHash, policyId, epoch  (all PUBLIC)

  Notes:
  - This is a minimal demo circuit to generate a Solidity verifier.
  - For production, replace hash placeholders with Poseidon and make credentialHash derived
    from issuer-signed data / Merkle inclusion, etc.
*/

include "../node_modules/circomlib/circuits/comparators.circom";

template IncomeEligibility() {
    // PRIVATE
    signal input income;

    // PUBLIC (must match ScholarshipGate input ordering)
    signal input subjectId;
    signal input credentialHash;
    signal input nullifierHash;
    signal input policyId;
    signal input epoch;

    // Derive threshold from policyId inside the circuit (prevents user from "choosing" a higher threshold).
    // Supported policyIds must match the UI list and scheme mapping:
    // - 1001 (PANJABRAO_HOSTEL): 800000
    // - 1101 (TFWS): 800000
    // - 1201 (EBC): 800000
    // - 1301 (SC_POST_MATRIC): 250000
    // - 1401 (OBC_SBC_VJNT_SCHOLARSHIP): 100000
    //
    // If policyId isn't one of these, the proof is UNSAT (cannot be generated).
    signal threshold;

    component eq1001 = IsEqual();
    eq1001.in[0] <== policyId;
    eq1001.in[1] <== 1001;

    component eq1101 = IsEqual();
    eq1101.in[0] <== policyId;
    eq1101.in[1] <== 1101;

    component eq1201 = IsEqual();
    eq1201.in[0] <== policyId;
    eq1201.in[1] <== 1201;

    component eq1301 = IsEqual();
    eq1301.in[0] <== policyId;
    eq1301.in[1] <== 1301;

    component eq1401 = IsEqual();
    eq1401.in[0] <== policyId;
    eq1401.in[1] <== 1401;

    // Must match exactly one supported policy.
    (eq1001.out + eq1101.out + eq1201.out + eq1301.out + eq1401.out) === 1;

    // Compute threshold using a selector sum.
    threshold <== eq1001.out * 800000
              + eq1101.out * 800000
              + eq1201.out * 800000
              + eq1301.out * 250000
              + eq1401.out * 100000;

    // Enforce income <= threshold (32-bit) using circomlib LessEqThan
    component leq = LessEqThan(32);
    leq.in[0] <== income;
    leq.in[1] <== threshold;
    leq.out === 1;

    // epoch is carried as a public input so the on-chain gate can enforce
    // one claim per (subjectId, policyId, epoch). We don't constrain its range here.
}

component main { public [subjectId, credentialHash, nullifierHash, policyId, epoch] } = IncomeEligibility();

