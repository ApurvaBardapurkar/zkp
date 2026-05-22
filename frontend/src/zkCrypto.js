import { ethers } from "ethers";
import { buildPoseidon } from "circomlibjs";

const SNARK_FIELD = BigInt(
  "21888242871839275222246405745257275088548364400416034343698204186575808495617"
);

const CASTE_TO_NUM = {
  OPEN: 0,
  EWS: 1,
  EBC: 2,
  OBC: 3,
  SBC: 4,
  VJNT: 5,
  SC: 6,
  ST: 7,
  PWD: 8,
};

let poseidonPromise;

export async function getPoseidon() {
  if (!poseidonPromise) poseidonPromise = buildPoseidon();
  return poseidonPromise;
}

export function fieldToBytes32(n) {
  let hex = BigInt(n).toString(16);
  if (hex.length > 64) hex = hex.slice(hex.length - 64);
  return "0x" + hex.padStart(64, "0");
}

export function bytes32ToBigInt(hex) {
  return BigInt(hex) % SNARK_FIELD;
}

export function randomField() {
  return fieldToBytes32(ethers.hexlify(ethers.randomBytes(32)));
}

export function casteToNum(caste) {
  const v = CASTE_TO_NUM[String(caste || "OPEN").toUpperCase()];
  return v === undefined ? 0 : v;
}

export async function poseidon2(a, b) {
  const p = await getPoseidon();
  const h = p([BigInt(a), BigInt(b)]);
  return p.F.toObject(h);
}

export async function poseidon3(a, b, c) {
  const p = await getPoseidon();
  const h = p([BigInt(a), BigInt(b), BigInt(c)]);
  return p.F.toObject(h);
}

export async function poseidon4(a, b, c, d) {
  const p = await getPoseidon();
  const h = p([BigInt(a), BigInt(b), BigInt(c), BigInt(d)]);
  return p.F.toObject(h);
}

export async function poseidon5(a, b, c, d, e) {
  const p = await getPoseidon();
  const h = p([BigInt(a), BigInt(b), BigInt(c), BigInt(d), BigInt(e)]);
  return p.F.toObject(h);
}

/** IPFS CID → field element (stable, no PII). */
export function cidToField(cid) {
  if (!cid) return 0n;
  const h = ethers.keccak256(ethers.toUtf8Bytes(String(cid)));
  return bytes32ToBigInt(h);
}

export async function incomeCommitment(income, incomeSalt) {
  return poseidon2(income, incomeSalt);
}

export async function deriveSubjectId(identitySecret) {
  return poseidon2(identitySecret, 1);
}

export async function deriveNullifierHash(identitySecret, policyId, epoch) {
  return poseidon4(identitySecret, policyId, epoch, 2);
}

export async function deriveCredentialHash({
  subjectId,
  policyId,
  incomeCommitment: incComm,
  incomeCertHash,
  casteCertHash,
  casteCategory,
  domicileMH,
}) {
  const inner = await poseidon5(incComm, incomeCertHash, casteCertHash, casteCategory, domicileMH);
  return poseidon3(subjectId, policyId, inner);
}

export function getOrCreateIdentitySecret() {
  let sk = localStorage.getItem("zk_identity_secret");
  if (!sk) {
    sk = randomField();
    localStorage.setItem("zk_identity_secret", sk);
  }
  return sk;
}

export function getOrCreateIncomeSalt() {
  return getOrCreateIncomeSaltForYear(new Date().getFullYear());
}

/** Per academic year — income can change; new salt each epoch. */
export function getOrCreateIncomeSaltForYear(year) {
  const key = `zk_income_salt_${year}`;
  let salt = localStorage.getItem(key);
  if (!salt) {
    salt = randomField();
    localStorage.setItem(key, salt);
  }
  return salt;
}

/** One-time doc hash bindings from first admission — used at ZK claim without re-reading PDFs. */
const BASELINE_KEY = "zk_first_admission_baseline";

export function saveFirstAdmissionBaseline({ casteCertCid, caste, domicileMH, oneTimeDocs }) {
  const ot = oneTimeDocs || {};
  const payload = {
    caste: caste || "OPEN",
    domicileMH: domicileMH !== false,
    casteCertCid: casteCertCid || ot.casteCert?.cid || "",
    rationCardCid: ot.rationCard?.cid || "",
    domicileCertCid: ot.domicileCert?.cid || "",
    capIdCertCid: ot.capIdCert?.cid || "",
    admissionLetterCid: ot.admissionLetter?.cid || "",
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(BASELINE_KEY, JSON.stringify(payload));
}

export function loadFirstAdmissionBaseline() {
  try {
    const raw = localStorage.getItem(BASELINE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function buildZkIdentityBundle({
  incomeINR,
  policyId,
  epoch,
  incomeCertCid,
  casteCertCid,
  caste,
  domicileMH = 1,
}) {
  const identitySecret = bytes32ToBigInt(getOrCreateIdentitySecret());
  const incomeSalt = bytes32ToBigInt(getOrCreateIncomeSaltForYear(epoch));
  const income = BigInt(Math.max(0, Math.floor(Number(incomeINR) || 0)));
  const pid = BigInt(policyId);
  const ep = BigInt(epoch);
  const casteCategory = BigInt(casteToNum(caste));
  const dom = BigInt(domicileMH ? 1 : 0);
  const incomeCertHash = cidToField(incomeCertCid);
  const casteCertHash = cidToField(casteCertCid);

  const incComm = await incomeCommitment(income, incomeSalt);
  const subjectId = await deriveSubjectId(identitySecret);
  const nullifierHash = await deriveNullifierHash(identitySecret, pid, ep);
  const credentialHash = await deriveCredentialHash({
    subjectId,
    policyId: pid,
    incomeCommitment: incComm,
    incomeCertHash,
    casteCertHash,
    casteCategory,
    domicileMH: dom,
  });

  return {
    identitySecret: identitySecret.toString(),
    incomeSalt: incomeSalt.toString(),
    income: income.toString(),
    incomeCommitment: incComm.toString(),
    subjectId: fieldToBytes32(subjectId),
    credentialHash: fieldToBytes32(credentialHash),
    nullifierHash: fieldToBytes32(nullifierHash),
    incomeCertHash: incomeCertHash.toString(),
    casteCertHash: casteCertHash.toString(),
    casteCategory: casteCategory.toString(),
    domicileMH: dom.toString(),
  };
}
