# ZK-Samvidhan: Verifiable Credentials + Groth16

## Three layers (do not confuse them)

| Layer | What happens | Blockchain? |
|-------|----------------|-------------|
| **1. Private verification** | Student uploads PDFs; institute opens IPFS and approves | No raw documents on-chain |
| **2. Verifiable credential** | Institute calls `issueCredential` with hashes + Merkle root | Yes — trust anchor |
| **3. ZK selective disclosure** | Student runs `snarkjs.groth16.fullProve` and `verifyAndClaim` | Yes — proof only |

Uploading PDFs to the issuer is **normal verification**.  
Storing hashes + Merkle leaf is **Web3 / VC issuance**.  
Proving eligibility without revealing documents or exact income is **ZK**.

## Circuit: `scholarshipEligibility.circom`

### Private inputs (never in public signals)

- `income`, `incomeSalt`
- `identitySecret`
- `casteCategory`, `domicileMH`
- `incomeCertHash`, `casteCertHash` (Poseidon/keccak of IPFS CIDs — not the files)
- `merklePathElements[4]`, `merklePathIndices[4]`

### Public inputs (on-chain via Gate)

1. `subjectId`
2. `credentialHash`
3. `nullifierHash`
4. `policyId`
5. `epoch`
6. `incomeCommitment`
7. `merkleRoot`

### Constraints (real ZK, not hash-only)

- Income ≤ policy threshold (`LessEqThan`)
- Caste allowed for policy (`CasteAllowedForPolicy`)
- Domicile Maharashtra
- `subjectId = Poseidon(identitySecret, 1)`
- `nullifierHash = Poseidon(identitySecret, policyId, epoch, 2)` — anti double-claim
- `credentialHash` binds subject, policy, income commitment, doc hashes, caste, domicile
- Merkle proof: `credentialHash` is a leaf under `merkleRoot`

## Annual renewal flow

1. **Citizen:** upload **only** new income PDF → `POST /applications/renewal`
2. **Issuer:** verify income → `issueCredential` with **new** `credentialHash` (new income commitment; same one-time doc hashes from first admission)
3. **Citizen:** ZK claim for that `epoch` — witness uses stored secrets + hashes; **no PDF re-upload**

First-admission one-time documents are verified once; later years reuse their **hash bindings** inside the credential, proven in ZK without re-disclosing files.

## Contracts (MST testnet V2)

- `ZKSamvidhanRegistryV2` — issue, Merkle root, nullifiers, revocation
- `ScholarshipGateGroth16EpochV2` — verify Groth16 + `claimed(subjectId, policyId, epoch)`

## What this project is

**Credential-based scholarship verification with a Groth16 privacy layer** — aligned with W3C Verifiable Credentials mentally (issuer → holder → verifier), implemented with Poseidon credentials and Groth16 instead of JWT.
