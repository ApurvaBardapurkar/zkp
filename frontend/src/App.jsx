import { useCallback, useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import * as snarkjs from "snarkjs";

const MST_CHAIN_ID_DEC = 91562037;
const MST_CHAIN_ID_HEX = "0x05752B65"; // 91562037
const MST_RPC_URL = "https://testnetrpc.mstblockchain.com";
const MST_EXPLORER = "https://testnet.mstscan.com";

// bn128 scalar field (same as snarkjs verifier uses)
const SNARK_FIELD_R = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");

const SCHOLARSHIP_PROGRAMS = [
  {
    key: "PANJABRAO_HOSTEL",
    policyId: 1001,
    name: "Dr. Panjabrao Deshmukh Vastigruh Nirvah Bhatta (Hostel Allowance)",
    incomeLimitINR: 800000,
    description:
      "Hostel allowance support for eligible Maharashtra students (representative scheme mapping).",
    notes: [
      "Typically applied via MahaDBT",
      "Representative income limit used for eligibility proof: ₹8,00,000/year",
    ],
  },
  {
    key: "TFWS",
    policyId: 1101,
    name: "Tuition Fee Waiver Scheme (TFWS)",
    incomeLimitINR: 800000,
    description:
      "100% tuition fee waiver (supernumerary seats) for eligible engineering/pharmacy students.",
    notes: [
      "Maharashtra domicile + CAP admission",
      "Income limit: ≤ ₹8,00,000/year",
      "Tuition fee waived; other fees may apply",
    ],
  },
  {
    key: "EBC",
    policyId: 1201,
    name: "Rajarshi Chhatrapati Shahu Maharaj Shikshan Shulkh Shishyavrutti (EBC)",
    incomeLimitINR: 800000,
    description:
      "Fee reimbursement support for eligible open category (EWS) students.",
    notes: ["Income limit: ≤ ₹8,00,000/year", "Often limited to first/second child"],
  },
  {
    key: "SC_POST_MATRIC",
    policyId: 1301,
    name: "GOI Post Matric Scholarship (SC)",
    incomeLimitINR: 250000,
    description:
      "Post-matric scholarship for SC category with fee reimbursement + allowance (scheme overview).",
    notes: ["Income limit: ≤ ₹2,50,000/year"],
  },
  {
    key: "OBC_SBC_VJNT_SCHOLARSHIP",
    policyId: 1401,
    name: "Post-Matric Scholarship (OBC/SBC/VJNT) — Scholarship tier",
    incomeLimitINR: 100000,
    description:
      "Scholarship tier for OBC/SBC/VJNT (example). Freeship tier may apply up to ₹8L.",
    notes: ["Scholarship tier income limit: ≤ ₹1,00,000/year"],
  },
];

// Deployed (real ZK)
const REGISTRY_ADDRESS = "0x2E6868823759c648015550f9a2dE666ded78b14f";
// NOTE: For yearly renewal enforcement, deploy `ScholarshipGateGroth16Epoch` and paste its address here.
const GATE_GROTH16_ADDRESS = import.meta.env.VITE_GATE_ADDRESS || "0x1742865959509B986383286b062e569eA79eCFe7";

const registryAbi = [
  "function admin() view returns (address)",
  "function setIssuer(address issuer, bool allowed) external",
  "function issueCredential(bytes32 subjectId, bytes32 credentialHash, string encryptedDocCid) external",
  "function isIssuer(address) view returns (bool)",
  "function credentialHashBySubject(bytes32) view returns (bytes32)",
  "function nullifierUsed(bytes32) view returns (bool)",
  "event CredentialIssued(bytes32 indexed subjectId, bytes32 indexed credentialHash, string encryptedDocCid)",
];

const gateAbi = [
  "function verifyAndClaim(uint256[2] a, uint256[2][2] b, uint256[2] c, uint256[5] input) external",
  "event VerifiedAndClaimed(bytes32 indexed subjectId, bytes32 indexed nullifierHash, uint256 indexed policyId, uint256 epoch, address caller)",
];

const PINATA_PROXY_URL = import.meta.env.VITE_PINATA_PROXY_URL || "http://localhost:8787";

function short(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function isBytes32Hex(v) {
  return /^0x[0-9a-fA-F]{64}$/.test(v || "");
}

function toBytes32Hex(n) {
  let hex = n.toString(16);
  if (hex.length > 64) hex = hex.slice(hex.length - 64);
  return "0x" + hex.padStart(64, "0");
}

function fieldReduceBytes32(hexBytes32) {
  if (!isBytes32Hex(hexBytes32)) throw new Error("Expected bytes32 hex (0x + 64 hex chars).");
  const n = BigInt(hexBytes32);
  return toBytes32Hex(n % SNARK_FIELD_R);
}

function randomBytes32() {
  return fieldReduceBytes32(ethers.hexlify(ethers.randomBytes(32)));
}

async function copyText(text) {
  await navigator.clipboard.writeText(text);
}

function Toast({ tone = "info", title, message, href, hrefLabel, onClose }) {
  const toneCls =
    tone === "success"
      ? "border-emerald-300 bg-emerald-50"
      : tone === "error"
        ? "border-red-300 bg-red-50"
        : tone === "loading"
          ? "border-blue-200 bg-blue-50"
          : "border-slate-200 bg-white";
  const dot =
    tone === "success"
      ? "bg-emerald-500"
      : tone === "error"
        ? "bg-red-500"
        : tone === "loading"
          ? "bg-blue-500 animate-pulse"
          : "bg-slate-400";
  return (
    <div className={`pointer-events-auto w-full max-w-md overflow-hidden rounded-2xl border ${toneCls} shadow-xl transition`}>
      <div className="flex items-start gap-3 p-4">
        <div className={`mt-1 h-2.5 w-2.5 rounded-full ${dot}`} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          {message ? <div className="mt-1 text-sm text-slate-700">{message}</div> : null}
          {href ? (
            <a className="mt-2 inline-flex text-sm font-semibold text-blue-700 hover:text-blue-800" href={href} target="_blank" rel="noreferrer">
              {hrefLabel || "View on explorer"} →
            </a>
          ) : null}
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          aria-label="Close"
          type="button"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function decodeCustomErrorSelector(sel) {
  const s = (sel || "").toLowerCase();
  const map = {
    "0x7bfa4b9f": { title: "Not authorized (Admin only)", message: "This action requires the Registry Admin wallet." }, // NotAdmin()
    "0x54ec5063": { title: "Not authorized (Issuer only)", message: "This action requires an allowed Issuer wallet." }, // NotIssuer()
    "0x9e586322": { title: "Credential missing", message: "Issuer hasn’t issued your scholarship credential for this Citizen ID yet." }, // CredentialMissing()
    "0xb9934cda": { title: "Credential mismatch", message: "The credential hash you’re using doesn’t match what’s stored on-chain." }, // CredentialMismatch()
    "0xcad2ae02": { title: "Already claimed", message: "This nullifier was already used. Generate a new nullifier and try again." }, // NullifierAlreadyUsed()
    "0x09bde339": { title: "Invalid proof", message: "The ZK proof did not verify. Check inputs and try again." }, // InvalidProof()
  };
  return map[s] || null;
}

function extractRevertSelector(err) {
  const data = err?.data || err?.error?.data || err?.info?.error?.data || err?.cause?.data;
  if (typeof data === "string" && data.startsWith("0x") && data.length >= 10) return data.slice(0, 10);
  const mm = err?.data?.data;
  if (typeof mm === "string" && mm.startsWith("0x") && mm.length >= 10) return mm.slice(0, 10);
  return null;
}

function txLink(hash) {
  return `${MST_EXPLORER}/tx/${hash}`;
}

function addrLink(addr) {
  return `${MST_EXPLORER}/address/${addr}`;
}

async function requireWallet() {
  if (!window.ethereum) throw new Error("No wallet found. Install MetaMask.");
  const provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  return provider;
}

async function ensureMstNetwork(provider) {
  const network = await provider.getNetwork();
  if (Number(network.chainId) === MST_CHAIN_ID_DEC) return;
  try {
    await provider.send("wallet_switchEthereumChain", [{ chainId: MST_CHAIN_ID_HEX }]);
  } catch {
    await provider.send("wallet_addEthereumChain", [
      {
        chainId: MST_CHAIN_ID_HEX,
        chainName: "MST Testnet",
        rpcUrls: [MST_RPC_URL],
        nativeCurrency: { name: "MST", symbol: "MST", decimals: 18 },
        blockExplorerUrls: [MST_EXPLORER],
      },
    ]);
  }
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return "0x" + [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function concatBytes(...parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function encryptFileAesGcm(file, passphrase) {
  const plain = new Uint8Array(await file.arrayBuffer());
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 210_000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  const cipher = new Uint8Array(cipherBuf);

  // Simple self-describing format:
  // "ZKS1" (4 bytes) + salt(16) + iv(12) + ciphertext(...)
  const header = new TextEncoder().encode("ZKS1");
  const packed = concatBytes(header, salt, iv, cipher);
  const blob = new Blob([packed], { type: "application/octet-stream" });

  const contentHash = await sha256Hex(plain);
  return {
    blob,
    meta: {
      algo: "AES-256-GCM",
      kdf: "PBKDF2-SHA256",
      iterations: 210000,
      saltB64: btoa(String.fromCharCode(...salt)),
      ivB64: btoa(String.fromCharCode(...iv)),
      plaintextSha256: contentHash,
      originalName: file.name,
      originalType: file.type || "application/octet-stream",
      originalSize: file.size,
    },
  };
}

function Card({ title, subtitle, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <div className="text-lg font-semibold text-slate-900">{title}</div>
        {subtitle ? <div className="mt-1 text-sm text-slate-600">{subtitle}</div> : null}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-600">{label}</div>
      {children}
    </label>
  );
}

function Input(props) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ${props.className || ""}`}
    />
  );
}

function Button({ variant = "primary", ...props }) {
  const cls =
    variant === "secondary"
      ? "border border-slate-200 bg-white hover:bg-slate-50 text-slate-900"
      : "bg-blue-600 hover:bg-blue-700 text-white";
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${cls} ${props.className || ""}`}
    />
  );
}

function TabButton({ active, children, ...props }) {
  return (
    <button
      {...props}
      className={`rounded-xl px-3 py-1.5 text-sm font-semibold transition ${
        active ? "bg-blue-50 text-blue-800" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}

function Stepper({ steps, current }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        {steps.map((s, idx) => {
          const active = idx === current;
          const done = idx < current;
          return (
            <div key={s} className="flex items-center gap-3">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                  done
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : active
                      ? "bg-blue-50 text-blue-700 border border-blue-200"
                      : "bg-slate-50 text-slate-500 border border-slate-200"
                }`}
              >
                {done ? "✓" : idx + 1}
              </div>
              <div className={`${active ? "text-slate-900" : "text-slate-600"} text-sm font-semibold`}>{s}</div>
              {idx !== steps.length - 1 ? <div className="h-px w-10 bg-slate-200" /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function App() {
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [account, setAccount] = useState("");
  const [tab, setTab] = useState("citizen"); // citizen | issuer | history
  const [registryAdmin, setRegistryAdmin] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCurrentIssuer, setIsCurrentIssuer] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [toast, setToast] = useState(null);
  const [lastTx, setLastTx] = useState("");
  const [lastSuccess, setLastSuccess] = useState("");
  const [role, setRole] = useState(() => localStorage.getItem("zk_role") || ""); // "citizen" | "issuer" | ""
  const [hasIssuedCredential, setHasIssuedCredential] = useState(false);

  // Issuer / credential issuance
  const [subjectId, setSubjectId] = useState("0x" + "01".padStart(64, "0"));
  const [credentialHash, setCredentialHash] = useState("0x" + "02".padStart(64, "0"));
  const [encryptedDocCid, setEncryptedDocCid] = useState("");
  const [issuerToSet, setIssuerToSet] = useState("");
  const [issuerAllowed, setIssuerAllowed] = useState(true);
  const [citizenWallet, setCitizenWallet] = useState("");

  // ZK inputs
  const [income, setIncome] = useState("500000");
  const [threshold, setThreshold] = useState("800000");
  const [nullifierHash, setNullifierHash] = useState("0x" + "03".padStart(64, "0"));
  const [policyId, setPolicyId] = useState("1001");
  const [epoch, setEpoch] = useState(String(new Date().getFullYear()));
  const [programKey, setProgramKey] = useState("PANJABRAO_HOSTEL");
  const [selectedFile, setSelectedFile] = useState(null);
  const [passphrase, setPassphrase] = useState("");
  const [attachEncryptedDoc, setAttachEncryptedDoc] = useState(false);
  const [citizenStep, setCitizenStep] = useState(0); // 0 scheme, 1 submit, 2 identity, 3 zk, 4 status
  const [issuerStep, setIssuerStep] = useState(0); // 0 verify, 1 upload(optional), 2 issue, 3 done
  const [applications, setApplications] = useState([]);
  const [myApplications, setMyApplications] = useState([]);
  const [selectedAppId, setSelectedAppId] = useState("");
  const [studentDocCid, setStudentDocCid] = useState("");

  // History
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const explorerLinks = useMemo(
    () => ({
      registry: addrLink(REGISTRY_ADDRESS),
      gate: addrLink(GATE_GROTH16_ADDRESS),
    }),
    []
  );

  async function readJsonOrText(response) {
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    const clone = response.clone();
    if (contentType.includes("application/json")) {
      try {
        return await clone.json();
      } catch {
        // fallthrough to text
      }
    }
    const text = await clone.text();
    return { __nonJson: true, contentType, text };
  }

  const fetchJson = useCallback(async (url, options) => {
    const r = await fetch(url, options);
    const body = await readJsonOrText(r);
    if (!r.ok) {
      const hint =
        body && body.__nonJson
          ? `\n\nReceived non-JSON (${body.contentType || "unknown content-type"}).\nTip: check VITE_PINATA_PROXY_URL (should point to the server, e.g. http://localhost:8787).`
          : "";
      const msg = body && !body.__nonJson ? body?.error || JSON.stringify(body) : (body?.text || "").slice(0, 240);
      throw new Error(`HTTP ${r.status} ${r.statusText} for ${url}\n${msg}${hint}`);
    }
    if (body && body.__nonJson) {
      throw new Error(
        `Expected JSON but received HTML/text for ${url}\n` +
          `This usually means the request hit the frontend dev server (index.html) or a 404 page.\n` +
          `Fix: set VITE_PINATA_PROXY_URL to your backend (default: http://localhost:8787).`
      );
    }
    return body;
  }, []);

  const fetchApplications = useCallback(async () => {
    const data = await fetchJson(`${PINATA_PROXY_URL}/applications`);
    setApplications(data.applications || []);
  }, [fetchJson]);

  const fetchMyApplications = useCallback(async () => {
    if (!account) return;
    const data = await fetchJson(`${PINATA_PROXY_URL}/applications?citizenAddress=${account}`);
    setMyApplications(data.applications || []);
  }, [account, fetchJson]);

  const hasSubmittedPending = useMemo(
    () => myApplications.some((a) => (a.status || "submitted") === "submitted"),
    [myApplications]
  );

  useEffect(() => {
    if (role !== "citizen" || tab !== "citizen" || !account || !hasSubmittedPending) return;
    const t = window.setInterval(() => {
      fetchMyApplications().catch(() => {});
    }, 15000);
    return () => window.clearInterval(t);
  }, [role, tab, account, hasSubmittedPending, fetchMyApplications]);

  const pendingApplications = useMemo(
    () => (applications || []).filter((a) => (a.status || "submitted") === "submitted"),
    [applications]
  );

  const selectedApplication = useMemo(
    () => pendingApplications.find((a) => a.id === selectedAppId) || null,
    [pendingApplications, selectedAppId]
  );

  async function connect() {
    setError("");
    setStatus("Connecting wallet…");
    setToast({ tone: "loading", title: "Connecting wallet", message: "Please confirm in your wallet…" });
    try {
      const provider = await requireWallet();
      await ensureMstNetwork(provider);
      const signer = await provider.getSigner();
      const addr = await signer.getAddress();
      setAccount(addr);

      // Read registry roles
      const readProvider = new ethers.JsonRpcProvider(MST_RPC_URL);
      const registry = new ethers.Contract(REGISTRY_ADDRESS, registryAbi, readProvider);
      const [adminAddr, issuerFlag] = await Promise.all([registry.admin(), registry.isIssuer(addr)]);
      setRegistryAdmin(adminAddr);
      setIsAdmin(adminAddr.toLowerCase() === addr.toLowerCase());
      setIsCurrentIssuer(Boolean(issuerFlag));
      setStatus("Wallet connected.");
      setToast({ tone: "success", title: "Wallet connected", message: `Connected as ${short(addr)}` });

      if (role === "issuer") {
        fetchApplications().catch(() => {});
      }
      if (role === "citizen") {
        fetchMyApplications().catch(() => {});
      }

      // Load credential state so renewal UX can be enforced.
      try {
        const sid = fieldReduceBytes32(ethers.keccak256(ethers.solidityPacked(["address"], [addr])));
        const stored = await registry.credentialHashBySubject(sid);
        const has = stored && stored !== "0x0000000000000000000000000000000000000000000000000000000000000000";
        setHasIssuedCredential(Boolean(has));
        if (has) setCredentialHash(stored);
      } catch {
        setHasIssuedCredential(false);
      }

      // Role-based default view (after user chooses role)
      if (role === "issuer") setTab("issuer");
      if (role === "citizen") setTab("citizen");
    } catch (e) {
      setError(String(e?.message || e));
      setStatus("");
      setToast({ tone: "error", title: "Wallet connection failed", message: String(e?.message || e) });
    }
  }

  const selectedProgram = useMemo(() => SCHOLARSHIP_PROGRAMS.find((p) => p.key === programKey) || SCHOLARSHIP_PROGRAMS[0], [programKey]);
  const citizenSteps = useMemo(() => ["Choose scheme", "Submit application", "Your ID", "ZK proof", "Status"], []);
  const issuerSteps = useMemo(() => ["Verify documents", "Upload (optional)", "Issue credential", "Done"], []);

  function chooseRole(nextRole) {
    localStorage.setItem("zk_role", nextRole);
    setRole(nextRole);
    setToast({
      tone: "success",
      title: nextRole === "citizen" ? "Citizen mode" : "Issuer mode",
      message: "Role selected. Now connect your wallet.",
    });
  }

  function resetRole() {
    localStorage.removeItem("zk_role");
    setRole("");
    setToast(null);
  }

  function deriveSubjectIdFromConnectedWallet() {
    if (!account) throw new Error("Connect wallet first.");
    // Deterministic privacy-preserving subjectId derived from wallet address.
    // Anyone can compute it from the address, so for stronger privacy you can use a secret commitment instead.
    const sidRaw = ethers.keccak256(ethers.solidityPacked(["address"], [account]));
    const sid = fieldReduceBytes32(sidRaw);
    setSubjectId(sid);
    return sid;
  }

  function deriveSubjectIdFromAddress(addr) {
    if (!ethers.isAddress(addr)) throw new Error("Enter a valid citizen wallet address (0x…).");
    const sidRaw = ethers.keccak256(ethers.solidityPacked(["address"], [addr]));
    const sid = fieldReduceBytes32(sidRaw);
    setSubjectId(sid);
    return sid;
  }

  function generateNewNullifier() {
    const n = randomBytes32();
    setNullifierHash(n);
    return n;
  }

  function generateCredentialHashFromInputs() {
    // Scholarship MVP convenience:
    // Issuer and citizen must use the SAME credentialHash.
    // We keep it based only on PUBLIC stable inputs (subjectId + policyId + schema tag),
    // not on private income values.
    // Production: replace with issuer signature / Merkle inclusion + Poseidon.
    const packed = ethers.solidityPacked(
      ["string", "bytes32", "uint256"],
      ["ZK-SAMVIDHAN:PANJABRAO-DESHMUKH@1", subjectId, BigInt(policyId || "0")]
    );
    const hRaw = ethers.keccak256(packed);
    const h = fieldReduceBytes32(hRaw);
    setCredentialHash(h);
    return h;
  }

  async function checkIfCredentialExistsForConnectedWallet() {
    if (!account) throw new Error("Connect wallet first.");
    const sid = deriveSubjectIdFromConnectedWallet();
    const provider = new ethers.JsonRpcProvider(MST_RPC_URL);
    const registry = new ethers.Contract(REGISTRY_ADDRESS, registryAbi, provider);
    const stored = await registry.credentialHashBySubject(sid);
    const has = stored && stored !== "0x0000000000000000000000000000000000000000000000000000000000000000";
    setHasIssuedCredential(Boolean(has));
    if (has) {
      setCredentialHash(stored);
    }
    return { subjectId: sid, has, stored };
  }

  async function setIssuer() {
    setError("");
    setStatus("Updating issuer allowlist…");
    setToast({ tone: "loading", title: "Updating issuer allowlist", message: "Sending transaction…" });
    try {
      const provider = await requireWallet();
      await ensureMstNetwork(provider);
      const signer = await provider.getSigner();
      const registry = new ethers.Contract(REGISTRY_ADDRESS, registryAbi, signer);
      const tx = await registry.setIssuer(issuerToSet, issuerAllowed);
      setStatus(`Tx sent: ${tx.hash}`);
      setLastTx(tx.hash);
      setToast({ tone: "loading", title: "Transaction sent", message: "Waiting for confirmation…", href: txLink(tx.hash), hrefLabel: "View tx" });
      await tx.wait();
      setStatus("Issuer allowlist updated.");
      setToast({ tone: "success", title: "Issuer updated", message: `${short(issuerToSet)} is now ${issuerAllowed ? "ALLOWED" : "BLOCKED"}.` });
    } catch (e) {
      const sel = extractRevertSelector(e);
      const decoded = decodeCustomErrorSelector(sel);
      setError(String(e?.message || e));
      setStatus("");
      setToast({ tone: "error", title: decoded?.title || "Transaction failed", message: decoded?.message || String(e?.message || e) });
    }
  }

  async function issueCredential() {
    setError("");
    setStatus("Issuing credential on-chain…");
    setToast({ tone: "loading", title: "Issuing credential", message: "Sending transaction…" });
    try {
      // Precheck role
      if (!isAdmin && !isCurrentIssuer) {
        setToast({ tone: "error", title: "Not authorized", message: "You are not an allowed Issuer. Ask admin to allowlist your wallet (Set issuer)." });
        throw new Error("NotIssuer");
      }
      const provider = await requireWallet();
      await ensureMstNetwork(provider);
      const signer = await provider.getSigner();
      const registry = new ethers.Contract(REGISTRY_ADDRESS, registryAbi, signer);
      const tx = await registry.issueCredential(subjectId, credentialHash, encryptedDocCid || "");
      setStatus(`Tx sent: ${tx.hash}`);
      setLastTx(tx.hash);
      setToast({ tone: "loading", title: "Credential tx sent", message: "Waiting for confirmation…", href: txLink(tx.hash), hrefLabel: "View tx" });
      await tx.wait();
      if (selectedAppId) {
        await markIssued(selectedAppId, tx.hash);
      }
      setStatus("Credential issued.");
      setToast({ tone: "success", title: "Credential issued", message: "Citizen can now prove eligibility with ZK." });
    } catch (e) {
      const sel = extractRevertSelector(e);
      const decoded = decodeCustomErrorSelector(sel);
      if (String(e?.message || e) === "NotIssuer") return;
      setError(String(e?.message || e));
      setStatus("");
      setToast({ tone: "error", title: decoded?.title || "Transaction failed", message: decoded?.message || String(e?.message || e) });
    }
  }

  async function uploadEncryptedDoc() {
    setError("");
    if (!selectedFile) throw new Error("Select a file first.");
    if (!passphrase || passphrase.length < 8) throw new Error("Enter a passphrase (min 8 chars).");

    setStatus("Encrypting in browser (AES‑GCM)…");
    setToast({ tone: "loading", title: "Encrypting", message: "Encrypting file locally (AES‑GCM)..." });
    const { blob, meta } = await encryptFileAesGcm(selectedFile, passphrase);

    setStatus("Uploading encrypted blob to IPFS via server…");
    setToast({ tone: "loading", title: "Uploading", message: "Uploading encrypted file to IPFS..." });
    const form = new FormData();
    const safeName = `${selectedFile.name}.zks1`;
    form.append("file", blob, safeName);

    const r = await fetch(`${PINATA_PROXY_URL}/pin/file`, { method: "POST", body: form });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error || "Upload failed");

    // Optional: store encryption metadata as JSON pinned separately
    // (contains no plaintext, but includes SHA256 of plaintext for integrity checking)
    try {
      await fetch(`${PINATA_PROXY_URL}/pin/json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schema: "zk-samvidhan/encrypted-doc@1",
          createdAt: new Date().toISOString(),
          encryptedCid: data.IpfsHash,
          meta,
        }),
      });
    } catch {
      // best-effort only
    }

    setEncryptedDocCid(data.IpfsHash);
    setStudentDocCid(data.IpfsHash);
    setStatus(`Uploaded encrypted doc. CID: ${data.IpfsHash}`);
    setToast({ tone: "success", title: "Uploaded to IPFS", message: `CID: ${data.IpfsHash}` });
  }

  async function generateProofAndClaim() {
    setError("");
    setStatus("Checking on-chain credential + nullifier…");
    setToast({ tone: "loading", title: "Preparing claim", message: "Checking credential + nullifier on-chain..." });

    const readProvider = new ethers.JsonRpcProvider(MST_RPC_URL);
    const registryRead = new ethers.Contract(REGISTRY_ADDRESS, registryAbi, readProvider);
    if (!isBytes32Hex(subjectId) || !isBytes32Hex(credentialHash) || !isBytes32Hex(nullifierHash)) {
      throw new Error("subjectId / credentialHash / nullifierHash must be valid bytes32 hex (0x + 64 hex chars).");
    }
    const stored = await registryRead.credentialHashBySubject(subjectId);
    if (stored === "0x0000000000000000000000000000000000000000000000000000000000000000") {
      setCitizenStep(4);
      throw new Error(
        "Scholarship credential NOT issued for your Citizen ID yet.\n\nFix: submit your application (Citizen Step 2), wait for institute issuance, then return here.\n\nIssuer: select the pending application → Issue credential."
      );
    }
    if (stored.toLowerCase() !== credentialHash.toLowerCase()) {
      setCredentialHash(stored);
      setToast({
        tone: "error",
        title: "Credential hash mismatch",
        message: "Auto-loaded the on-chain credential hash. Please retry Submit claim.",
      });
      throw new Error(
        `Credential hash mismatch. On-chain: ${stored} but you entered: ${credentialHash}. I auto-loaded the on-chain value for you; click Submit claim again.`
      );
    }
    const used = await registryRead.nullifierUsed(nullifierHash);
    if (used) {
      throw new Error("This nullifierHash is already used. Change it (must be unique per claim).");
    }

    setStatus("Generating ZK proof in browser… (this can take a bit)");
    setToast({ tone: "loading", title: "Generating proof", message: "Creating a Groth16 proof in your browser..." });

    const input = {
      income: Number(income),
      subjectId: BigInt(subjectId).toString(),
      credentialHash: BigInt(credentialHash).toString(),
      nullifierHash: BigInt(nullifierHash).toString(),
      policyId: BigInt(policyId).toString(),
      epoch: BigInt(epoch || "0").toString(),
    };

    const wasmPath = "/zk/incomeEligibility_js/incomeEligibility.wasm";
    const zkeyPath = "/zk/circuit_final.zkey";

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);

    const callData = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
    const parsed = JSON.parse("[" + callData + "]");
    const [a, b, c, pub] = parsed;

    setStatus("Sending on-chain verification tx…");
    setToast({ tone: "loading", title: "Submitting claim", message: "Sending verification transaction..." });
    const provider = await requireWallet();
    await ensureMstNetwork(provider);
    const signer = await provider.getSigner();
    const gate = new ethers.Contract(GATE_GROTH16_ADDRESS, gateAbi, signer);
    const tx = await gate.verifyAndClaim(a, b, c, pub);
    setStatus(`Tx sent: ${tx.hash}`);
    setLastTx(tx.hash);
    setToast({ tone: "loading", title: "Tx sent", message: "Waiting for confirmation…", href: txLink(tx.hash), hrefLabel: "View tx" });
    await tx.wait();
    setStatus("Verified + claimed (nullifier consumed).");
    setLastSuccess(tx.hash);
    setToast({ tone: "success", title: "Claimed successfully", message: "Eligibility verified with ZK. Claim recorded on-chain.", href: txLink(tx.hash), hrefLabel: "View proof tx" });
  }

  async function refreshHistory() {
    setError("");
    setHistoryLoading(true);
    try {
      const provider = new ethers.JsonRpcProvider(MST_RPC_URL);
      const latest = await provider.getBlockNumber();
      const from = Math.max(0, latest - 50_000);

      const registry = new ethers.Contract(REGISTRY_ADDRESS, registryAbi, provider);
      const gate = new ethers.Contract(GATE_GROTH16_ADDRESS, gateAbi, provider);

      const [issued, claimed] = await Promise.all([
        registry.queryFilter(registry.filters.CredentialIssued(), from, latest),
        gate.queryFilter(gate.filters.VerifiedAndClaimed(), from, latest),
      ]);

      const items = [
        ...issued.map((e) => ({
          type: "CredentialIssued",
          blockNumber: e.blockNumber,
          txHash: e.transactionHash,
          subjectId: e.args?.subjectId,
          credentialHash: e.args?.credentialHash,
          cid: e.args?.encryptedDocCid,
        })),
        ...claimed.map((e) => ({
          type: "VerifiedAndClaimed",
          blockNumber: e.blockNumber,
          txHash: e.transactionHash,
          subjectId: e.args?.subjectId,
          nullifierHash: e.args?.nullifierHash,
          policyId: e.args?.policyId?.toString?.() ?? String(e.args?.policyId),
          caller: e.args?.caller,
        })),
      ].sort((a, b) => (b.blockNumber ?? 0) - (a.blockNumber ?? 0));

      setHistory(items);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setHistoryLoading(false);
    }
  }

  async function submitScholarshipApplication() {
    if (!account) throw new Error("Connect wallet first.");
    setToast({ tone: "loading", title: "Submitting application", message: "Sending application for institute verification…" });
    const body = {
      citizenAddress: account,
      programKey,
      policyId,
      encryptedDocCid: studentDocCid || encryptedDocCid || "",
    };
    await fetchJson(`${PINATA_PROXY_URL}/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setToast({ tone: "success", title: "Application submitted", message: "Status: Pending institute verification." });
    await fetchMyApplications();
    setCitizenStep(2);
  }

  async function markIssued(appId, txHash) {
    await fetchJson(`${PINATA_PROXY_URL}/applications/${appId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "issued", issuedTxHash: txHash }),
    });
    await fetchApplications();
  }

  async function rejectApplication(appId) {
    if (!appId) return;
    setError("");
    setToast({ tone: "loading", title: "Rejecting application", message: "Updating queue…" });
    try {
      await fetchJson(`${PINATA_PROXY_URL}/applications/${appId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "rejected", issuedTxHash: "" }),
      });
      setToast({ tone: "success", title: "Application rejected", message: "The student will see rejected status in their portal." });
      setSelectedAppId("");
      await fetchApplications();
    } catch (e) {
      setToast({ tone: "error", title: "Reject failed", message: String(e?.message || e) });
      setError(String(e?.message || e));
    }
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-sky-50 via-white to-white text-slate-900">
      <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-full max-w-md flex-col gap-3">
        {toast ? <Toast {...toast} onClose={() => setToast(null)} /> : null}
      </div>
      <div className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 2l8 4v6c0 5-3.5 9.5-8 10-4.5-.5-8-5-8-10V6l8-4z" fill="currentColor" opacity="0.9"/>
                <path d="M12 6v12" stroke="white" strokeWidth="2" opacity="0.9"/>
                <path d="M7 10h10" stroke="white" strokeWidth="2" opacity="0.9"/>
              </svg>
            </div>
            <div className="leading-tight">
              <div className="text-xs font-semibold text-slate-600">Government of Maharashtra • Scholarship Services Portal</div>
              <div className="text-lg font-bold text-slate-900">ZK‑Samvidhan Scholarship Portal</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-600">Network</div>
            <div className="text-sm font-semibold text-slate-900">MST Testnet</div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8">
        {!role ? (
          <div className="mx-auto max-w-3xl">
            <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <div className="text-sm font-semibold text-blue-700">ZK‑Samvidhan</div>
              <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Select portal access</div>
              <div className="mt-2 text-slate-600">
                Choose the interface you need: Citizen services or Issuer administration.
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="text-lg font-semibold text-slate-900">Citizen</div>
                  <div className="mt-1 text-sm text-slate-600">
                    Prove scholarship eligibility with ZK (income ≤ threshold) without revealing your income.
                  </div>
                  <div className="mt-4">
                    <Button onClick={() => chooseRole("citizen")}>Continue as Citizen</Button>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="text-lg font-semibold text-slate-900">Issuer</div>
                  <div className="mt-1 text-sm text-slate-600">
                    Issue scholarship credentials after verification (admin/issuer wallet required).
                  </div>
                  <div className="mt-4">
                    <Button onClick={() => chooseRole("issuer")}>Continue as Issuer</Button>
                  </div>
                </div>
              </div>

              <div className="mt-6 text-xs text-slate-500">
                Your selection only affects the screens shown in this portal.
              </div>
            </div>
          </div>
        ) : null}

        {role ? (
        <div className="flex flex-col gap-2">
          <div className="text-sm font-medium text-blue-700">ZK‑Samvidhan</div>
          <div className="text-3xl font-semibold tracking-tight">
            Privacy‑Preserving Eligibility Proofs on <span className="text-blue-700">MST Testnet</span>
          </div>
          <div className="text-slate-600">
            Issue a credential hash, encrypt documents client-side, generate a Groth16 proof in-browser, and verify on-chain without exposing income.
          </div>
        </div>
        ) : null}

        {role ? (
        <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={connect}>{account ? `Connected: ${short(account)}` : "Connect Wallet"}</Button>
            <a className="text-sm text-slate-600 hover:text-slate-900" href={explorerLinks.registry} target="_blank" rel="noreferrer">
              Registry
            </a>
            <a className="text-sm text-slate-600 hover:text-slate-900" href={explorerLinks.gate} target="_blank" rel="noreferrer">
              Gate
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={resetRole}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900"
              title="Change role"
            >
              Switch role
            </button>
            <button
              type="button"
              onClick={() => setAdvanced((v) => !v)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900"
              title="Show/hide advanced cryptographic fields"
            >
              {advanced ? "Advanced: ON" : "Advanced: OFF"}
            </button>
            <div className="flex flex-wrap items-center gap-1 rounded-2xl border border-slate-200 bg-white p-1">
            {role === "citizen" ? (
              <TabButton
                active={tab === "citizen"}
                onClick={() => {
                  setTab("citizen");
                  fetchMyApplications().catch(() => {});
                }}
              >
                Citizen
              </TabButton>
            ) : null}
            {role === "issuer" ? (
              <TabButton
                active={tab === "issuer"}
                onClick={() => {
                  setTab("issuer");
                  fetchApplications().catch(() => {});
                }}
              >
                Issuer Admin
              </TabButton>
            ) : null}
            <TabButton
              active={tab === "history"}
              onClick={() => {
                setTab("history");
                refreshHistory().catch(() => {});
              }}
            >
              History
            </TabButton>
            </div>
          </div>
        </div>
        ) : null}

        {lastSuccess ? (
          <div className="mt-5 overflow-hidden rounded-2xl border border-emerald-300 bg-emerald-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">Claimed successfully</div>
                <div className="mt-1 text-sm text-slate-700">
                  ZK proof verified on-chain. Your scholarship claim is recorded and can’t be replayed (nullifier used).
                </div>
              </div>
              <a className="text-sm font-semibold text-emerald-700 hover:text-emerald-800" href={txLink(lastSuccess)} target="_blank" rel="noreferrer">
                View tx →
              </a>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="mt-5 overflow-hidden rounded-2xl border border-red-200 bg-red-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-red-900">Something went wrong</div>
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-sm text-red-800">{error}</pre>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-xl border border-red-200 bg-white px-3 py-1.5 text-sm font-semibold text-red-800 hover:bg-red-50"
                onClick={() => setError("")}
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

        {status ? (
          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Status</div>
            <div className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-800">{status}</div>
          </div>
        ) : null}

        {role === "issuer" && tab === "issuer" ? (
          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            <Card title="Issuer Admin" subtitle="Allowlist issuers and issue credentials (hash + encrypted CID).">
              <div className="grid gap-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  <div>
                    Registry admin:{" "}
                    <a className="text-blue-700 hover:text-blue-800" href={addrLink(registryAdmin || REGISTRY_ADDRESS)} target="_blank" rel="noreferrer">
                      {registryAdmin ? short(registryAdmin) : "loading…"}
                    </a>
                  </div>
                  <div className="mt-1">
                    You: <span className="font-semibold text-slate-900">{account ? short(account) : "not connected"}</span>{" "}
                    {isAdmin ? <span className="text-emerald-300">(admin)</span> : <span className="text-amber-300">(not admin)</span>}
                  </div>
                </div>
                <Field label="Issuer address">
                  <Input value={issuerToSet} onChange={(e) => setIssuerToSet(e.target.value)} placeholder="0x..." />
                </Field>
                <div className="flex items-center gap-2">
                  <input
                    id="issuerAllowed"
                    type="checkbox"
                    checked={issuerAllowed}
                    onChange={(e) => setIssuerAllowed(e.target.checked)}
                    className="h-4 w-4 accent-violet-400"
                  />
                  <label htmlFor="issuerAllowed" className="text-sm text-slate-700">
                    Allowed
                  </label>
                </div>
                <Button
                  onClick={() => setIssuer().catch((e) => setError(String(e?.message || e)))}
                  disabled={!account || !isAdmin}
                  title={!isAdmin ? "Only registry admin can set issuers" : undefined}
                >
                  Set issuer
                </Button>
              </div>
            </Card>

            <Card title="Institute Verification Desk" subtitle="Verify submitted applications and issue scholarship eligibility credentials.">
              <div className="grid gap-3">
                <Stepper steps={issuerSteps} current={issuerStep} />
                {!isAdmin && !isCurrentIssuer ? (
                  <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4">
                    <div className="text-sm font-semibold text-slate-900">Not authorized to issue</div>
                    <div className="mt-1 text-sm text-slate-700">
                      Your wallet is not in the issuer allowlist. Ask the Registry Admin to add your wallet using <span className="font-semibold">Set issuer</span>.
                    </div>
                  </div>
                ) : null}

                {issuerStep === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-600">Step 1 — Pending applications</div>
                    <div className="mt-2 text-sm text-slate-700">
                      Applications are <span className="font-semibold text-slate-900">not</span> created here. Students submit them from the{" "}
                      <span className="font-semibold text-slate-900">Citizen</span> side of this portal (Switch role → Citizen → Connect wallet → Step 2 “Submit application”). This queue shows those rows after the backend saves them.
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs text-slate-600">
                        Pending: <span className="font-semibold text-slate-900">{pendingApplications.length}</span>
                      </div>
                      <Button variant="secondary" type="button" onClick={() => fetchApplications().catch(() => {})}>
                        Refresh list
                      </Button>
                    </div>

                    {pendingApplications.length === 0 ? (
                      <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/80 p-4 text-sm text-slate-800">
                        <div className="font-semibold text-slate-900">Nothing in the queue yet</div>
                        <ul className="mt-2 list-decimal space-y-1 pl-5">
                          <li>
                            Click <span className="font-semibold">Switch role</span> (top) → choose <span className="font-semibold">Citizen</span>.
                          </li>
                          <li>
                            <span className="font-semibold">Connect wallet</span> as the student, open the <span className="font-semibold">Citizen</span> tab, go to <span className="font-semibold">Step 2 — Submit application</span>, and submit.
                          </li>
                          <li>
                            Return here as Issuer and press <span className="font-semibold">Refresh list</span>. Pending rows have status{" "}
                            <span className="font-mono text-slate-900">submitted</span>.
                          </li>
                        </ul>
                        <div className="mt-3 text-xs text-slate-600">
                          Testing locally? Start the API that stores applications (same URL as{" "}
                          <span className="font-mono text-slate-800">{PINATA_PROXY_URL}</span>
                          ) so Citizen POSTs and this Issuer GET share one queue.
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 grid gap-2">
                        {pendingApplications.map((a) => (
                          <label
                            key={a.id}
                            className={`flex cursor-pointer flex-col gap-1 rounded-xl border bg-white p-3 text-sm ${
                              selectedAppId === a.id ? "border-blue-300 ring-2 ring-blue-100" : "border-slate-200"
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <input
                                type="radio"
                                name="pendingApp"
                                checked={selectedAppId === a.id}
                                onChange={() => {
                                  setSelectedAppId(a.id);
                                  setCitizenWallet(a.citizenAddress || "");
                                  setProgramKey(a.programKey || programKey);
                                  setPolicyId(String(a.policyId || policyId));
                                  const p = SCHOLARSHIP_PROGRAMS.find((x) => x.key === (a.programKey || programKey)) || SCHOLARSHIP_PROGRAMS[0];
                                  setThreshold(String(p.incomeLimitINR));
                                  setEncryptedDocCid(a.encryptedDocCid || "");
                                  try {
                                    const sid = deriveSubjectIdFromAddress(a.citizenAddress);
                                    generateCredentialHashFromInputs();
                                    copyText(sid).catch(() => {});
                                  } catch {
                                    // ignore - user can derive manually in Step 3
                                  }
                                }}
                                className="mt-1 h-4 w-4 accent-blue-600"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="font-semibold text-slate-900">{a.programKey}</div>
                                  <div className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900 border border-amber-200">
                                    {a.status || "submitted"}
                                  </div>
                                </div>
                                <div className="mt-1 text-xs text-slate-600">
                                  Student:{" "}
                                  <a className="font-mono text-blue-700 hover:text-blue-800" href={addrLink(a.citizenAddress)} target="_blank" rel="noreferrer">
                                    {short(a.citizenAddress)}
                                  </a>
                                </div>
                                <div className="mt-1 text-xs text-slate-600">
                                  Policy ID: <span className="font-mono text-slate-900">{a.policyId}</span>
                                  {a.encryptedDocCid ? (
                                    <>
                                      {" "}
                                      · CID: <span className="font-mono text-slate-900">{short(a.encryptedDocCid)}</span>
                                    </>
                                  ) : (
                                    <span> · No encrypted CID attached</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}

                    {selectedApplication ? (
                      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Selected</div>
                        <div className="mt-2">
                          <span className="font-semibold text-slate-900">{selectedApplication.programKey}</span> for{" "}
                          <span className="font-mono text-slate-900">{short(selectedApplication.citizenAddress)}</span>
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                      <Button
                        type="button"
                        className="border border-red-200 bg-red-50 text-red-900 hover:bg-red-100"
                        onClick={() => rejectApplication(selectedAppId).catch((e) => setError(String(e?.message || e)))}
                        disabled={!account || (!isCurrentIssuer && !isAdmin) || !selectedAppId}
                        title={!selectedAppId ? "Select an application first" : undefined}
                      >
                        Reject selected
                      </Button>
                      <Button
                        type="button"
                        onClick={() => setIssuerStep(1)}
                        disabled={!account || (!isCurrentIssuer && !isAdmin) || !selectedAppId}
                      >
                        Next →
                      </Button>
                    </div>
                  </div>
                ) : null}

                {issuerStep === 1 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-600">Step 2 — Upload (optional)</div>
                    <div className="mt-2 text-sm text-slate-700">
                      Upload an encrypted PDF/image only if you need audit evidence. ZK eligibility works without documents.
                    </div>
                    <div className="mt-3">
                      <div className="flex items-center gap-2">
                        <input
                          id="attachDocIssuer"
                          type="checkbox"
                          checked={attachEncryptedDoc}
                          onChange={(e) => setAttachEncryptedDoc(e.target.checked)}
                          className="h-4 w-4 accent-indigo-400"
                        />
                        <label htmlFor="attachDocIssuer" className="text-sm text-slate-700">
                          Attach encrypted document
                        </label>
                      </div>
                      {attachEncryptedDoc ? (
                        <div className="mt-3 grid gap-2">
                          <input
                            type="file"
                            onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                            className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-200 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-slate-900 hover:file:bg-slate-300"
                          />
                          <Field label="Passphrase (never uploaded)">
                            <Input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} placeholder="min 8 chars" />
                          </Field>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button variant="secondary" onClick={() => uploadEncryptedDoc().catch((e) => setError(String(e?.message || e)))}>
                              Encrypt & Upload
                            </Button>
                            <div className="text-xs text-slate-600">
                              CID: <code className="rounded bg-white/10 px-1 py-0.5">{encryptedDocCid || "-"}</code>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <Button variant="secondary" type="button" onClick={() => setIssuerStep(0)}>
                        ← Back
                      </Button>
                      <Button type="button" onClick={() => setIssuerStep(2)} disabled={!account || (!isCurrentIssuer && !isAdmin)}>
                        Next →
                      </Button>
                    </div>
                  </div>
                ) : null}

                {issuerStep === 2 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-600">Step 3 — Issue credential</div>

                    {selectedApplication ? (
                      <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                        Issuing for{" "}
                        <span className="font-semibold text-slate-900">{selectedApplication.programKey}</span> ·{" "}
                        <a className="font-mono text-blue-700 hover:text-blue-800" href={addrLink(selectedApplication.citizenAddress)} target="_blank" rel="noreferrer">
                          {short(selectedApplication.citizenAddress)}
                        </a>
                      </div>
                    ) : (
                      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        No application selected. Go back to Step 1 and select a pending student application.
                      </div>
                    )}

                    <Field label="Citizen wallet address">
                      <div className="flex gap-2">
                        <Input value={citizenWallet} onChange={(e) => setCitizenWallet(e.target.value)} placeholder="0x… (citizen wallet)" />
                        <Button
                          variant="secondary"
                          type="button"
                          onClick={() => {
                            try {
                              const sid = deriveSubjectIdFromAddress(citizenWallet);
                              generateCredentialHashFromInputs();
                              setStatus(`Derived Citizen ID from ${short(citizenWallet)}.`);
                              copyText(sid).catch(() => {});
                            } catch (e) {
                              setError(String(e?.message || e));
                            }
                          }}
                        >
                          Derive ID + hash
                        </Button>
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        This derives the same <span className="font-semibold text-slate-900">Citizen ID</span> the student sees in the Citizen flow.
                      </div>
                    </Field>

                    <Field label="Credential hash (auto-generated)">
                      <div className="flex gap-2">
                        <Input value={credentialHash} onChange={(e) => setCredentialHash(e.target.value)} />
                        <Button
                          variant="secondary"
                          type="button"
                          onClick={() => {
                            try {
                              const h = generateCredentialHashFromInputs();
                              setStatus("Generated credential hash.");
                              copyText(h).catch(() => {});
                            } catch (e) {
                              setError(String(e?.message || e));
                            }
                          }}
                        >
                          Auto
                        </Button>
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        Must match the citizen’s ZK inputs for this wallet + policy id.
                      </div>
                    </Field>

                    <Field label="encryptedDocCid (optional)">
                      <Input value={encryptedDocCid} onChange={(e) => setEncryptedDocCid(e.target.value)} placeholder="bafy... / Qm..." />
                      <div className="mt-1 text-xs text-slate-600">
                        Defaults to the student’s submitted CID (if any). You can override after uploading in Step 2.
                      </div>
                    </Field>

                    <Button
                      onClick={() =>
                        issueCredential()
                          .then(() => {
                            setIssuerStep(3);
                            setSelectedAppId("");
                          })
                          .catch((e) => setError(String(e?.message || e)))
                      }
                      disabled={!account || (!isCurrentIssuer && !isAdmin) || !selectedAppId}
                      title={!isCurrentIssuer && !isAdmin ? "You must be an allowed issuer (or admin) to issue" : undefined}
                    >
                      Issue credential
                    </Button>

                    {advanced ? (
                      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="text-xs font-medium uppercase tracking-wide text-slate-600">Advanced</div>
                        <div className="mt-2 grid gap-3">
                          <Field label="Citizen ID (subjectId bytes32)">
                            <div className="flex gap-2">
                              <Input value={subjectId} onChange={(e) => setSubjectId(e.target.value)} />
                              <Button
                                variant="secondary"
                                type="button"
                                onClick={() => copyText(subjectId).then(() => setStatus("Copied Citizen ID")).catch((e) => setError(String(e)))}
                              >
                                Copy
                              </Button>
                            </div>
                          </Field>
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-4 flex items-center justify-between">
                      <Button variant="secondary" type="button" onClick={() => setIssuerStep(1)}>
                        ← Back
                      </Button>
                    </div>
                  </div>
                ) : null}

                {issuerStep === 3 ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <div className="text-sm font-semibold text-slate-900">Done</div>
                    <div className="mt-1 text-sm text-slate-700">
                      Credential issued. Citizen can now submit the ZK proof claim from the portal.
                    </div>
                    {lastTx ? (
                      <a className="mt-3 inline-flex text-sm font-semibold text-emerald-700 hover:text-emerald-800" href={txLink(lastTx)} target="_blank" rel="noreferrer">
                        View last tx →
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </Card>
          </div>
        ) : role && tab === "history" ? (
          <div className="mt-8">
            <Card
              title="On-chain history"
              subtitle="Reads events from public RPC (last ~50k blocks). Refresh anytime."
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button variant="secondary" onClick={() => refreshHistory().catch(() => {})} disabled={historyLoading}>
                  {historyLoading ? "Refreshing…" : "Refresh"}
                </Button>
                <div className="text-xs text-slate-600">
                  Registry: <a className="text-blue-700 hover:text-blue-800" href={explorerLinks.registry} target="_blank" rel="noreferrer">{short(REGISTRY_ADDRESS)}</a>{" "}
                  · Gate: <a className="text-blue-700 hover:text-blue-800" href={explorerLinks.gate} target="_blank" rel="noreferrer">{short(GATE_GROTH16_ADDRESS)}</a>
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
                <div className="grid grid-cols-12 gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                  <div className="col-span-2">Type</div>
                  <div className="col-span-6">Details</div>
                  <div className="col-span-2">Block</div>
                  <div className="col-span-2">Tx</div>
                </div>
                <div className="max-h-[520px] overflow-auto">
                  {history.length === 0 ? (
                    <div className="px-3 py-4 text-sm text-slate-600">No events loaded yet.</div>
                  ) : (
                    history.map((h, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-2 border-b border-white/5 px-3 py-2 text-sm">
                        <div className="col-span-2 font-semibold text-slate-900">{h.type}</div>
                        <div className="col-span-6 text-slate-700">
                          {h.type === "CredentialIssued" ? (
                            <div className="space-y-1">
                              <div>
                                subjectId: <code className="rounded bg-white/10 px-1 py-0.5">{String(h.subjectId)}</code>
                              </div>
                              <div>
                                cid: <code className="rounded bg-white/10 px-1 py-0.5">{String(h.cid || "")}</code>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <div>
                                policyId: <code className="rounded bg-white/10 px-1 py-0.5">{String(h.policyId)}</code>
                              </div>
                              <div>
                                caller:{" "}
                                <a className="text-blue-700 hover:text-blue-800" href={addrLink(String(h.caller))} target="_blank" rel="noreferrer">
                                  {short(String(h.caller))}
                                </a>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="col-span-2 text-slate-600">{h.blockNumber}</div>
                        <div className="col-span-2">
                          <a className="text-blue-700 hover:text-blue-800" href={txLink(String(h.txHash))} target="_blank" rel="noreferrer">
                            {short(String(h.txHash))}
                          </a>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </Card>
          </div>
        ) : role === "citizen" && tab === "citizen" ? (
          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            <Card
              title="MahaDBT-style Scholarship Portal"
              subtitle="Guided flow: choose scheme → submit application → derive Citizen ID → ZK verify claim → status."
            >
              <div className="grid gap-3">
                <Stepper steps={citizenSteps} current={citizenStep} />

                {citizenStep === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-600">Step 1 — Choose scheme</div>
                    <div className="mt-2 grid gap-2">
                      <div className="grid gap-1">
                        <div className="text-xs font-medium uppercase tracking-wide text-slate-600">Program</div>
                        <select
                          value={programKey}
                          onChange={(e) => {
                            const nextKey = e.target.value;
                            setProgramKey(nextKey);
                            const p = SCHOLARSHIP_PROGRAMS.find((x) => x.key === nextKey) || SCHOLARSHIP_PROGRAMS[0];
                            setPolicyId(String(p.policyId));
                            setThreshold(String(p.incomeLimitINR));
                          }}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        >
                          {SCHOLARSHIP_PROGRAMS.map((p) => (
                            <option key={p.key} value={p.key}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                        <div className="font-semibold text-slate-900">{selectedProgram.name}</div>
                        <div className="mt-1 text-slate-600">{selectedProgram.description}</div>
                        <div className="mt-3 grid gap-1 text-xs text-slate-600">
                          <div>
                            Income limit (proof threshold):{" "}
                            <span className="font-semibold text-slate-900">≤ ₹{selectedProgram.incomeLimitINR.toLocaleString("en-IN")}/year</span>
                          </div>
                          <ul className="mt-1 list-disc pl-5">
                            {selectedProgram.notes.map((n) => (
                              <li key={n}>{n}</li>
                            ))}
                          </ul>
                          <div className="mt-2">Typical: Maharashtra domicile, CAP admission, income certificate by Tahsildar, no large academic gap.</div>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-end">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="secondary"
                            type="button"
                            disabled={!account}
                            title={!account ? "Connect wallet first" : undefined}
                            onClick={() =>
                              checkIfCredentialExistsForConnectedWallet()
                                .then(({ has }) => {
                                  setToast({
                                    tone: "success",
                                    title: has ? "Credential found" : "No credential yet",
                                    message: has
                                      ? "You can skip document submission and proceed to Citizen ID."
                                      : "First-time enrollment: submit an application (documents) for institute verification.",
                                  });
                                  setCitizenStep(has ? 2 : 1);
                                })
                                .catch((e) => setError(String(e?.message || e)))
                            }
                          >
                            Check credential (renewal?)
                          </Button>
                          <Button type="button" onClick={() => setCitizenStep(1)}>
                            Next →
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {citizenStep === 1 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-600">
                      Step 2 — {hasIssuedCredential ? "Renewal (no documents required)" : "Submit application"}
                    </div>
                    <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                      {hasIssuedCredential ? (
                        <>
                          A credential is already issued for this wallet. You can proceed directly to your Citizen ID and submit a ZK claim for the selected year (epoch).
                        </>
                      ) : (
                        <>
                          Submit your application for institute verification. You may optionally attach an encrypted supporting document (AES‑GCM) uploaded via this portal’s IPFS proxy.
                        </>
                      )}
                    </div>
                    <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/80 p-3 text-sm text-slate-800">
                      <div className="font-semibold text-slate-900">Credential status</div>
                      <div className="mt-1">
                        {hasIssuedCredential ? (
                          <>Issued for this wallet. Renewal is enabled.</>
                        ) : (
                          <>Not issued yet. Renewal is disabled until the institute issues your credential.</>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Button
                          variant="secondary"
                          disabled={!account}
                          onClick={() => checkIfCredentialExistsForConnectedWallet().catch((e) => setError(String(e?.message || e)))}
                        >
                          Refresh status
                        </Button>
                        {hasIssuedCredential ? (
                          <Button variant="secondary" onClick={() => setCitizenStep(2)}>
                            Continue →
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    {!hasIssuedCredential ? (
                      <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Optional encrypted attachment</div>
                        <input
                          type="file"
                          onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                          className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-200 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-slate-900 hover:file:bg-slate-300"
                        />
                        <Field label="Passphrase (never uploaded)">
                          <Input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} placeholder="min 8 chars" />
                        </Field>
                        <div className="text-xs text-slate-600">
                          File: <span className="font-semibold text-slate-900">{selectedFile?.name || "None selected"}</span>
                          {passphrase && passphrase.length < 8 ? (
                            <span className="ml-2 text-red-700">Passphrase must be at least 8 characters.</span>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="secondary"
                            disabled={!selectedFile || !passphrase || passphrase.length < 8}
                            title={!selectedFile ? "Select a file first" : !passphrase || passphrase.length < 8 ? "Enter passphrase (min 8 chars)" : undefined}
                            onClick={() => uploadEncryptedDoc().catch((e) => setError(String(e?.message || e)))}
                          >
                            Encrypt & Upload
                          </Button>
                          <div className="text-xs text-slate-600">
                            CID:{" "}
                            <code className="rounded bg-slate-100 px-1 py-0.5 text-slate-900">{studentDocCid || encryptedDocCid || "-"}</code>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Your applications</div>
                          {hasSubmittedPending ? (
                            <span className="text-xs text-slate-500">Auto-refresh ~15s while pending</span>
                          ) : null}
                        </div>
                        <Button variant="secondary" type="button" onClick={() => fetchMyApplications().catch(() => {})}>
                          Refresh
                        </Button>
                      </div>
                      {myApplications.length === 0 ? (
                        <div className="mt-2 text-sm text-slate-600">No submissions yet for this wallet.</div>
                      ) : (
                        <div className="mt-3 grid gap-2">
                          {myApplications.map((a) => (
                            <div key={a.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="font-semibold text-slate-900">{a.programKey}</div>
                                <div
                                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                    a.status === "issued"
                                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                                      : a.status === "rejected"
                                        ? "bg-red-50 text-red-800 border border-red-200"
                                        : "bg-amber-50 text-amber-900 border border-amber-200"
                                  }`}
                                >
                                  {a.status || "submitted"}
                                </div>
                              </div>
                              <div className="mt-1 text-xs text-slate-600">
                                Policy ID: <span className="font-mono text-slate-900">{a.policyId}</span>
                                {a.encryptedDocCid ? (
                                  <>
                                    {" "}
                                    · CID: <span className="font-mono text-slate-900">{short(a.encryptedDocCid)}</span>
                                  </>
                                ) : null}
                              </div>
                              {a.status === "issued" && a.issuedTxHash ? (
                                <a className="mt-2 inline-flex text-xs font-semibold text-blue-700 hover:text-blue-800" href={txLink(a.issuedTxHash)} target="_blank" rel="noreferrer">
                                  View issuance tx →
                                </a>
                              ) : a.status === "rejected" ? (
                                <div className="mt-2 text-xs text-red-800">This application was not approved by the institute.</div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <Button variant="secondary" type="button" onClick={() => setCitizenStep(0)}>
                        ← Back
                      </Button>
                      <Button
                        type="button"
                        disabled={!account || hasIssuedCredential}
                        onClick={() => submitScholarshipApplication().catch((e) => setError(String(e?.message || e)))}
                      >
                        Submit application
                      </Button>
                    </div>
                  </div>
                ) : null}

                {citizenStep === 2 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-600">Step 3 — Your Citizen ID</div>
                    <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                      Your Citizen ID is derived from your wallet. Issuer uses the same method to issue your scholarship credential.
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        variant="secondary"
                        type="button"
                        onClick={() => {
                          try {
                            const sid = deriveSubjectIdFromConnectedWallet();
                            setStatus("Citizen ID derived from your wallet.");
                            copyText(sid).catch(() => {});
                          } catch (e) {
                            setError(String(e?.message || e));
                          }
                        }}
                      >
                        Use wallet to generate ID
                      </Button>
                      <Button
                        variant="secondary"
                        type="button"
                        onClick={() => copyText(subjectId).then(() => setStatus("Copied Citizen ID")).catch((e) => setError(String(e)))}
                        disabled={!isBytes32Hex(subjectId)}
                      >
                        Copy ID
                      </Button>
                    </div>
                    <div className="mt-3 rounded-lg bg-white px-3 py-2 font-mono text-xs text-slate-700 border border-slate-200">
                      {isBytes32Hex(subjectId) ? subjectId : "Not set yet"}
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <Button variant="secondary" type="button" onClick={() => setCitizenStep(1)}>
                        ← Back
                      </Button>
                      <Button type="button" onClick={() => setCitizenStep(3)} disabled={!isBytes32Hex(subjectId)}>
                        Next →
                      </Button>
                    </div>
                  </div>
                ) : null}

                {citizenStep === 3 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-600">Step 4 — ZK proof</div>
                    <div className="mt-2 grid gap-3 md:grid-cols-2">
                      <Field label="renewal epoch (public)">
                        <Input value={epoch} onChange={(e) => setEpoch(e.target.value)} placeholder="e.g. 2026" />
                      </Field>
                      <Field label="income (private)">
                        <Input value={income} onChange={(e) => setIncome(e.target.value)} />
                      </Field>
                      <Field label="threshold (from scheme)">
                        <Input value={threshold} disabled />
                      </Field>
                    </div>
                    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
                      Your income stays private. Only eligibility (income ≤ threshold) is proven.
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        variant="secondary"
                        type="button"
                        onClick={() => {
                          try {
                            const h = generateCredentialHashFromInputs();
                            setStatus("Generated scholarship credential hash (must match issuer-issued hash).");
                            copyText(h).catch(() => {});
                          } catch (e) {
                            setError(String(e?.message || e));
                          }
                        }}
                      >
                        Auto hash
                      </Button>
                      <Button
                        variant="secondary"
                        type="button"
                        onClick={() => {
                          const n = generateNewNullifier();
                          setStatus("Generated one-time nullifier.");
                          copyText(n).catch(() => {});
                        }}
                      >
                        New nullifier
                      </Button>
                      <Button
                        type="button"
                        onClick={() =>
                          generateProofAndClaim()
                            .then(() => setCitizenStep(4))
                            .catch((e) => setError(String(e?.message || e)))
                        }
                        disabled={!hasIssuedCredential}
                        title={!hasIssuedCredential ? "Renewal/claim is enabled only after your credential is issued." : undefined}
                      >
                        Submit claim (ZK verify)
                      </Button>
                    </div>
                    <div className="mt-2 text-xs text-slate-600">
                      Uses ZK files from <code className="rounded bg-white/10 px-1 py-0.5">/public/zk</code> and submits on-chain.
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <Button variant="secondary" type="button" onClick={() => setCitizenStep(2)}>
                        ← Back
                      </Button>
                      <Button variant="secondary" type="button" onClick={() => setCitizenStep(4)}>
                        Skip to status →
                      </Button>
                    </div>
                  </div>
                ) : null}

                {citizenStep === 4 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-600">Step 5 — Status</div>
                    {lastSuccess ? (
                      <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                        <div className="text-sm font-semibold text-slate-900">Claimed successfully</div>
                        <div className="mt-1 text-sm text-slate-700">Your claim is recorded on MST testnet.</div>
                        <a className="mt-3 inline-flex text-sm font-semibold text-emerald-700 hover:text-emerald-800" href={txLink(lastSuccess)} target="_blank" rel="noreferrer">
                          View transaction →
                        </a>
                      </div>
                    ) : lastTx ? (
                      <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="text-sm font-semibold text-slate-900">Transaction submitted</div>
                        <div className="mt-1 text-sm text-slate-700">Waiting / check on explorer.</div>
                        <a className="mt-3 inline-flex text-sm font-semibold text-blue-700 hover:text-blue-800" href={txLink(lastTx)} target="_blank" rel="noreferrer">
                          View transaction →
                        </a>
                      </div>
                    ) : (
                      <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                        No claim submitted yet. Go back to Step 4 to submit your ZK proof.
                      </div>
                    )}
                    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Application queue status</div>
                      {myApplications.length === 0 ? (
                        <div className="mt-2 text-sm text-slate-600">No applications found for this wallet.</div>
                      ) : (
                        <div className="mt-3 grid gap-2">
                          {myApplications.map((a) => (
                            <div key={`${a.id}-status`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="font-semibold text-slate-900">{a.programKey}</div>
                                <div
                                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                    a.status === "issued"
                                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                                      : a.status === "rejected"
                                        ? "bg-red-50 text-red-800 border border-red-200"
                                        : "bg-amber-50 text-amber-900 border border-amber-200"
                                  }`}
                                >
                                  {a.status || "submitted"}
                                </div>
                              </div>
                              {a.status === "issued" && a.issuedTxHash ? (
                                <a className="mt-2 inline-flex text-xs font-semibold text-blue-700 hover:text-blue-800" href={txLink(a.issuedTxHash)} target="_blank" rel="noreferrer">
                                  View issuance tx →
                                </a>
                              ) : a.status === "rejected" ? (
                                <div className="mt-2 text-xs text-red-800">This application was not approved. Submit a new application if allowed.</div>
                              ) : (
                                <div className="mt-2 text-xs text-slate-600">Waiting for institute to issue your eligibility credential on-chain.</div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <Button variant="secondary" type="button" onClick={() => setCitizenStep(3)}>
                        ← Back
                      </Button>
                      <Button variant="secondary" type="button" onClick={() => setCitizenStep(0)}>
                        Start new application
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </Card>

            <Card
              title="What happens next"
              subtitle="After you submit, your institute reviews the application off-chain, then issues an on-chain eligibility credential your wallet can use for ZK verification."
            >
              <div className="text-sm text-slate-700">
                You can track queue status in <span className="font-semibold text-slate-900">Step 5 — Status</span> and in{" "}
                <span className="font-semibold text-slate-900">Step 2 — Submit application</span>. While your application is pending, the list refreshes about every 15 seconds.
              </div>
            </Card>
          </div>
        ) : null}

        {role ? (
          <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700 shadow-sm">
            <div className="font-semibold text-slate-900">Privacy note</div>
            <div className="mt-1">
              Upload encrypted documents only. The chain stores only hashes + CID, and ZK proof reveals only eligibility (not income). Never share your passphrase.
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
