pragma circom 2.1.6;

/*
  ZK-Samvidhan production circuit (Groth16)

  Private: income, incomeSalt, identitySecret, casteCategory, domicileMH,
           incomeCertHash, casteCertHash, merklePathElements[4], merklePathIndices[4]

  Public: subjectId, credentialHash, nullifierHash, policyId, epoch,
          incomeCommitment, merkleRoot

  Domains (field tags): 1=subject, 2=nullifier, 3=credential inner
*/

include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";

template MerkleProofPoseidon(levels) {
    signal input leaf;
    signal input root;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    signal left[levels];
    signal right[levels];
    signal levelHashes[levels + 1];
    component hashers[levels];

    levelHashes[0] <== leaf;

    var i;
    for (i = 0; i < levels; i++) {
        left[i] <== levelHashes[i] + pathIndices[i] * (pathElements[i] - levelHashes[i]);
        right[i] <== pathElements[i] + pathIndices[i] * (levelHashes[i] - pathElements[i]);
        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== left[i];
        hashers[i].inputs[1] <== right[i];
        levelHashes[i + 1] <== hashers[i].out;
    }

    root === levelHashes[levels];
}

template CasteAllowedForPolicy() {
    signal input policyId;
    signal input casteCategory;
    signal output ok;

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

    signal allowAll;
    allowAll <== eq1001.out + eq1101.out + eq1201.out;

    component eqSC = IsEqual();
    eqSC.in[0] <== casteCategory;
    eqSC.in[1] <== 6;

    component eqOBC = IsEqual();
    eqOBC.in[0] <== casteCategory;
    eqOBC.in[1] <== 3;

    component eqSBC = IsEqual();
    eqSBC.in[0] <== casteCategory;
    eqSBC.in[1] <== 4;

    component eqVJNT = IsEqual();
    eqVJNT.in[0] <== casteCategory;
    eqVJNT.in[1] <== 5;

    signal scOk;
    scOk <== eqSC.out;

    signal obcOk;
    obcOk <== eqOBC.out + eqSBC.out + eqVJNT.out;

    signal t1301;
    t1301 <== eq1301.out * scOk;
    signal t1401;
    t1401 <== eq1401.out * obcOk;
    ok <== allowAll + t1301 + t1401;
    ok === 1;
}

template ScholarshipEligibility() {
    signal input income;
    signal input incomeSalt;
    signal input identitySecret;
    signal input casteCategory;
    signal input domicileMH;
    signal input incomeCertHash;
    signal input casteCertHash;
    signal input merklePathElements[4];
    signal input merklePathIndices[4];

    signal input subjectId;
    signal input credentialHash;
    signal input nullifierHash;
    signal input policyId;
    signal input epoch;
    signal input incomeCommitment;
    signal input merkleRoot;

    component dom = IsEqual();
    dom.in[0] <== domicileMH;
    dom.in[1] <== 1;
    dom.out === 1;

    component incomeComm = Poseidon(2);
    incomeComm.inputs[0] <== income;
    incomeComm.inputs[1] <== incomeSalt;
    incomeCommitment === incomeComm.out;

    component subj = Poseidon(2);
    subj.inputs[0] <== identitySecret;
    subj.inputs[1] <== 1;
    subjectId === subj.out;

    component nullif = Poseidon(4);
    nullif.inputs[0] <== identitySecret;
    nullif.inputs[1] <== policyId;
    nullif.inputs[2] <== epoch;
    nullif.inputs[3] <== 2;
    nullifierHash === nullif.out;

    component credInner = Poseidon(5);
    credInner.inputs[0] <== incomeCommitment;
    credInner.inputs[1] <== incomeCertHash;
    credInner.inputs[2] <== casteCertHash;
    credInner.inputs[3] <== casteCategory;
    credInner.inputs[4] <== domicileMH;

    component cred = Poseidon(3);
    cred.inputs[0] <== subjectId;
    cred.inputs[1] <== policyId;
    cred.inputs[2] <== credInner.out;
    credentialHash === cred.out;

    component casteOk = CasteAllowedForPolicy();
    casteOk.policyId <== policyId;
    casteOk.casteCategory <== casteCategory;

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

    (eq1001.out + eq1101.out + eq1201.out + eq1301.out + eq1401.out) === 1;

    signal threshold;
    threshold <== eq1001.out * 800000
              + eq1101.out * 800000
              + eq1201.out * 800000
              + eq1301.out * 250000
              + eq1401.out * 100000;

    component leq = LessEqThan(32);
    leq.in[0] <== income;
    leq.in[1] <== threshold;
    leq.out === 1;

    component merkle = MerkleProofPoseidon(4);
    merkle.leaf <== credentialHash;
    merkle.root <== merkleRoot;
    for (var j = 0; j < 4; j++) {
        merkle.pathElements[j] <== merklePathElements[j];
        merkle.pathIndices[j] <== merklePathIndices[j];
    }
}

component main { public [subjectId, credentialHash, nullifierHash, policyId, epoch, incomeCommitment, merkleRoot] } = ScholarshipEligibility();
