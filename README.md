## ZK‑Samvidhan (MVP on MST testnet)

This repo is a **working MVP scaffold** for:

- **Issuers** (gov/college/bank) issuing a **credential hash** + optional **encrypted document CID** (IPFS)
- **Citizens** proving eligibility with a **ZK proof** without revealing raw data
- **Apps** (scholarship/subsidy) verifying proof on-chain and using a **nullifier** to stop double-claims

### Critical security note (your message included secrets)

You pasted **Pinata API key/secret + JWT** in chat. Assume they are **compromised**.

- **Action**: revoke/rotate them in Pinata immediately
- This repo **does not** hardcode secrets. Use `.env` (see `.env.example`)

### Networks

- **MST testnet RPC**: `https://testnetrpc.mstblockchain.com`
- **ChainId**: `91562037`
- **Explorer**: `https://testnet.mstscan.com`

### What’s implemented (on-chain)

- `contracts/ZKSamvidhanRegistry.sol`
  - issuer allowlist
  - credential hash + encrypted CID storage (no raw PII)
  - `nullifierUsed` to prevent replay/double-claim
- `contracts/ScholarshipGate.sol`
  - expects a Groth16 verifier (for MVP we deploy `MockGroth16Verifier` that always returns true)

### Quick start

1) Install deps

```bash
npm i
```

### Run the full dApp (frontend + IPFS server)

You now have:

- **Frontend** (React + Tailwind + Wallet + in-browser Groth16 proof): `frontend/`
- **Backend** (Pinata proxy so JWT stays secret): `server/`

Start backend (Pinata proxy):

```bash
cd server
npm i
npm run dev
```

Start frontend:

```bash
cd frontend
npm i
copy .env.example .env
npm run dev -- --host
```

Open: `http://localhost:5173`

### One-click run (Windows)

From repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .\run-all.ps1
```

2) Create `.env`

```bash
copy .env.example .env
```

Fill:

- `DEPLOYER_PRIVATE_KEY` (funded on MST testnet)
- `MST_RPC_URL`
- `PINATA_JWT` (new/rotated)

3) Compile + deploy

```bash
npm run compile
npm run deploy:mst
```

### IPFS (Pinata) pinning

Pin JSON metadata (non‑PII only):

```bash
npm run ipfs:pin-json
```

Pin a file (recommended: **encrypt the PDF first**, then pin):

```bash
npm run ipfs:pin-file -- "path/to/encrypted.pdf"
```

### ZK proof (next step)

This scaffold is prepared for Groth16 verification via `IGroth16Verifier`.

To make it fully ZK end‑to‑end (Groth16):

1) Install Circom (required)

- Circom isn’t installed on your machine yet (`circom` not found).
- Install it, then confirm:

```bash
circom --version
```

2) Generate the verifier contract + example proof

Run the PowerShell build:

```powershell
powershell -ExecutionPolicy Bypass -File .\circuits\build_groth16.ps1
```

This generates:

- `circuits/build/IncomeEligibilityVerifier.sol`
- `circuits/build/proof.json`
- `circuits/build/public.json`

3) Copy the verifier into the contracts folder (overwrite placeholder)

```powershell
Copy-Item .\circuits\build\IncomeEligibilityVerifier.sol .\contracts\verifiers\IncomeEligibilityVerifier.sol -Force
```

Important: the generated contract name is **`Verifier`** by default (snarkjs output).

4) Compile and deploy the real verifier

```bash
npm run compile
npm run deploy:verifier:mst
```

5) Deploy a Groth16-ready gate + verifier on MST testnet

Because snarkjs verifiers use **fixed-size public signal arrays**, this repo includes a compatible gate:
`contracts/ScholarshipGateGroth16.sol`.

Deploy both (reads `REGISTRY_ADDRESS` from `.env`):

```bash
npm run deploy:realzk:mst
```

6) Generate calldata for the example proof and test verification

```bash
npx snarkjs zkey export soliditycalldata .\\circuits\\build\\public.json .\\circuits\\build\\proof.json
```

Use the printed values to call `ScholarshipGateGroth16.verifyAndClaim(a,b,c,input)` from a script / frontend.

### Live deployed addresses (your current deployment)

- Registry: `0x2E6868823759c648015550f9a2dE666ded78b14f`
- ScholarshipGateGroth16: `0x1742865959509B986383286b062e569eA79eCFe7`
- Groth16Verifier: `0xfF5F2E0f1C021e3cB10a4B203a2298568D7fb928`

### Maharashtra scholarship examples (included in UI)

The frontend includes a **program selector** with MahaDBT-style scheme examples and income limits:

- TFWS: ≤ ₹8,00,000/year
- EBC: ≤ ₹8,00,000/year
- GOI Post Matric (SC): ≤ ₹2,50,000/year
- Post-Matric (OBC/SBC/VJNT) scholarship tier: ≤ ₹1,00,000/year
- Dr. Panjabrao Deshmukh Vastigruh Nirvah Bhatta (Hostel Allowance): ≤ ₹8,00,000/year

These are used as **demo policies** to auto-fill `policyId` and the ZK threshold. Always verify the latest official rules on MahaDBT for production use.

