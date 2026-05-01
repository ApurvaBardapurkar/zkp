const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function createApp() {
  // Load env from root when running locally; on Vercel env is injected.
  try {
    // eslint-disable-next-line global-require
    require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
  } catch {
    // ignore
  }

  const app = express();
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: "2mb" }));

  const upload = multer({ storage: multer.memoryStorage() });

  const dataDir = path.join(__dirname, "data");
  const appsFile = path.join(dataDir, "applications.json");
  const appsKey = "zk-samvidhan:applications:v1";

  const isVercel = Boolean(process.env.VERCEL);
  const hasVercelKv =
    Boolean(process.env.KV_REST_API_URL) &&
    Boolean(process.env.KV_REST_API_TOKEN);

  async function kvGetJson(key, fallback) {
    const base = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;
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
    const base = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;
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
      return await kvGetJson(appsKey, { applications: [] });
    }
    ensureDataFile();
    const raw = fs.readFileSync(appsFile, "utf8");
    return JSON.parse(raw);
  }

  async function writeApps(obj) {
    if (hasVercelKv) {
      await kvSetJson(appsKey, obj);
      return;
    }
    // On Vercel, filesystem writes are not reliable; return a clear error.
    if (isVercel) {
      throw new Error("Persistence not configured. Enable Vercel KV (KV_REST_API_URL + KV_REST_API_TOKEN).");
    }
    ensureDataFile();
    fs.writeFileSync(appsFile, JSON.stringify(obj, null, 2));
  }

  function getPinataAuthHeader() {
    const jwt = (process.env.PINATA_JWT || "").trim();
    if (!jwt) throw new Error("Missing PINATA_JWT (set it in your server environment variables)");
    return { Authorization: `Bearer ${jwt}` };
  }

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
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
      res.status(500).json({ error: e?.response?.data || String(e) });
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
      res.status(500).json({ error: e?.response?.data || String(e) });
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
      const { citizenAddress, programKey, policyId, encryptedDocCid } = req.body || {};
      if (!citizenAddress || !programKey || !policyId) {
        return res.status(400).json({ error: "Missing citizenAddress/programKey/policyId" });
      }
      const store = await readApps();
      const appItem = {
        id: crypto.randomUUID(),
        citizenAddress,
        programKey,
        policyId: String(policyId),
        encryptedDocCid: encryptedDocCid || "",
        status: "submitted", // submitted | issued | rejected
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        issuedTxHash: "",
      };
      store.applications.unshift(appItem);
      await writeApps(store);
      res.json(appItem);
    } catch (e) {
      res.status(500).json({ error: String(e?.message || e) });
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
      res.json(store.applications[idx]);
    } catch (e) {
      res.status(500).json({ error: String(e?.message || e) });
    }
  });

  return app;
}

module.exports = { createApp };

