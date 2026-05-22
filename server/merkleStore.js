const crypto = require("crypto");

const TREE_DEPTH = 4;
const MAX_LEAVES = 1 << TREE_DEPTH;

function emptyStore() {
  return { leaves: [], updatedAt: new Date().toISOString() };
}

function createMerkleStore({ readApps, writeApps }) {
  async function readStore() {
    const { applications } = await readApps();
    const meta = applications.find((a) => a.id === "__merkle_store__");
    if (meta?.merkleData) return meta.merkleData;
    return emptyStore();
  }

  async function writeStore(store) {
    const data = await readApps();
    const idx = data.applications.findIndex((a) => a.id === "__merkle_store__");
    const row = {
      id: "__merkle_store__",
      citizenAddress: "0x0000000000000000000000000000000000000000",
      programKey: "MERKLE",
      policyId: "0",
      status: "meta",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      merkleData: store,
    };
    if (idx >= 0) data.applications[idx] = row;
    else data.applications.push(row);
    await writeApps(data);
    return store;
  }

  return {
    async getState() {
      return readStore();
    },
    async setLeaves(leaves) {
      const clean = leaves.map(String).slice(0, MAX_LEAVES);
      return writeStore({ leaves: clean, updatedAt: new Date().toISOString() });
    },
    async appendLeaf(leaf) {
      const store = await readStore();
      if (store.leaves.length >= MAX_LEAVES) {
        throw new Error(`Merkle tree full (max ${MAX_LEAVES} leaves)`);
      }
      const leafStr = String(leaf);
      if (store.leaves.includes(leafStr)) return store;
      store.leaves.push(leafStr);
      store.updatedAt = new Date().toISOString();
      return writeStore(store);
    },
    async getProofForLeaf(leaf) {
      const store = await readStore();
      const idx = store.leaves.indexOf(String(leaf));
      if (idx < 0) return null;
      return { leafIndex: idx, leaves: store.leaves };
    },
  };
}

module.exports = { createMerkleStore, TREE_DEPTH, MAX_LEAVES };
