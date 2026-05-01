import axios from "axios";
import "dotenv/config";

async function main() {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    throw new Error("Missing PINATA_JWT in .env");
  }

  // Example payload. Replace with your own metadata.
  const json = {
    schema: "zk-samvidhan/credential-metadata@1",
    issuedAt: new Date().toISOString(),
    note: "Store only NON-PII metadata here. Put encrypted documents in pinFileToIPFS.",
  };

  const res = await axios.post("https://api.pinata.cloud/pinning/pinJSONToIPFS", json, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
  });

  console.log("Pinned JSON CID:", res.data.IpfsHash);
}

main().catch((e) => {
  console.error(e?.response?.data || e);
  process.exitCode = 1;
});

