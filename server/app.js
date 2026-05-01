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

  function ensureDataFile() {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(appsFile)) fs.writeFileSync(appsFile, JSON.stringify({ applications: [] }, null, 2));
  }

  function readApps() {
    ensureDataFile();
    const raw = fs.readFileSync(appsFile, "utf8");
    return JSON.parse(raw);
  }

  function writeApps(obj) {
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
  app.get("/applications", (req, res) => {
    const { applications } = readApps();
    const status = req.query.status;
    const citizenAddress = (req.query.citizenAddress || "").toLowerCase();
    let out = applications;
    if (status) out = out.filter((a) => a.status === status);
    if (citizenAddress) out = out.filter((a) => (a.citizenAddress || "").toLowerCase() === citizenAddress);
    res.json({ applications: out });
  });

  app.post("/applications", (req, res) => {
    const { citizenAddress, programKey, policyId, encryptedDocCid } = req.body || {};
    if (!citizenAddress || !programKey || !policyId) {
      return res.status(400).json({ error: "Missing citizenAddress/programKey/policyId" });
    }
    const store = readApps();
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
    writeApps(store);
    res.json(appItem);
  });

  app.patch("/applications/:id", (req, res) => {
    const { id } = req.params;
    const { status, issuedTxHash } = req.body || {};
    const store = readApps();
    const idx = store.applications.findIndex((a) => a.id === id);
    if (idx === -1) return res.status(404).json({ error: "Not found" });
    if (status) store.applications[idx].status = status;
    if (issuedTxHash !== undefined) store.applications[idx].issuedTxHash = issuedTxHash;
    store.applications[idx].updatedAt = new Date().toISOString();
    writeApps(store);
    res.json(store.applications[idx]);
  });

  return app;
}

module.exports = { createApp };

