/** Upload files via backend Pinata proxy with clear errors. */

export async function pinFileToIpfs(proxyUrl, file) {
  if (!file) throw new Error("Choose a file first.");
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("File too large (max 5 MB). MahaDBT allows 15 KB–256 KB for certificates — compress if needed.");
  }

  const form = new FormData();
  form.append("file", file, file.name || "document");

  const r = await fetch(`${proxyUrl}/pin/file`, { method: "POST", body: form });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `Upload failed (HTTP ${r.status}). Backend at ${proxyUrl} did not return JSON.\n` +
        `Ensure the server is running and PINATA_JWT is set.\n` +
        `Preview: ${text.slice(0, 280)}`
    );
  }
  if (!r.ok) {
    const err =
      typeof data?.error === "string"
        ? data.error
        : typeof data?.error === "object"
          ? JSON.stringify(data.error)
          : data?.message || `HTTP ${r.status}`;
    throw new Error(err);
  }
  const cid = data.IpfsHash || data.Hash || data.cid;
  if (!cid) throw new Error("Pinata response missing IpfsHash CID.");
  return cid;
}

export async function pinJsonToIpfs(proxyUrl, jsonPayload) {
  const r = await fetch(`${proxyUrl}/pin/json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(jsonPayload),
  });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`JSON pin failed (${r.status}): ${text.slice(0, 200)}`);
  }
  if (!r.ok) throw new Error(typeof data?.error === "string" ? data.error : JSON.stringify(data?.error || data));
  return data.IpfsHash;
}
