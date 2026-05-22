const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

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
  const appsFile = path.join(dataDir, "applications.json");
  const appsKey = "zk-samvidhan:applications:v1";

  const isVercel = Boolean(process.env.VERCEL);
  const kvRestUrl = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "").trim();
  const kvRestToken = (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
  const hasVercelKv = Boolean(kvRestUrl) && Boolean(kvRestToken);

  async function kvGetJson(key, fallback) {
    const base = kvRestUrl;
    const token = kvRestToken;
    const r = await fetch(`${base}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) throw new Error(`KV get failed (${r.status})`);
    const data = await r.json();
    const raw = data?.result ?? null;
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  async function kvSetJson(key, value) {
    const base = kvRestUrl;
    const token = kvRestToken;
    const payload = JSON.stringify(value);
    const r = await fetch(`${base}/set/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error(`KV set failed (${r.status})`);
  }

  function ensureDataFile() {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(appsFile)) fs.writeFileSync(appsFile, JSON.stringify({ applications: [] }, null, 2));
  }

  async function readApps() {
    if (hasVercelKv) {
      try {
        return await kvGetJson(appsKey, { applications: [] });
      } catch (e) {
        console.error("KV read failed:", e);
        return { applications: [] };
      }
    }
    if (isVercel) {
      // Do not serve bundled applications.json on Vercel — it is read-only and misleads GET while POST fails.
      return { applications: [] };
    }
    try {
      ensureDataFile();
      const raw = fs.readFileSync(appsFile, "utf8");
      return JSON.parse(raw);
    } catch (e) {
      console.error("File read failed:", e);
      return { applications: [] };
    }
  }

  async function writeApps(obj) {
    if (hasVercelKv) {
      await kvSetJson(appsKey, obj);
      return;
    }
    if (isVercel) {
      throw new Error(
        "Persistence not configured on Vercel. Open the zkp-neon project → Storage → connect KV/Upstash → redeploy so KV_REST_API_URL and KV_REST_API_TOKEN are set."
      );
    }
    ensureDataFile();
    fs.writeFileSync(appsFile, JSON.stringify(obj, null, 2));
  }

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
      persistence: hasVercelKv ? "kv" : isVercel ? "none" : "file",
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

  app.patch("/applications/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { status, issuedTxHash } = req.body || {};
      const store = await readApps();
      const idx = store.applications.findIndex((a) => a.id === id);
      if (idx === -1) return res.status(404).json({ error: "Not found" });
      if (status) store.applications[idx].status = status;
      if (issuedTxHash !== undefined) store.applications[idx].issuedTxHash = issuedTxHash;
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

