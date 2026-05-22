# ZK-Samvidhan V2 — Full ZK Stack

## What changed

| Phase | Feature |
|-------|---------|
| 1 | Real **family income** in proofs (from profile), **Poseidon income commitment** |
| 2 | **Credential hash** derived in-circuit (binds certs + caste + domicile) |
| 3 | **Caste + domicile** constraints per `policyId` |
| 4 | **Secret-based** `subjectId` + **epoch nullifier** (not wallet-derived) |
| 5 | **Merkle tree** (depth 4) for issued credentials, **revocation** + **expiry** on registry |

## Commands

```bash
npm run circuit:build          # circom + groth16 + copy wasm to frontend/public/zk
npm run deploy:v2:mst          # Registry V2 + Verifier + Gate V2 on MST testnet
cd frontend && npm run build
cd server && npm run dev
```

## Deployed addresses (MST testnet)

See `deployments/scholarship-v2.json`:

- **Registry V2:** `0x2eFAde234C17318E56a2F4021347D5930136188c`
- **Gate V2:** `0x5421baDaeA328eAbcdefD4BAa4F930d85F749330`
- **Verifier:** `0xb96dE41d804bb6ef6482DDC54b512cBdd6868aD5`

## Vercel env (frontend)

```
VITE_PINATA_PROXY_URL=https://zkp-neon.vercel.app
VITE_REGISTRY_ADDRESS=0x2eFAde234C17318E56a2F4021347D5930136188c
VITE_GATE_ADDRESS=0x5421baDaeA328eAbcdefD4BAa4F930d85F749330
```

Backend: `PINATA_JWT` (unchanged). Merkle state: `GET/POST /merkle`, `GET /merkle/proof/:leaf`.

## Citizen flow

1. Profile includes **family annual income** (used privately in ZK).
2. On submit, app stores `subjectId`, `credentialHash`, `incomeCommitment` (from browser secret).
3. After issuer issues, claim uses `scholarshipEligibility.wasm` + `scholarship_final.zkey`.
4. Renewal: same income commitment; new nullifier per academic year.

## Issuer flow

1. Select pending application → Citizen ID + credential hash load from application.
2. Issue credential → updates on-chain **Merkle root** + stores path on application record.

## Caste codes (circuit)

OPEN=0, EWS=1, EBC=2, OBC=3, SBC=4, VJNT=5, SC=6, ST=7, PWD=8
