# ZK-Samvidhan: Privacy-Preserving Maharashtra Scholarship Portal  
## Final Project Report (B.Tech — PCCOE)

**Student:** Apurva Bardapurkar  
**Project:** ZK-Samvidhan (Zero-Knowledge Scholarship Credential & Annual Claim System)  
**Platform:** MST Blockchain Testnet · IPFS (Pinata) · Vercel  
**Repository:** https://github.com/ApurvaBardapurkar/zkp  
**Report date:** May 2026  

---

## Abstract

Government scholarship portals such as **MahaDBT** require students to submit sensitive data—including family income, caste certificates, and bank details—every academic year. **ZK-Samvidhan** is a prototype portal that separates **trust** (institute verifies documents once) from **privacy** (student proves eligibility yearly using **Groth16 zero-knowledge proofs** without re-disclosing income on-chain or in the UI).

The system implements a MahaDBT-style citizen and issuer workflow, **IPFS document storage** via a Pinata-backed API, **on-chain credential registry (V2)** with Merkle commitments, and an **epoch gate** enforcing **one ZK claim per academic year** per student and scheme. Version 2 upgrades the cryptography from a demo circuit to a **Poseidon-based** credential model with income commitments, caste/domicile constraints, secret-based identity, and Merkle inclusion proofs.

---

## 1. Introduction

### 1.1 Problem statement

- Scholarship eligibility depends on **private attributes** (income, category, domicile).
- Re-uploading certificates annually increases **cost**, **fraud surface**, and **privacy risk**.
- Public blockchains are unsuitable for storing raw PII.

### 1.2 Objectives

1. Model a **Maharashtra DTE / MahaDBT-style** application and issuance flow.
2. Store application payloads and certificates on **IPFS** (hashes only on-chain).
3. Let a student prove **income ≤ policy threshold** without revealing exact income.
4. Bind proofs to **issuer-issued credentials**, **nullifiers**, and **academic year (epoch)**.
5. Deploy a working **web demo** on Vercel with MST testnet contracts.

### 1.3 Scope

| In scope | Out of scope (future work) |
|----------|----------------------------|
| Groth16 proof generation in browser | DigiLocker / zkTLS to government APIs |
| Institute manual verification of PDFs | Full BBS+ selective disclosure |
| 5 representative MahaDBT schemes | Mainnet production audit |
| MST testnet deployment | National-scale Merkle forest |

---

## 2. Background

### 2.1 Zero-knowledge proofs (ZKPs)

A prover convinces a verifier that a statement is true **without revealing why**. **Groth16** (on bn128) provides compact proofs verifiable in Solidity. **Circom** describes arithmetic circuits; **snarkjs** performs trusted setup and witness generation.

### 2.2 Related concepts

- **Commitment:** `incomeCommitment = Poseidon(income, salt)` hides income while allowing reuse at renewal.
- **Nullifier:** `Poseidon(secret, policyId, epoch)` prevents double-claim for the same year.
- **Credential hash:** Binds subject, policy, commitments, certificate hashes, caste, domicile.
- **Merkle tree:** Issuer accumulates credential leaves; student proves inclusion without revealing other students.

---

## 3. System architecture

```text
┌─────────────┐     HTTPS      ┌──────────────────┐     Pinata API    ┌──────┐
│   React     │ ──────────────►│  Node API        │ ────────────────► │ IPFS │
│  (Vite)     │   /applications│  (Vercel/local)  │   /pin/file/json  └──────┘
│  snarkjs    │                │  KV / Pinata JSON│
└──────┬──────┘                └──────────────────┘
       │ Groth16 tx
       ▼
┌──────────────────────────────────────────────────────────────┐
│ MST Testnet                                                   │
│  ZKSamvidhanRegistryV2  ──► credential + merkleRoot + revoke │
│  ScholarshipGateGroth16EpochV2 ──► verify proof + epoch map  │
│  ScholarshipGroth16Verifier ──► pairing check (7 public inputs)│
└──────────────────────────────────────────────────────────────┘
```

### 3.1 Roles

| Role | Responsibilities |
|------|------------------|
| **Citizen** | Profile, scheme selection, upload income + caste certs, print application, receive credential, annual ZK claim |
| **Issuer (institute)** | Review IPFS documents, issue on-chain credential + Merkle root |
| **Admin** | Allowlist issuers, optional verifier upgrade |

### 3.2 Academic year (epoch)

Claims are keyed by **epoch** (e.g. 2026, 2027). The gate stores `claimed[subjectId][policyId][epoch]` to enforce **one claim per year**.

---

## 4. Functional design (MahaDBT-style flow)

### 4.1 Citizen journey

1. Connect wallet (MST testnet).  
2. Select academic year and complete profile (caste, religion, income, college, PRN, etc.).  
3. View **eligible schemes** (filtered by caste, religion, income limit).  
4. Upload **income** and **caste** certificates to IPFS.  
5. Print/submit application (snapshot pinned as JSON).  
6. Wait for issuer; receive **Citizen ID** (`subjectId`) derived from a **browser-held ZK secret** (not wallet address).  
7. **Annual ZK claim:** generate Groth16 proof in-browser, call `verifyAndClaim` on gate.  
8. View claim status per year.

**Renewal:** After first issuance, citizen skips re-application; proof uses the same income commitment and new nullifier per year.

### 4.2 Issuer journey

1. Connect allowlisted wallet.  
2. List pending applications (server persistence: Vercel KV or Pinata JSON index).  
3. Review applicant profile and both certificate CIDs on IPFS gateway.  
4. Load `subjectId` and `credentialHash` from application record (computed at student submit).  
5. `issueCredential(subjectId, credentialHash, docCid, merkleRoot, expiresAt)` on Registry V2.  
6. PATCH application with Merkle path for student claims.

### 4.3 Scheme catalogue

Representative schemes with `policyId` mapped to circuit thresholds:

| policyId | Scheme (examples) | Income limit (INR/year) |
|----------|-------------------|-------------------------|
| 1001 | Panjabrao hostel allowance | 8,00,000 |
| 1101 | TFWS | 8,00,000 |
| 1201 | EBC / Shahu | 8,00,000 |
| 1301 | SC post-matric | 2,50,000 |
| 1401 | OBC/SBC/VJNT scholarship tier | 1,00,000 |

Caste rules enforced in circuit (e.g. SC-only for 1301; OBC/SBC/VJNT for 1401).

---

## 5. Technical implementation

### 5.1 Circuit: `scholarshipEligibility.circom`

**Private inputs:** `income`, `incomeSalt`, `identitySecret`, `casteCategory`, `domicileMH`, `incomeCertHash`, `casteCertHash`, `merklePathElements[4]`, `merklePathIndices[4]`

**Public inputs (7):** `subjectId`, `credentialHash`, `nullifierHash`, `policyId`, `epoch`, `incomeCommitment`, `merkleRoot`

**Constraints:**

- `income ≤ threshold(policyId)` (threshold fixed inside circuit).  
- `domicileMH == 1` (Maharashtra domicile).  
- Caste allowed set per policy.  
- Poseidon derivations for subject, nullifier, credential, income commitment.  
- Merkle inclusion of `credentialHash` under `merkleRoot` (depth 4, Poseidon hash).

**Build:** `npm run circuit:build` → `frontend/public/zk/scholarshipEligibility_js/*.wasm`, `scholarship_final.zkey`, Solidity verifier.

### 5.2 Smart contracts (V2)

| Contract | Purpose |
|----------|---------|
| `ZKSamvidhanRegistryV2` | Store credential per `subjectId`, Merkle root, nullifier consumption, revocation, expiry |
| `ScholarshipGroth16Verifier` | On-chain Groth16 verification (7 public signals) |
| `ScholarshipGateGroth16EpochV2` | Verify proof → assert credential + Merkle root → mark epoch claimed → consume nullifier |

### 5.3 Backend (`server/`)

- Express API: health, Pinata proxy (`/pin/file`, `/pin/json`), application CRUD.  
- Persistence: **Vercel KV** → else **Pinata JSON index** → else local file.  
- Merkle index: `GET/POST /merkle`, stores leaf list for proof reconstruction.

### 5.4 Frontend (`frontend/`)

- React + Vite + Tailwind.  
- `zkCrypto.js` — Poseidon (circomlibjs) aligned with circuit.  
- `merklePoseidon.js` — tree append/proof for issuer and citizen.  
- `mahadbtSchemes.js` — eligibility rules and validation.  
- `DocumentUploadField.jsx` — Windows-friendly upload UX.

### 5.5 Deployment

| Component | Host |
|-----------|------|
| Backend | Vercel project `zkp-neon` (root `server/`) |
| Frontend | Vercel project `scholarship-hazel` (root `frontend/`) |
| Contracts | MST testnet via Hardhat `npm run deploy:v2:mst` |

**Latest deployed addresses** (see `deployments/scholarship-v2.json`):

| Contract | Address |
|----------|---------|
| Registry V2 | `0x2eFAde234C17318E56a2F4021347D5930136188c` |
| Gate V2 | `0x5421baDaeA328eAbcdefD4BAa4F930d85F749330` |
| Verifier | `0xb96dE41d804bb6ef6482DDC54b512cBdd6868aD5` |

---

## 6. Security and privacy analysis

### 6.1 What is hidden

- Exact **family income** (only commitment + inequality proof).  
- **Identity secret** (wallet not equal to Citizen ID).  
- Raw certificates remain on IPFS; chain stores CIDs/hashes only.

### 6.1 What is leaked

- `policyId`, `epoch`, public hashes, claim transaction metadata.  
- IPFS CIDs are visible to anyone with the link (standard IPFS model).

### 6.2 Trust assumptions

- **Issuer** honestly verifies PDFs before issuance.  
- **Groth16 trusted setup** (demo powers of tau; production needs ceremony).  
- **Browser** stores `zk_identity_secret` — clearing storage breaks renewal unless re-issued.

### 6.3 Threat mitigations

| Threat | Mitigation |
|--------|------------|
| Double claim same year | Epoch mapping + nullifier |
| Replay proof | Nullifier registry |
| Fraudulent credential | Issuer allowlist + Merkle leaf registration |
| Revoked student | `revokeCredential` on registry |

---

## 7. Troubleshooting: `execution reverted` on `verifyAndClaim`

Your transaction targets **Gate V2** `0x5421baDaeA328eAbcdefD4BAa4F930d85F749330` with **policyId = 1001** and **epoch = 2026** — correct shape for V2.

Ethers shows `require(false)` with **empty revert data** when the RPC/node does not return custom error payloads. On Gate V2 the failure is almost always one of the following (in execution order):

### 7.1 Invalid ZK proof (most common)

**Cause:** Groth16 verifier returns `false` → `revert InvalidProof()` (selector `0x09bde339`).

Typical reasons:

1. **Merkle root / path mismatch** — Proof built with a Merkle path from the server/local list, but the transaction uses `merkleRoot` read from chain. If those roots differ, the circuit is unsatisfiable.  
   - *Fix:* Re-issue credential after clearing `/merkle` state, or ensure issuer and server share the same leaf order; use Merkle path stored on the **issued** application row.

2. **Wrong ZK artifacts on Vercel** — Production still serves old `incomeEligibility.wasm` / `circuit_final.zkey` (5 public inputs) while the gate expects **7** inputs.  
   - *Fix:* Redeploy frontend after `npm run circuit:build`; confirm `/zk/scholarship_final.zkey` exists.

3. **Identity secret changed** — Student cleared site data / new browser → new `subjectId` and `credentialHash` ≠ issuer record.  
   - *Fix:* Use same browser as application submit, or re-apply and re-issue.

4. **Income or certificates changed** after application — commitment no longer matches issued credential.  
   - *Fix:* Do not edit income/certs after submit; re-issue if needed.

### 7.2 Registry / gate mismatch

Gate `0x5421…` is bound at deploy to Registry `0x2eFAde…`.  

If frontend still uses fallback Registry `0x24811…` for **display checks** but the gate checks `0x2eFAde…`, you can pass UI pre-checks yet fail on-chain (or vice versa).

- *Fix:* Set both on Vercel and rebuild:

```env
VITE_REGISTRY_ADDRESS=0x2eFAde234C17318E56a2F4021347D5930136188c
VITE_GATE_ADDRESS=0x5421baDaeA328eAbcdefD4BAa4F930d85F749330
```

### 7.3 Credential not issued on this registry

`CredentialMissing` (`0x9e586322`) — no credential for your `subjectId` on the registry linked to the gate.

- *Fix:* Complete issuer flow on **V2** after redeploy; old V1 credentials do not migrate.

### 7.4 Merkle root mismatch (on-chain check)

`MerkleRootMismatch` (`0x0432f01c`) — `input[6]` ≠ `registry.merkleRoot()`.

- *Fix:* Issuer must pass the same root computed when appending the leaf; citizen proof must use that root.

### 7.5 Already claimed / nullifier used

- `AlreadyClaimedForEpoch` (`0x027b3aec`) — pick year 2027 or another open epoch.  
- `NullifierAlreadyUsed` (`0xcad2ae02`) — click **New nullifier** (new epoch) or use a fresh academic year.

### 7.6 Recommended debug checklist

1. MST explorer: confirm credential issued on `0x2eFAde…` for your Citizen ID.  
2. `registry.merkleRoot()` equals Merkle root in proof public inputs.  
3. Local: same browser, `localStorage` keys `zk_identity_secret`, `zk_income_salt` present.  
4. Application record has `merklePathElements`, `merklePathIndices`, `merkleRoot`.  
5. Frontend env + **rebuild** after any contract redeploy.

---

## 8. Testing performed

| Test | Result |
|------|--------|
| Circuit compile + Groth16 setup | Pass (`npm run circuit:build`) |
| Contract compile + deploy V2 | Pass (`deployments/scholarship-v2.json`) |
| Frontend production build | Pass (Vite bundle with circomlibjs) |
| Pinata upload + application queue | Pass with `PINATA_JWT` on backend |
| End-to-end claim | Requires aligned registry, Merkle path, and wasm/zkey (see §7) |

---

## 9. Limitations and future work

1. **Trusted setup** — demo PTAU; not production-grade ceremony.  
2. **Merkle depth 4** — max 16 credentials per demo tree.  
3. **Manual issuer verification** — no cryptographic proof of PDF authenticity.  
4. **IPFS privacy** — CIDs are public; optional client-side encryption (AES-GCM helper exists for advanced uploads).  
5. **Wallet linking** — optional; secret-based ID is stronger but device-bound.

**Future:** zkTLS/DigiLocker, BBS+ credentials, deeper Merkle trees, formal verification (Circomspect), L2 deployment, audit.

---

## 10. Conclusion

ZK-Samvidhan demonstrates how **zero-knowledge proofs** can support a **Maharashtra-style scholarship portal**: institutes attest eligibility once, students renew annually with privacy-preserving proofs, and smart contracts enforce **policy rules**, **credentials**, **Merkle membership**, and **one claim per academic year**. Version 2 replaces demo shortcuts with **Poseidon commitments**, **multi-attribute constraints**, and **unlinkable nullifiers**, suitable for a B.Tech project demonstration and as a foundation for production hardening.

---

## 11. References

1. Circom documentation — https://docs.circom.io  
2. snarkjs — https://github.com/iden3/snarkjs  
3. Groth16 paper — Groth, *On the Size of Pairing-based Non-interactive Arguments* (2016)  
4. Maharashtra MahaDBT portal — https://mahadbt.maharashtra.gov.in  
5. MST Blockchain testnet — project documentation / explorer  
6. Pinata IPFS API — https://docs.pinata.cloud  

---

## Appendix A — Environment variables

**Backend (Vercel `zkp-neon`):**

| Variable | Required |
|----------|----------|
| `PINATA_JWT` | Yes |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Optional |

**Frontend (Vercel `scholarship-hazel`):**

| Variable | Example |
|----------|---------|
| `VITE_PINATA_PROXY_URL` | `https://zkp-neon.vercel.app` |
| `VITE_REGISTRY_ADDRESS` | `0x2eFAde234C17318E56a2F4021347D5930136188c` |
| `VITE_GATE_ADDRESS` | `0x5421baDaeA328eAbcdefD4BAa4F930d85F749330` |

## Appendix B — NPM scripts

```bash
npm run circuit:build      # Build scholarship Groth16 artifacts
npm run deploy:v2:mst      # Deploy Registry V2 + Gate V2 + Verifier
cd frontend && npm run build
cd server && npm run dev
```

## Appendix C — Project structure

```text
ZKP/
├── circuits/scholarshipEligibility.circom
├── contracts/ZKSamvidhanRegistryV2.sol
├── contracts/ScholarshipGateGroth16EpochV2.sol
├── frontend/src/App.jsx, zkCrypto.js, merklePoseidon.js
├── server/app.js, persistence.js, merkleStore.js
├── scripts/buildScholarshipCircuit.js, deployScholarshipV2.js
└── deployments/scholarship-v2.json
```

---

*End of report*
