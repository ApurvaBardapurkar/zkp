# Deploy ZK-Samvidhan on Vercel (frontend + backend)

Two Vercel projects:

| Project | Root folder | URL (example) |
|---------|-------------|---------------|
| **Backend** | `server` | https://zkp-neon.vercel.app |
| **Frontend** | `frontend` | https://scholarship-hazel.vercel.app |

---

## 1. Backend (`zkp-neon`)

1. Vercel → **Add Project** → Import GitHub `ApurvaBardapurkar/zkp`
2. **Root Directory:** `server`
3. Framework: **Other** (no override needed; `vercel.json` is in `server/`)
4. **Environment variables** (Production + Preview) — **minimum required:**

| Name | Value |
|------|--------|
| `PINATA_JWT` | Your Pinata JWT (no space after `=`) |

That is enough for **uploads** and **application queue** (stored as JSON on IPFS via Pinata).

5. **Optional** (faster DB than IPFS index):

| Name | Value |
|------|--------|
| `KV_REST_API_URL` | Vercel Storage → KV / Upstash |
| `KV_REST_API_TOKEN` | Same KV store |

6. Deploy → open `https://zkp-neon.vercel.app/health`  
   Expected with only Pinata: `"pinata":true,"persistence":"pinata"`  
   With KV: `"persistence":"kv"`

---

## 2. Frontend (`scholarship-hazel`)

1. New Vercel project → same repo
2. **Root Directory:** `frontend`
3. Framework: **Vite** (auto)
4. **Environment variables:**

| Name | Value |
|------|--------|
| `VITE_PINATA_PROXY_URL` | `https://zkp-neon.vercel.app` |
| `VITE_REGISTRY_ADDRESS` | `0x2eFAde234C17318E56a2F4021347D5930136188c` |
| `VITE_GATE_ADDRESS` | `0x5421baDaeA328eAbcdefD4BAa4F930d85F749330` |

**Do not swap these.** If `VITE_GATE_ADDRESS` is set to the Registry address, `claimed()` calls revert with empty data (`0x8a48fd45` on wrong contract).

5. Deploy → open your frontend URL.

---

## 3. ZK V2 stack (on-chain)

Deployed with `npm run circuit:build` then `npm run deploy:v2:mst`:

| Contract | Address |
|----------|---------|
| Registry V2 | `0x2eFAde234C17318E56a2F4021347D5930136188c` |
| Gate V2 | `0x5421baDaeA328eAbcdefD4BAa4F930d85F749330` |
| Verifier | `0xb96dE41d804bb6ef6482DDC54b512cBdd6868aD5` |

Circuit: `scholarshipEligibility.circom` — Poseidon identity, income commitment, caste/domicile, Merkle leaf proof.

---

## 4. After deploy — quick test

1. `/health` on backend → `pinata: true`, `persistence: kv`
2. Citizen → Connect wallet → upload income + caste cert (Choose file → Upload)
3. Issuer → see pending application + both IPFS links

---

## Troubleshooting

- **Upload fails / pinata false:** `PINATA_JWT` missing on **backend** project only.
- **POST /applications 500:** KV not linked on backend; redeploy after adding KV.
- **Frontend hits wrong API:** Rebuild frontend after setting `VITE_PINATA_PROXY_URL` (Vite embeds env at build time).
