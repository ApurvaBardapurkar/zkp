/**
 * Single source of truth for MST testnet V2 contracts.
 * Env vars override defaults on Vercel (scholarship-hazel).
 */
const DEFAULT_REGISTRY_V2 = "0x2eFAde234C17318E56a2F4021347D5930136188c";
const DEFAULT_GATE_V2 = "0x5421baDaeA328eAbcdefD4BAa4F930d85F749330";
const DEFAULT_VERIFIER_V2 = "0xb96dE41d804bb6ef6482DDC54b512cBdd6868aD5";

export const MST_RPC_URL = "https://testnetrpc.mstblockchain.com";
export const MST_EXPLORER = "https://testnet.mstscan.com";
export const MST_CHAIN_ID_DEC = 91562037;
export const MST_CHAIN_ID_HEX = "0x05752B65";

export const REGISTRY_ADDRESS =
  import.meta.env.VITE_REGISTRY_ADDRESS || DEFAULT_REGISTRY_V2;
export const GATE_ADDRESS = import.meta.env.VITE_GATE_ADDRESS || DEFAULT_GATE_V2;
export const VERIFIER_ADDRESS = DEFAULT_VERIFIER_V2;

export const registryAbi = [
  "function admin() view returns (address)",
  "function setIssuer(address issuer, bool allowed) external",
  "function issueCredential(bytes32 subjectId, bytes32 credentialHash, string encryptedDocCid, bytes32 newMerkleRoot, uint256 expiresAt) external",
  "function revokeCredential(bytes32 credentialHash) external",
  "function isIssuer(address) view returns (bool)",
  "function credentialHashBySubject(bytes32) view returns (bytes32)",
  "function nullifierUsed(bytes32) view returns (bool)",
  "function revokedCredential(bytes32) view returns (bool)",
  "function merkleRoot() view returns (bytes32)",
  "function leafCount() view returns (uint256)",
  "event CredentialIssued(bytes32 indexed subjectId, bytes32 indexed credentialHash, string encryptedDocCid, bytes32 merkleRoot, uint256 expiresAt)",
  "event CredentialRevoked(bytes32 indexed credentialHash, address indexed revoker)",
];

export const gateAbi = [
  "function verifyAndClaim(uint256[2] a, uint256[2][2] b, uint256[2] c, uint256[7] input) external",
  "function claimed(bytes32 subjectId, uint256 policyId, uint256 epoch) view returns (bool)",
  "function registry() view returns (address)",
  "event VerifiedAndClaimed(bytes32 indexed subjectId, bytes32 indexed nullifierHash, uint256 indexed policyId, uint256 epoch, address caller)",
];

export function addrLink(address) {
  return `${MST_EXPLORER}/address/${address}`;
}

export function txLink(hash) {
  return `${MST_EXPLORER}/tx/${hash}`;
}

export function shortAddr(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Throws if Gate/Registry env vars are swapped or mismatched on-chain. */
export async function assertChainConfig(ethers, readProvider) {
  if (REGISTRY_ADDRESS.toLowerCase() === GATE_ADDRESS.toLowerCase()) {
    throw new Error(
      `VITE_GATE_ADDRESS must not equal VITE_REGISTRY_ADDRESS. Registry=${REGISTRY_ADDRESS} Gate must be ${DEFAULT_GATE_V2}`
    );
  }
  const gate = new ethers.Contract(GATE_ADDRESS, gateAbi, readProvider);
  const linked = await gate.registry();
  if (linked.toLowerCase() !== REGISTRY_ADDRESS.toLowerCase()) {
    throw new Error(
      `Gate ${shortAddr(GATE_ADDRESS)} is not wired to Registry ${shortAddr(REGISTRY_ADDRESS)} (gate.registry()=${shortAddr(linked)})`
    );
  }
}

export function registryContract(ethers, providerOrSigner) {
  return new ethers.Contract(REGISTRY_ADDRESS, registryAbi, providerOrSigner);
}

export function gateContract(ethers, providerOrSigner) {
  return new ethers.Contract(GATE_ADDRESS, gateAbi, providerOrSigner);
}
