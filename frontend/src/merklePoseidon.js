import { getPoseidon, fieldToBytes32 } from "./zkCrypto.js";

const SNARK_FIELD = BigInt(
  "21888242871839275222246405745257275088548364400416034343698204186575808495617"
);

const TREE_DEPTH = 4;
const MAX_LEAVES = 1 << TREE_DEPTH;

/** Append leaf and return { root, pathElements, pathIndices, leafCount }. */
export async function appendLeafPoseidon(existingLeaves, leafBigInt) {
  const leaves = [...existingLeaves.map((x) => BigInt(x)), BigInt(leafBigInt)];
  if (leaves.length > MAX_LEAVES) {
    throw new Error(`Merkle tree full (max ${MAX_LEAVES} credentials). Redeploy with deeper tree.`);
  }

  const p = await getPoseidon();
  const hash2 = (a, b) => {
    const h = p([BigInt(a), BigInt(b)]);
    return p.F.toObject(h);
  };

  const padded = [...leaves];
  while (padded.length < MAX_LEAVES) padded.push(0n);

  const layers = [padded];
  for (let d = 0; d < TREE_DEPTH; d++) {
    const prev = layers[layers.length - 1];
    const next = [];
    for (let i = 0; i < prev.length; i += 2) {
      next.push(hash2(prev[i], prev[i + 1]));
    }
    layers.push(next);
  }

  const root = layers[TREE_DEPTH][0];
  const leafIndex = leaves.length - 1;
  const pathElements = [];
  const pathIndices = [];
  let idx = leafIndex;
  for (let d = 0; d < TREE_DEPTH; d++) {
    const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
    pathElements.push(layers[d][siblingIdx].toString());
    pathIndices.push((idx % 2).toString());
    idx = Math.floor(idx / 2);
  }

  return {
    root: fieldToBytes32(root),
    rootBigInt: root.toString(),
    pathElements,
    pathIndices,
    leafCount: leaves.length,
    leafHex: fieldToBytes32(leafBigInt),
  };
}

export function loadMerkleState() {
  try {
    const raw = localStorage.getItem("zk_merkle_leaves");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveMerkleState(leaves) {
  localStorage.setItem("zk_merkle_leaves", JSON.stringify(leaves));
}

export async function syncMerkleFromServer(proxyUrl) {
  const r = await fetch(`${proxyUrl}/merkle`);
  if (!r.ok) return loadMerkleState();
  const data = await r.json();
  if (Array.isArray(data.leaves)) {
    saveMerkleState(data.leaves);
    return data.leaves;
  }
  return loadMerkleState();
}

/** Build path for an existing leaf index from a fixed leaf list (depth 4). */
export async function buildMerkleProofForLeafIndex(leaves, leafIndex) {
  const p = await getPoseidon();
  const hash2 = (a, b) => {
    const h = p([BigInt(a), BigInt(b)]);
    return p.F.toObject(h);
  };

  const padded = leaves.map((x) => BigInt(x));
  while (padded.length < MAX_LEAVES) padded.push(0n);

  const layers = [padded];
  for (let d = 0; d < TREE_DEPTH; d++) {
    const prev = layers[layers.length - 1];
    const next = [];
    for (let i = 0; i < prev.length; i += 2) {
      next.push(hash2(prev[i], prev[i + 1]));
    }
    layers.push(next);
  }

  const pathElements = [];
  const pathIndices = [];
  let idx = leafIndex;
  for (let d = 0; d < TREE_DEPTH; d++) {
    const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
    pathElements.push(layers[d][siblingIdx].toString());
    pathIndices.push((idx % 2).toString());
    idx = Math.floor(idx / 2);
  }

  return {
    root: fieldToBytes32(layers[TREE_DEPTH][0]),
    rootBigInt: layers[TREE_DEPTH][0].toString(),
    pathElements,
    pathIndices,
  };
}

export async function pushLeafToServer(proxyUrl, leaf) {
  const r = await fetch(`${proxyUrl}/merkle/leaf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leaf: String(leaf) }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error || "Merkle update failed");
  if (Array.isArray(data.leaves)) saveMerkleState(data.leaves);
  return data;
}
