/**
 * One-time: copy local server/data/applications.json into Upstash/Vercel KV.
 * Usage (from repo root):
 *   KV_REST_API_URL=... KV_REST_API_TOKEN=... node scripts/seedKvApplications.js
 */
const fs = require("fs");
const path = require("path");

const key = "zk-samvidhan:applications:v1";
const base = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "").trim();
const token = (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();

if (!base || !token) {
  console.error("Set KV_REST_API_URL and KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_*).");
  process.exit(1);
}

const appsFile = path.join(__dirname, "..", "server", "data", "applications.json");
const raw = fs.readFileSync(appsFile, "utf8");
const payload = raw;

async function main() {
  const r = await fetch(`${base}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`KV set failed (${r.status}): ${t}`);
  }
  console.log("Seeded", key, "from", appsFile);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
