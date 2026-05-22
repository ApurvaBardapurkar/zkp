const path = require("path");
const dotenv = require("dotenv");

// Load repo-root .env before app (must run before createApp for /health pinata check).
const rootEnv = path.join(__dirname, "..", ".env");
dotenv.config({ path: rootEnv });
dotenv.config({ path: path.join(__dirname, ".env") });

const { createApp } = require("./app");

const app = createApp();

const port = Number(process.env.SERVER_PORT || "8787");
const pinataOk = Boolean((process.env.PINATA_JWT || "").trim());
app.listen(port, () => {
  console.log(`Pinata proxy server on http://localhost:${port}`);
  console.log(`Env: ${rootEnv} · PINATA_JWT: ${pinataOk ? "loaded" : "MISSING — add to .env and restart"}`);
});

