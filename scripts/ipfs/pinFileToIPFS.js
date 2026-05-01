import fs from "fs";
import path from "path";
import axios from "axios";
import FormData from "form-data";
import "dotenv/config";

async function main() {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    throw new Error("Missing PINATA_JWT in .env");
  }

  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error('Usage: npm run ipfs:pin-file -- "path/to/file"');
  }

  const abs = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`File not found: ${abs}`);
  }

  const data = new FormData();
  data.append("file", fs.createReadStream(abs));
  data.append("pinataMetadata", JSON.stringify({ name: path.basename(abs) }));

  const res = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", data, {
    maxBodyLength: Infinity,
    headers: {
      ...data.getHeaders(),
      Authorization: `Bearer ${jwt}`,
    },
  });

  console.log("Pinned File CID:", res.data.IpfsHash);
}

main().catch((e) => {
  console.error(e?.response?.data || e);
  process.exitCode = 1;
});

