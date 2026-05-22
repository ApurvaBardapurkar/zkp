/**
 * Application queue persistence (pick first available backend):
 * 1. Vercel KV / Upstash REST (KV_REST_API_* or UPSTASH_REDIS_REST_*)
 * 2. Pinata JSON index (only PINATA_JWT — no Vercel KV required)
 * 3. Local file (dev only)
 */

const fs = require("fs");
const path = require("path");
const axios = require("axios");

const APPS_KEY = "zk-samvidhan:applications:v1";
const PINATA_INDEX_NAME = "zk-samvidhan-applications-index";

function envTrim(key) {
  return String(process.env[key] || "").trim();
}

function createPersistence({ dataDir, isVercel }) {
  const appsFile = path.join(dataDir, "applications.json");
  const kvRestUrl = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "").trim();
  const kvRestToken = (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
  const hasKv = Boolean(kvRestUrl) && Boolean(kvRestToken);
  const pinataJwt = envTrim("PINATA_JWT");
  const hasPinata = Boolean(pinataJwt);

  let mode = "none";
  if (hasKv) mode = "kv";
  else if (hasPinata && isVercel) mode = "pinata";
  else if (!isVercel) mode = "file";

  function pinataAuth() {
    if (!pinataJwt) throw new Error("Missing PINATA_JWT");
    return { Authorization: `Bearer ${pinataJwt}` };
  }

  async function kvGetJson(key, fallback) {
    const r = await fetch(`${kvRestUrl}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${kvRestToken}` },
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
    const payload = JSON.stringify(value);
    const r = await fetch(`${kvRestUrl}/set/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${kvRestToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error(`KV set failed (${r.status})`);
  }

  async function readAppsPinata() {
    const auth = pinataAuth();
    const overrideCid = envTrim("APPLICATIONS_DATA_CID");
    let cid = overrideCid;

    if (!cid) {
      const list = await axios.get("https://api.pinata.cloud/data/pinList", {
        headers: auth,
        params: {
          status: "pinned",
          pageLimit: 1,
          sort: "DESC",
          name: PINATA_INDEX_NAME,
        },
      });
      const rows = list.data?.rows || [];
      if (rows.length === 0) return { applications: [] };
      cid = rows[0].ipfs_pin_hash;
    }

    const r = await axios.get(`https://gateway.pinata.cloud/ipfs/${cid}`, { timeout: 20000 });
    const data = r.data;
    if (!data || typeof data !== "object") return { applications: [] };
    if (!Array.isArray(data.applications)) return { applications: [] };
    return data;
  }

  async function writeAppsPinata(obj) {
    const auth = pinataAuth();
    const r = await axios.post(
      "https://api.pinata.cloud/pinning/pinJSONToIPFS",
      {
        pinataContent: obj,
        pinataMetadata: { name: PINATA_INDEX_NAME },
      },
      { headers: { ...auth, "Content-Type": "application/json" } }
    );
    console.log("Applications index pinned:", r.data?.IpfsHash);
    return r.data?.IpfsHash;
  }

  function ensureDataFile() {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(appsFile)) {
      fs.writeFileSync(appsFile, JSON.stringify({ applications: [] }, null, 2));
    }
  }

  async function readApps() {
    if (mode === "kv") {
      try {
        return await kvGetJson(APPS_KEY, { applications: [] });
      } catch (e) {
        console.error("KV read failed:", e);
        if (hasPinata) return await readAppsPinata();
        return { applications: [] };
      }
    }
    if (mode === "pinata") {
      try {
        return await readAppsPinata();
      } catch (e) {
        console.error("Pinata read failed:", e);
        return { applications: [] };
      }
    }
    if (mode === "file") {
      try {
        ensureDataFile();
        return JSON.parse(fs.readFileSync(appsFile, "utf8"));
      } catch (e) {
        console.error("File read failed:", e);
        return { applications: [] };
      }
    }
    return { applications: [] };
  }

  async function writeApps(obj) {
    if (mode === "kv") {
      try {
        await kvSetJson(APPS_KEY, obj);
        return;
      } catch (e) {
        console.error("KV write failed, trying Pinata:", e);
        if (hasPinata) {
          await writeAppsPinata(obj);
          return;
        }
        throw e;
      }
    }
    if (mode === "pinata") {
      await writeAppsPinata(obj);
      return;
    }
    if (mode === "file") {
      ensureDataFile();
      fs.writeFileSync(appsFile, JSON.stringify(obj, null, 2));
      return;
    }
    throw new Error(
      "No persistence backend. Set PINATA_JWT on Vercel (uses Pinata JSON index), or add Vercel KV / Upstash."
    );
  }

  function getStatus() {
    return { mode, hasKv, hasPinata, isVercel };
  }

  return { readApps, writeApps, getStatus };
}

module.exports = { createPersistence };
