const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");
const path = require("path");
const crypto = require("crypto");
const { createPersistence } = require("./persistence");
const { createMerkleStore } = require("./merkleStore");

function envTrim(key) {
  return String(process.env[key] || "").trim();
}

function createApp() {
  // index.js loads .env locally; Vercel injects env vars directly.
  if (!envTrim("PINATA_JWT")) {
    try {
      require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
    } catch {
      // ignore
    }
  }

  const app = express();
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: "2mb" }));

  const upload = multer({ storage: multer.memoryStorage() });

  const dataDir = path.join(__dirname, "data");
  const isVercel = Boolean(process.env.VERCEL);
  const { readApps, writeApps, getStatus } = createPersistence({ dataDir, isVercel });
  const persistStatus = getStatus();
  const merkleStore = createMerkleStore({ readApps, writeApps });

  function getPinataAuthHeader() {
    const jwt = envTrim("PINATA_JWT");
    if (!jwt) {
      throw new Error(
        "Missing PINATA_JWT. Add PINATA_JWT=your_jwt to the repo root .env (no space after =), restart: cd server && npm run dev"
      );
    }
    return { Authorization: `Bearer ${jwt}` };
  }

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      persistence: persistStatus.mode,
      persistenceNote:
        persistStatus.mode === "pinata"
          ? "Applications stored as JSON on IPFS via Pinata (no Vercel KV needed)"
          : persistStatus.mode === "kv"
            ? "Applications stored in Vercel KV / Upstash"
            : persistStatus.mode === "file"
              ? "Local file (dev)"
              : "Set PINATA_JWT on Vercel for automatic persistence",
      vercel: isVercel,
      pinata: Boolean(envTrim("PINATA_JWT")),
      pinataJwtLength: envTrim("PINATA_JWT").length,
    });
  });

  app.post("/pin/json", async (req, res) => {
    try {
      const auth = getPinataAuthHeader();
      const payload = req.body;
      const r = await axios.post("https://api.pinata.cloud/pinning/pinJSONToIPFS", payload, {
        headers: { ...auth, "Content-Type": "application/json" },
      });
      res.json(r.data);
    } catch (e) {
      const msg = e?.response?.data || e?.message || String(e);
      res.status(500).json({ error: typeof msg === "object" ? JSON.stringify(msg) : msg });
    }
  });

  app.post("/pin/file", upload.single("file"), async (req, res) => {
    try {
      const auth = getPinataAuthHeader();
      if (!req.file) return res.status(400).json({ error: "Missing file" });

      const data = new FormData();
      data.append("file", req.file.buffer, req.file.originalname);
      data.append("pinataMetadata", JSON.stringify({ name: req.file.originalname }));

      const r = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", data, {
        maxBodyLength: Infinity,
        headers: { ...data.getHeaders(), ...auth },
      });
      res.json(r.data);
    } catch (e) {
      const msg = e?.response?.data || e?.message || String(e);
      console.error("pin/file error:", msg);
      res.status(500).json({
        error: typeof msg === "object" ? JSON.stringify(msg) : msg,
        hint: "Check PINATA_JWT on the server (zkp-neon Vercel env or local .env).",
      });
    }
  });

  // --- Scholarship application queue (simple file persistence) ---
  app.get("/applications", async (req, res) => {
    try {
      const { applications } = await readApps();
      const status = req.query.status;
      const citizenAddress = (req.query.citizenAddress || "").toLowerCase();
      let out = applications;
      if (status) out = out.filter((a) => a.status === status);
      if (citizenAddress) out = out.filter((a) => (a.citizenAddress || "").toLowerCase() === citizenAddress);
      res.json({ applications: out });
    } catch (e) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  });

  app.post("/applications", async (req, res) => {
    try {
      const {
        citizenAddress,
        programKey,
        policyId,
        encryptedDocCid,
        incomeCertCid,
        incomeCertName,
        casteCertCid,
        casteCertName,
        applicationYear,
        applicantProfile,
        schemeKey,
        schemeName,
        department,
        applicationSnapshotCid,
        subjectId,
        credentialHash,
        incomeCommitment,
      } = req.body || {};
      if (!citizenAddress || !programKey || !policyId) {
        return res.status(400).json({ error: "Missing citizenAddress/programKey/policyId" });
      }
      const certCid = String(incomeCertCid || encryptedDocCid || "").trim();
      const casteCid = String(casteCertCid || "").trim();
      if (!certCid) {
        return res.status(400).json({ error: "Income certificate is required (upload PDF/image first)." });
      }
      if (!casteCid) {
        return res.status(400).json({ error: "Caste certificate is required (upload PDF/image first)." });
      }
      const store = await readApps();
      const appItem = {
        id: crypto.randomUUID(),
        citizenAddress: String(citizenAddress).trim(),
        programKey: String(programKey).trim(),
        policyId: String(policyId),
        encryptedDocCid: encryptedDocCid || certCid,
        incomeCertCid: certCid,
        incomeCertName: incomeCertName || "",
        casteCertCid: casteCertCid || "",
        casteCertName: casteCertName || "",
        applicationYear: String(applicationYear || new Date().getFullYear()),
        schemeKey: schemeKey || programKey,
        schemeName: schemeName || "",
        department: department || "",
        applicantProfile: applicantProfile || null,
        applicationSnapshotCid: applicationSnapshotCid || "",
        subjectId: subjectId || "",
        credentialHash: credentialHash || "",
        incomeCommitment: incomeCommitment || "",
        status: "submitted",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        issuedTxHash: "",
      };
      store.applications.unshift(appItem);
      await writeApps(store);
      return res.status(201).json(appItem);
    } catch (e) {
      console.error("POST /applications error:", e);
      return res.status(500).json({ error: String(e?.message || e) });
    }
  });

  app.get("/merkle", async (_req, res) => {
    try {
      const store = await merkleStore.getState();
      res.json(store);
    } catch (e) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  });

  app.post("/merkle/leaf", async (req, res) => {
    try {
      const { leaf } = req.body || {};
      if (!leaf) return res.status(400).json({ error: "Missing leaf" });
      const store = await merkleStore.appendLeaf(leaf);
      res.json(store);
    } catch (e) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  });

  app.get("/merkle/proof/:leaf", async (req, res) => {
    try {
      const info = await merkleStore.getProofForLeaf(req.params.leaf);
      if (!info) return res.status(404).json({ error: "Leaf not in tree" });
      res.json(info);
    } catch (e) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  });

  app.patch("/applications/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { status, issuedTxHash, merkleRoot, merklePathElements, merklePathIndices, credentialHash, subjectId } =
        req.body || {};
      const store = await readApps();
      const idx = store.applications.findIndex((a) => a.id === id);
      if (idx === -1) return res.status(404).json({ error: "Not found" });
      if (status) store.applications[idx].status = status;
      if (issuedTxHash !== undefined) store.applications[idx].issuedTxHash = issuedTxHash;
      if (merkleRoot) store.applications[idx].merkleRoot = merkleRoot;
      if (merklePathElements) store.applications[idx].merklePathElements = merklePathElements;
      if (merklePathIndices) store.applications[idx].merklePathIndices = merklePathIndices;
      if (credentialHash) store.applications[idx].credentialHash = credentialHash;
      if (subjectId) store.applications[idx].subjectId = subjectId;
      store.applications[idx].updatedAt = new Date().toISOString();
      await writeApps(store);
      return res.json(store.applications[idx]);
    } catch (e) {
      console.error("PATCH /applications error:", e);
      return res.status(500).json({ error: String(e?.message || e) });
    }
  });

  return app;
}

module.exports = { createApp };

