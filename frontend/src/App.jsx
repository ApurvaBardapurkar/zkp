import { useCallback, useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import * as snarkjs from "snarkjs";
import {
  CASTE_CATEGORIES,
  RELIGIONS,
  filterEligibleSchemes,
  schemeToProgram,
  DEFAULT_STUDENT_PROFILE,
  validateProfileForApply,
} from "./mahadbtSchemes.js";
import { pinFileToIpfs, pinJsonToIpfs } from "./pinataUpload.js";
import { ApplicationPrint, ApplicationDetailPanel } from "./ApplicationPrint.jsx";
import { DocumentUploadField } from "./DocumentUploadField.jsx";
import { OneTimeDocsUpload } from "./OneTimeDocsUpload.jsx";
import {
  emptyOneTimeDocs,
  oneTimeDocsComplete,
  missingOneTimeLabels,
  oneTimeDocsToPayload,
  oneTimeDocsFromApplication,
  ONE_TIME_DOCUMENTS,
} from "./documentsConfig.js";
import { buildZkIdentityBundle, bytes32ToBigInt } from "./zkCrypto.js";
import {
  appendLeafPoseidon,
  syncMerkleFromServer,
  pushLeafToServer,
  buildMerkleProofForLeafIndex,
} from "./merklePoseidon.js";
import { assertZkArtifactsAvailable, ZK_WASM_URL, ZK_ZKEY_URL } from "./zkArtifacts.js";
import { LiveDeploymentBar } from "./LiveDeploymentBar.jsx";
import {
  MST_CHAIN_ID_DEC,
  MST_CHAIN_ID_HEX,
  MST_RPC_URL,
  MST_EXPLORER,
  REGISTRY_ADDRESS,
  GATE_ADDRESS,
  VERIFIER_ADDRESS,
  addrLink,
  txLink,
  assertChainConfig,
  registryContract,
  gateContract,
} from "./chainConfig.js";

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

/** Academic years for annual renewal claims (one on-chain claim per year). */
const ACADEMIC_YEARS = [2026, 2027, 2028, 2029];

function defaultAcademicYear() {
  return String(new Date().getFullYear());
}

function ipfsGatewayUrl(cid) {
  if (!cid) return "";
  return `https://gateway.pinata.cloud/ipfs/${cid}`;
}

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
    "0x8e4a5fd1": {
      title: "Already claimed this year",
      message: "You already submitted a ZK claim for this academic year. Pick another year (e.g. 2027) or wait until the next period.",
    }, // AlreadyClaimedForEpoch() — verify on-chain if selector changes after redeploy
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

async function decryptFileAesGcm(blob, passphrase) {
  const packed = new Uint8Array(await blob.arrayBuffer());
  const header = new TextDecoder().decode(packed.slice(0, 4));
  if (header !== "ZKS1") throw new Error("Not a ZKS1 encrypted file.");
  const salt = packed.slice(4, 20);
  const iv = packed.slice(20, 32);
  const cipher = packed.slice(32);
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
    ["decrypt"]
  );
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return new Blob([plainBuf], { type: "application/octet-stream" });
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
  const [epoch, setEpoch] = useState(defaultAcademicYear());
  const [incomeCertCid, setIncomeCertCid] = useState("");
  const [incomeCertName, setIncomeCertName] = useState("");
  const [incomeCertPreviewUrl, setIncomeCertPreviewUrl] = useState("");
  const [issuerViewPassphrase, setIssuerViewPassphrase] = useState("");
  const [claimedEpochs, setClaimedEpochs] = useState({});
  const [programKey, setProgramKey] = useState("PANJABRAO_HOSTEL");
  const [selectedFile, setSelectedFile] = useState(null);
  const [passphrase, setPassphrase] = useState("");
  const [attachEncryptedDoc, setAttachEncryptedDoc] = useState(false);
  const [citizenStep, setCitizenStep] = useState(0);
  const [studentProfile, setStudentProfile] = useState(() => {
    try {
      const s = localStorage.getItem("zk_student_profile");
      return s ? { ...DEFAULT_STUDENT_PROFILE, ...JSON.parse(s) } : { ...DEFAULT_STUDENT_PROFILE };
    } catch {
      return { ...DEFAULT_STUDENT_PROFILE };
    }
  });
  const [selectedSchemeKey, setSelectedSchemeKey] = useState("");
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [oneTimeDocs, setOneTimeDocs] = useState(emptyOneTimeDocs);
  const [incomeCertFile, setIncomeCertFile] = useState(null);
  const [renewalIncomeFile, setRenewalIncomeFile] = useState(null);
  const [renewalIncomeCid, setRenewalIncomeCid] = useState("");
  const [uploadingRenewalIncome, setUploadingRenewalIncome] = useState(false);

  const casteCertCid = oneTimeDocs.casteCert?.cid || "";
  const [applicationSnapshotCid, setApplicationSnapshotCid] = useState("");
  const [uploadingIncome, setUploadingIncome] = useState(false);
  const [backendPinataOk, setBackendPinataOk] = useState(null);
  const [issuerStep, setIssuerStep] = useState(0); // 0 verify, 1 upload(optional), 2 issue, 3 done
  const [applications, setApplications] = useState([]);
  const [myApplications, setMyApplications] = useState([]);
  const [selectedAppId, setSelectedAppId] = useState("");
  const [studentDocCid, setStudentDocCid] = useState("");

  // History
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [backendPersistence, setBackendPersistence] = useState(null);
  const [merkleRoot, setMerkleRoot] = useState("");
  const [incomeCommitmentHex, setIncomeCommitmentHex] = useState("");

  const explorerLinks = useMemo(
    () => ({
      registry: addrLink(REGISTRY_ADDRESS),
      gate: addrLink(GATE_ADDRESS),
      verifier: addrLink(VERIFIER_ADDRESS),
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
    () =>
      (applications || []).filter((a) => {
        const s = a.status || "submitted";
        return s === "submitted" || s === "renewal_submitted";
      }),
    [applications]
  );

  const baseIssuedApplication = useMemo(
    () =>
      myApplications.find((a) => a.status === "issued" && a.applicationType !== "annual_renewal") ||
      myApplications.find((a) => a.status === "issued") ||
      null,
    [myApplications]
  );

  const renewalPendingForYear = useMemo(
    () =>
      myApplications.some(
        (a) => a.applicationType === "annual_renewal" && String(a.applicationYear) === String(epoch) && a.status === "renewal_submitted"
      ),
    [myApplications, epoch]
  );

  const renewalIssuedForYear = useMemo(
    () =>
      myApplications.find(
        (a) => a.applicationType === "annual_renewal" && String(a.applicationYear) === String(epoch) && a.status === "issued"
      ) || null,
    [myApplications, epoch]
  );

  const canClaimForYear = useMemo(() => {
    if (!hasIssuedCredential) return false;
    if (renewalIssuedForYear) return true;
    if (String(baseIssuedApplication?.applicationYear) === String(epoch) && baseIssuedApplication?.status === "issued") return true;
    return false;
  }, [hasIssuedCredential, renewalIssuedForYear, baseIssuedApplication, epoch]);

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
      const registry = registryContract(ethers, readProvider);
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

      // Load credential state (ZK Citizen ID, not wallet hash).
      try {
        await assertChainConfig(ethers, readProvider);
        const gateProbe = gateContract(ethers, readProvider);

        let sid = subjectId;
        if (role === "citizen") {
          sid = await deriveSubjectIdFromConnectedWallet();
        } else {
          sid = isBytes32Hex(subjectId)
            ? subjectId
            : fieldReduceBytes32(ethers.keccak256(ethers.solidityPacked(["address"], [addr])));
        }

        const stored = await registry.credentialHashBySubject(sid);
        const has = stored && stored !== "0x0000000000000000000000000000000000000000000000000000000000000000";
        setHasIssuedCredential(Boolean(has));
        if (has) setCredentialHash(stored);
        setSubjectId(sid);

        if (role === "citizen") {
          const pid = BigInt(policyId || "0");
          const out = {};
          for (const y of ACADEMIC_YEARS) {
            out[y] = await gateProbe.claimed(sid, pid, BigInt(y));
          }
          setClaimedEpochs(out);
        }
      } catch (credErr) {
        setHasIssuedCredential(false);
        console.warn("credential/claimed load:", credErr);
        if (String(credErr?.message || credErr).includes("misconfigured") || String(credErr?.message || credErr).includes("mismatch")) {
          setError(String(credErr?.message || credErr));
        }
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
  const citizenSteps = useMemo(
    () =>
      hasIssuedCredential
        ? ["Connect wallet", "Academic year", "Renewal", "Citizen ID", "ZK claim", "Status"]
        : [
            "Connect wallet",
            "Academic year",
            "Profile",
            "Eligible schemes",
            "Apply & print",
            "Citizen ID",
            "ZK claim",
            "Status",
          ],
    [hasIssuedCredential]
  );

  const citizenStepperIndex = useMemo(() => {
    if (!hasIssuedCredential) return citizenStep;
    if (citizenStep <= 1) return citizenStep;
    if (citizenStep === 5) return 2;
    if (citizenStep === 6) return 3;
    if (citizenStep === 7) return 4;
    return 0;
  }, [citizenStep, hasIssuedCredential]);

  const eligibleSchemes = useMemo(() => filterEligibleSchemes(studentProfile), [studentProfile]);

  const selectedMahadbtScheme = useMemo(
    () => eligibleSchemes.find((s) => s.key === selectedSchemeKey) || eligibleSchemes[0] || null,
    [eligibleSchemes, selectedSchemeKey]
  );

  useEffect(() => {
    localStorage.setItem("zk_student_profile", JSON.stringify(studentProfile));
  }, [studentProfile]);

  useEffect(() => {
    fetch(`${PINATA_PROXY_URL}/health`)
      .then((r) => r.json())
      .then((h) => {
        setBackendPinataOk(Boolean(h.pinata));
        setBackendPersistence(h?.persistence ?? "unknown");
      })
      .catch(() => {
        setBackendPinataOk(false);
        setBackendPersistence("unreachable");
      });
  }, []);

  const issuerSteps = useMemo(() => ["Pending applications", "Review certificate", "Issue credential", "Done"], []);

  const proofIncome = useMemo(() => {
    const raw = studentProfile?.familyAnnualIncome || income || "0";
    return Math.max(1, Math.floor(Number(String(raw).replace(/,/g, "")) || 0));
  }, [studentProfile, income]);

  const selectedAppCertCid = useMemo(() => {
    if (!selectedApplication) return "";
    return selectedApplication.incomeCertCid || selectedApplication.encryptedDocCid || "";
  }, [selectedApplication]);

  const selectedAppCasteCid = useMemo(() => {
    if (!selectedApplication) return "";
    return selectedApplication.casteCertCid || "";
  }, [selectedApplication]);

  const selectedAppDocsReady = Boolean(selectedAppCertCid && selectedAppCasteCid);

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

  function getActiveIssuedAppForEpoch(year) {
    const y = String(year ?? epoch);
    const renewal = myApplications.find(
      (a) => a.applicationType === "annual_renewal" && String(a.applicationYear) === y && a.status === "issued"
    );
    if (renewal) return renewal;
    const first = baseIssuedApplication;
    if (first && String(first.applicationYear) === y) return first;
    return first;
  }

  async function buildZkBundleForClaim(epochOverride) {
    const ep = epochOverride ?? epoch;
    const issuedApp = getActiveIssuedAppForEpoch(ep) || selectedApplication || baseIssuedApplication;
    const ot = oneTimeDocsFromApplication(issuedApp);
    const certCid =
      (String(ep) === String(epoch) && renewalIncomeCid) ||
      issuedApp?.incomeCertCid ||
      incomeCertCid ||
      studentDocCid ||
      encryptedDocCid ||
      "";
    const casteCid = ot.casteCert?.cid || issuedApp?.casteCertCid || "";
    const prof = issuedApp?.applicantProfile || studentProfile;
    const incomeVal = prof?.familyAnnualIncome || proofIncome;
    const bundle = await buildZkIdentityBundle({
      incomeINR: incomeVal,
      policyId: issuedApp?.policyId || selectedApplication?.policyId || policyId,
      epoch: ep,
      incomeCertCid: certCid,
      casteCertCid: casteCid,
      caste: prof?.casteCategory || studentProfile?.casteCategory || "OPEN",
      domicileMH: (prof?.domicileMH ?? studentProfile?.domicileMH) !== false,
    });
    setSubjectId(bundle.subjectId);
    setCredentialHash(bundle.credentialHash);
    setNullifierHash(bundle.nullifierHash);
    setIncomeCommitmentHex(bundle.incomeCommitment);
    return bundle;
  }

  async function deriveSubjectIdFromConnectedWallet() {
    if (!account) throw new Error("Connect wallet first.");
    const bundle = await buildZkBundleForClaim(epoch);
    return bundle.subjectId;
  }

  async function deriveSubjectIdFromAddress(addr) {
    if (!ethers.isAddress(addr)) throw new Error("Enter a valid citizen wallet address (0x…).");
    setCitizenWallet(addr);
    const app = applications.find((a) => (a.citizenAddress || "").toLowerCase() === addr.toLowerCase());
    if (app?.subjectId) {
      setSubjectId(app.subjectId);
      if (app.credentialHash) setCredentialHash(app.credentialHash);
      if (app.incomeCommitment) setIncomeCommitmentHex(app.incomeCommitment);
      return app.subjectId;
    }
    throw new Error("Citizen must submit application first (Citizen ID is derived from their private ZK secret).");
  }

  async function generateNewNullifier() {
    const bundle = await buildZkBundleForClaim(epoch);
    return bundle.nullifierHash;
  }

  async function generateCredentialHashFromInputs() {
    const bundle = await buildZkBundleForClaim(epoch);
    return bundle.credentialHash;
  }

  async function refreshClaimedEpochs() {
    if (!isBytes32Hex(subjectId)) return {};
    const readProvider = new ethers.JsonRpcProvider(MST_RPC_URL);
    const gate = gateContract(ethers, readProvider);
    const pid = BigInt(policyId || "0");
    const out = {};
    for (const y of ACADEMIC_YEARS) {
      try {
        out[y] = await gate.claimed(subjectId, pid, BigInt(y));
      } catch {
        out[y] = false;
      }
    }
    setClaimedEpochs(out);
    return out;
  }

  async function uploadIncomeCertificate() {
    setError("");
    const file = incomeCertFile;
    if (!file) {
      setToast({ tone: "error", title: "No file", message: "Click “Choose file” under Income certificate first." });
      throw new Error("Click “Choose file” for the income certificate, then Upload to IPFS.");
    }
    setUploadingIncome(true);
    setStatus("Uploading income certificate…");
    setToast({ tone: "loading", title: "Uploading", message: `Sending to ${PINATA_PROXY_URL}…` });
    try {
      const cid = await pinFileToIpfs(PINATA_PROXY_URL, file);
      setIncomeCertCid(cid);
      setIncomeCertName(file.name);
      setStudentDocCid(cid);
      setEncryptedDocCid(cid);
      setIncomeCertPreviewUrl(ipfsGatewayUrl(cid));
      setStatus(`Income certificate uploaded. CID: ${cid}`);
      setToast({ tone: "success", title: "Uploaded", message: cid });
    } finally {
      setUploadingIncome(false);
    }
  }

  async function loadIssuerCertificatePreview(cid) {
    if (!cid) {
      setIncomeCertPreviewUrl("");
      return;
    }
    setIncomeCertPreviewUrl(ipfsGatewayUrl(cid));
  }

  async function checkIfCredentialExistsForConnectedWallet() {
    if (!account) throw new Error("Connect wallet first.");
    const sid = await deriveSubjectIdFromConnectedWallet();
    const provider = new ethers.JsonRpcProvider(MST_RPC_URL);
    const registry = registryContract(ethers, provider);
    const stored = await registry.credentialHashBySubject(sid);
    const has = stored && stored !== "0x0000000000000000000000000000000000000000000000000000000000000000";
    setHasIssuedCredential(Boolean(has));
    if (has) {
      setCredentialHash(stored);
      setCitizenStep(5);
    }
    await refreshClaimedEpochs().catch(() => {});
    return { subjectId: sid, has, stored };
  }

  function applyToScheme(scheme) {
    const p = schemeToProgram(scheme);
    setSelectedSchemeKey(scheme.key);
    setProgramKey(p.key);
    setPolicyId(String(p.policyId));
    setThreshold(String(p.incomeLimitINR));
    setStudentProfile((prof) => ({
      ...prof,
      department: prof.department || scheme.department || "",
    }));
    setCitizenStep(4);
    setShowPrintPreview(false);
    setToast({ tone: "success", title: "Scheme selected", message: scheme.name });
  }

  async function uploadRenewalIncomeCertificate() {
    if (!renewalIncomeFile) {
      setToast({ tone: "error", title: "No file", message: "Choose the income certificate file for this academic year first." });
      throw new Error("Choose renewal income certificate file");
    }
    setUploadingRenewalIncome(true);
    try {
      const cid = await pinFileToIpfs(PINATA_PROXY_URL, renewalIncomeFile);
      setRenewalIncomeCid(cid);
      setIncomeCertCid(cid);
      setEncryptedDocCid(cid);
      setToast({ tone: "success", title: "Annual income certificate uploaded", message: cid });
    } finally {
      setUploadingRenewalIncome(false);
    }
  }

  async function submitAnnualRenewal() {
    if (!account) throw new Error("Connect wallet first.");
    if (!baseIssuedApplication) throw new Error("Complete first admission and credential issuance first.");
    if (!renewalIncomeCid) throw new Error("Upload income certificate for this academic year first.");
    const bundle = await buildZkBundleForClaim(epoch);
    const body = {
      citizenAddress: account,
      renewalYear: epoch,
      incomeCertCid: renewalIncomeCid,
      incomeCertName: renewalIncomeFile?.name || "",
      familyAnnualIncome: studentProfile.familyAnnualIncome,
      parentApplicationId: baseIssuedApplication.id,
      programKey: baseIssuedApplication.programKey,
      policyId: baseIssuedApplication.policyId,
      subjectId: bundle.subjectId,
      credentialHash: bundle.credentialHash,
      incomeCommitment: bundle.incomeCommitment,
    };
    await fetchJson(`${PINATA_PROXY_URL}/applications/renewal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setToast({
      tone: "success",
      title: "Annual income submitted",
      message: `Institute will verify income for AY ${epoch} and re-issue your credential. Other documents stay on file (ZK).`,
    });
    await fetchMyApplications();
  }

  function printApplicationPreview() {
    setShowPrintPreview(true);
    window.setTimeout(() => window.print(), 300);
  }

  async function setIssuer() {
    setError("");
    setStatus("Updating issuer allowlist…");
    setToast({ tone: "loading", title: "Updating issuer allowlist", message: "Sending transaction…" });
    try {
      const provider = await requireWallet();
      await ensureMstNetwork(provider);
      const signer = await provider.getSigner();
      const registry = registryContract(ethers, signer);
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

  async function prepareCredentialFromApplication(app) {
    if (!app) throw new Error("Select an application first.");
    const ot = oneTimeDocsFromApplication(app);
    const prof = app.applicantProfile || {};
    const bundle = await buildZkIdentityBundle({
      incomeINR: prof.familyAnnualIncome || proofIncome,
      policyId: app.policyId,
      epoch: app.applicationYear || epoch,
      incomeCertCid: app.incomeCertCid || app.encryptedDocCid,
      casteCertCid: ot.casteCert?.cid || app.casteCertCid,
      caste: prof.casteCategory || "OPEN",
      domicileMH: prof.domicileMH !== false,
    });
    setSubjectId(bundle.subjectId);
    setCredentialHash(bundle.credentialHash);
    setIncomeCommitmentHex(bundle.incomeCommitment);
    setEncryptedDocCid(app.incomeCertCid || app.encryptedDocCid || "");
    setPolicyId(String(app.policyId));
    return bundle;
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
      if (selectedApplication) {
        await prepareCredentialFromApplication(selectedApplication);
      }
      if (!isBytes32Hex(subjectId) || !isBytes32Hex(credentialHash)) {
        throw new Error("Load Citizen ID + credential hash from the pending application first.");
      }
      const leaves = await syncMerkleFromServer(PINATA_PROXY_URL);
      const leafBig = bytes32ToBigInt(credentialHash);
      const merkle = await appendLeafPoseidon(leaves, leafBig);
      await pushLeafToServer(PINATA_PROXY_URL, merkle.leafHex);
      setMerkleRoot(merkle.root);

      const expiresAt = Math.floor(Date.now() / 1000) + 86400 * 365 * 5;
      const provider = await requireWallet();
      await ensureMstNetwork(provider);
      const signer = await provider.getSigner();
      const registry = registryContract(ethers, signer);
      const tx = await registry.issueCredential(
        subjectId,
        credentialHash,
        encryptedDocCid || "",
        merkle.root,
        expiresAt
      );
      setStatus(`Tx sent: ${tx.hash}`);
      setLastTx(tx.hash);
      setToast({ tone: "loading", title: "Credential tx sent", message: "Waiting for confirmation…", href: txLink(tx.hash), hrefLabel: "View tx" });
      await tx.wait();
      if (selectedAppId) {
        await markIssued(selectedAppId, tx.hash, {
          merkleRoot: merkle.root,
          merklePathElements: merkle.pathElements,
          merklePathIndices: merkle.pathIndices,
          credentialHash,
          subjectId,
        });
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
    const registryRead = registryContract(ethers, readProvider);
    if (!isBytes32Hex(subjectId) || !isBytes32Hex(credentialHash) || !isBytes32Hex(nullifierHash)) {
      throw new Error("subjectId / credentialHash / nullifierHash must be valid bytes32 hex (0x + 64 hex chars).");
    }
    const stored = await registryRead.credentialHashBySubject(subjectId);
    if (stored === "0x0000000000000000000000000000000000000000000000000000000000000000") {
      setCitizenStep(7);
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

    const gateRead = gateContract(ethers, readProvider);
    const epochNum = BigInt(epoch || "0");
    if (!ACADEMIC_YEARS.map(String).includes(String(epoch))) {
      throw new Error(`Pick a valid academic year: ${ACADEMIC_YEARS.join(", ")}.`);
    }
    const alreadyEpoch = await gateRead.claimed(subjectId, BigInt(policyId), epochNum);
    if (alreadyEpoch) {
      throw new Error(`You already claimed for academic year ${epoch}. Select ${Number(epoch) + 1} or another open year.`);
    }

    setStatus("Generating ZK proof in browser… (this can take a bit)");
    setToast({ tone: "loading", title: "Generating proof", message: "Creating a Groth16 proof in your browser..." });

    const bundle = await buildZkBundleForClaim(epoch);
    const myApp =
      myApplications.find((a) => a.status === "issued") ||
      myApplications.find((a) => a.credentialHash) ||
      null;
    let pathElements = myApp?.merklePathElements;
    let pathIndices = myApp?.merklePathIndices;
    let rootHex = myApp?.merkleRoot || merkleRoot;

    if (!pathElements?.length) {
      const merkleState = await syncMerkleFromServer(PINATA_PROXY_URL);
      const leafField = bytes32ToBigInt(bundle.credentialHash).toString();
      const leafIdx = merkleState.findIndex((l) => String(l) === leafField || String(l).toLowerCase() === bundle.credentialHash.toLowerCase());
      if (leafIdx < 0) {
        throw new Error("Merkle proof not found. Ask issuer to re-issue or sync applications.");
      }
      const proof = await buildMerkleProofForLeafIndex(merkleState, leafIdx);
      pathElements = proof.pathElements;
      pathIndices = proof.pathIndices;
      rootHex = proof.root;
    }

    const readReg = registryContract(ethers, readProvider);
    const onChainRoot = await readReg.merkleRoot();
    if (onChainRoot && onChainRoot !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
      rootHex = onChainRoot;
    }
    setMerkleRoot(rootHex);

    const input = {
      income: bundle.income,
      incomeSalt: bundle.incomeSalt,
      identitySecret: bundle.identitySecret,
      casteCategory: bundle.casteCategory,
      domicileMH: bundle.domicileMH,
      incomeCertHash: bundle.incomeCertHash,
      casteCertHash: bundle.casteCertHash,
      merklePathElements: pathElements,
      merklePathIndices: pathIndices,
      subjectId: BigInt(bundle.subjectId).toString(),
      credentialHash: BigInt(bundle.credentialHash).toString(),
      nullifierHash: BigInt(bundle.nullifierHash).toString(),
      policyId: BigInt(policyId).toString(),
      epoch: BigInt(epoch || "0").toString(),
      incomeCommitment: bundle.incomeCommitment,
      merkleRoot: BigInt(rootHex).toString(),
    };

    await assertZkArtifactsAvailable();

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, ZK_WASM_URL, ZK_ZKEY_URL);

    const callData = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
    const parsed = JSON.parse("[" + callData + "]");
    const [a, b, c, pub] = parsed;

    setStatus("Sending on-chain verification tx…");
    setToast({ tone: "loading", title: "Submitting claim", message: "Sending verification transaction..." });
    const provider = await requireWallet();
    await ensureMstNetwork(provider);
    const signer = await provider.getSigner();
    const gate = gateContract(ethers, signer);
    const tx = await gate.verifyAndClaim(a, b, c, pub);
    setStatus(`Tx sent: ${tx.hash}`);
    setLastTx(tx.hash);
    setToast({ tone: "loading", title: "Tx sent", message: "Waiting for confirmation…", href: txLink(tx.hash), hrefLabel: "View tx" });
    await tx.wait();
    setStatus(`Verified + claimed for academic year ${epoch}.`);
    setLastSuccess(tx.hash);
    await refreshClaimedEpochs().catch(() => {});
    setToast({
      tone: "success",
      title: "Claimed successfully",
      message: `Annual eligibility claim recorded for ${epoch}. Income was not re-disclosed.`,
      href: txLink(tx.hash),
      hrefLabel: "View proof tx",
    });
  }

  async function refreshHistory() {
    setError("");
    setHistoryLoading(true);
    try {
      const provider = new ethers.JsonRpcProvider(MST_RPC_URL);
      const latest = await provider.getBlockNumber();
      const from = Math.max(0, latest - 50_000);

      const registry = registryContract(ethers, provider);
      const gate = gateContract(ethers, provider);

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
    if (hasIssuedCredential) {
      throw new Error(
        "You already completed first admission. For each new academic year: Step 2 → upload only the new income certificate and submit annual renewal (one-time docs stay on file)."
      );
    }
    const certCid = incomeCertCid || studentDocCid || encryptedDocCid;
    if (!certCid) {
      throw new Error("Upload income certificate to IPFS first (Choose file → Upload).");
    }
    if (!oneTimeDocsComplete(oneTimeDocs)) {
      throw new Error(`Upload all one-time documents: ${missingOneTimeLabels(oneTimeDocs).join(", ")}`);
    }
    if (hasSubmittedPending) {
      throw new Error("You already have a pending application. Wait for institute review.");
    }
    const missing = validateProfileForApply(studentProfile);
    if (missing.length) {
      throw new Error(`Complete your profile first: ${missing.join(", ")}`);
    }
    setToast({ tone: "loading", title: "Submitting application", message: "Pinning application snapshot + queue…" });
    let snapshotCid = applicationSnapshotCid;
    try {
      snapshotCid = await pinJsonToIpfs(PINATA_PROXY_URL, {
        pinataContent: {
          schema: "zk-samvidhan/application@1",
          createdAt: new Date().toISOString(),
          applicationYear: epoch,
          scheme: selectedMahadbtScheme,
          applicantProfile: { ...studentProfile, wallet: account },
          documents: { incomeCertCid: certCid, ...oneTimeDocsToPayload(oneTimeDocs).oneTimeDocs },
        },
        pinataMetadata: { name: `application-${account}-${epoch}` },
      });
      setApplicationSnapshotCid(snapshotCid);
    } catch (e) {
      console.warn("snapshot pin failed", e);
    }
    const zkBundle = await buildZkIdentityBundle({
      incomeINR: proofIncome,
      policyId,
      epoch: epoch || defaultAcademicYear(),
      incomeCertCid: certCid,
      casteCertCid: oneTimeDocs.casteCert?.cid || "",
      caste: studentProfile?.casteCategory || "OPEN",
      domicileMH: studentProfile?.domicileMH !== false,
    });
    setSubjectId(zkBundle.subjectId);
    setCredentialHash(zkBundle.credentialHash);
    setIncomeCommitmentHex(zkBundle.incomeCommitment);

    const body = {
      citizenAddress: account,
      programKey,
      policyId,
      schemeKey: selectedSchemeKey || programKey,
      schemeName: selectedMahadbtScheme?.name || selectedProgram.name,
      department: selectedMahadbtScheme?.department || "",
      encryptedDocCid: certCid,
      incomeCertCid: certCid,
      incomeCertName: incomeCertName || incomeCertFile?.name || "",
      ...oneTimeDocsToPayload(oneTimeDocs),
      applicationYear: epoch || defaultAcademicYear(),
      applicationType: "first_admission",
      applicantProfile: { ...studentProfile, wallet: account },
      applicationSnapshotCid: snapshotCid || "",
      subjectId: zkBundle.subjectId,
      credentialHash: zkBundle.credentialHash,
      incomeCommitment: zkBundle.incomeCommitment,
    };
    await fetchJson(`${PINATA_PROXY_URL}/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setToast({ tone: "success", title: "Application submitted", message: "Status: Pending institute verification." });
    await fetchMyApplications();
    setCitizenStep(5);
  }

  async function markIssued(appId, txHash, zkMeta = {}) {
    await fetchJson(`${PINATA_PROXY_URL}/applications/${appId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "issued",
        issuedTxHash: txHash,
        merkleRoot: zkMeta.merkleRoot || "",
        merklePathElements: zkMeta.merklePathElements || [],
        merklePathIndices: zkMeta.merklePathIndices || [],
        credentialHash: zkMeta.credentialHash || "",
        subjectId: zkMeta.subjectId || "",
      }),
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
          <LiveDeploymentBar
            pinataProxyUrl={PINATA_PROXY_URL}
            persistence={backendPersistence}
            pinataOk={backendPinataOk}
          />
        </div>
        ) : null}

        {role ? (
        <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={connect}>{account ? `Connected: ${short(account)}` : "Connect Wallet"}</Button>
            <a className="text-sm text-slate-600 hover:text-slate-900" href={explorerLinks.registry} target="_blank" rel="noreferrer" title={REGISTRY_ADDRESS}>
              Registry {short(REGISTRY_ADDRESS)}
            </a>
            <a className="text-sm text-slate-600 hover:text-slate-900" href={explorerLinks.gate} target="_blank" rel="noreferrer" title={GATE_ADDRESS}>
              Gate {short(GATE_ADDRESS)}
            </a>
            <a className="text-sm text-slate-600 hover:text-slate-900" href={explorerLinks.verifier} target="_blank" rel="noreferrer" title={VERIFIER_ADDRESS}>
              Verifier
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

        {backendPersistence === "none" ? (
          <div className="mt-5 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <div className="font-semibold">Backend cannot save applications yet</div>
            <p className="mt-2">
              Add <span className="font-mono">PINATA_JWT</span> to the <strong>zkp-neon</strong> Vercel project (same JWT as uploads) and redeploy.
              Applications will persist on IPFS automatically — <strong>no Vercel KV required</strong>.
            </p>
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
                                  const cert = a.incomeCertCid || a.encryptedDocCid || "";
                                  loadIssuerCertificatePreview(cert).catch(() => {});
                                  if (a.subjectId) setSubjectId(a.subjectId);
                                  if (a.credentialHash) setCredentialHash(a.credentialHash);
                                  if (a.incomeCommitment) setIncomeCommitmentHex(a.incomeCommitment);
                                  if (a.merkleRoot) setMerkleRoot(a.merkleRoot);
                                }}
                                className="mt-1 h-4 w-4 accent-blue-600"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="font-semibold text-slate-900">{a.schemeName || a.programKey}</div>
                                  <div className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900 border border-amber-200">
                                    {a.applicationType === "annual_renewal" ? `Renewal ${a.applicationYear}` : "First admission"} · {a.status || "submitted"}
                                  </div>
                                </div>
                                <div className="mt-1 text-xs text-slate-600">
                                  {a.applicantProfile?.applicantName || "—"} · {a.applicantProfile?.mobile || "—"} · {a.applicantProfile?.collegeName || "—"}
                                </div>
                                <div className="mt-1 text-xs text-slate-600">
                                  Wallet:{" "}
                                  <a className="font-mono text-blue-700 hover:text-blue-800" href={addrLink(a.citizenAddress)} target="_blank" rel="noreferrer">
                                    {short(a.citizenAddress)}
                                  </a>
                                </div>
                                <div className="mt-1 text-xs text-slate-600">
                                  Policy ID: <span className="font-mono text-slate-900">{a.policyId}</span>
                                  {(a.incomeCertCid || a.encryptedDocCid) ? (
                                    <>
                                      {" "}
                                      · Cert:{" "}
                                      <a
                                        className="font-mono text-blue-700 hover:text-blue-800"
                                        href={ipfsGatewayUrl(a.incomeCertCid || a.encryptedDocCid)}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        {short(a.incomeCertCid || a.encryptedDocCid)}
                                      </a>
                                    </>
                                  ) : (
                                    <span className="text-red-700"> · No income certificate</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}

                    {selectedApplication ? <ApplicationDetailPanel application={selectedApplication} ipfsGatewayUrl={ipfsGatewayUrl} /> : null}

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
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-600">Step 2 — Review documents</div>
                    <div className="mt-2 text-sm text-slate-700">
                      Verify <strong>income</strong> and <strong>caste</strong> certificates on IPFS before issuing the on-chain credential.
                    </div>
                    {selectedApplication ? <ApplicationDetailPanel application={selectedApplication} ipfsGatewayUrl={ipfsGatewayUrl} /> : null}
                    {!selectedAppDocsReady ? (
                      <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                        Missing documents: {!selectedAppCertCid ? "income certificate " : ""}
                        {!selectedAppCasteCid ? "caste certificate " : ""}— ask the student to re-submit both.
                      </div>
                    ) : (
                      <div className="mt-3 grid gap-4 md:grid-cols-2">
                        <div className="rounded-xl border border-slate-200 bg-white p-3">
                          <div className="text-xs font-semibold uppercase text-slate-600">Income certificate</div>
                          <a className="mt-2 inline-block text-sm font-semibold text-blue-700" href={ipfsGatewayUrl(selectedAppCertCid)} target="_blank" rel="noreferrer">
                            Open on IPFS →
                          </a>
                          <iframe title="Income" src={ipfsGatewayUrl(selectedAppCertCid)} className="mt-2 h-64 w-full rounded-lg border border-slate-200" />
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-3">
                          <div className="text-xs font-semibold uppercase text-slate-600">Caste certificate</div>
                          <a className="mt-2 inline-block text-sm font-semibold text-blue-700" href={ipfsGatewayUrl(selectedAppCasteCid)} target="_blank" rel="noreferrer">
                            Open on IPFS →
                          </a>
                          <iframe title="Caste" src={ipfsGatewayUrl(selectedAppCasteCid)} className="mt-2 h-64 w-full rounded-lg border border-slate-200" />
                        </div>
                      </div>
                    )}
                    <div className="mt-4 flex items-center justify-between">
                      <Button variant="secondary" type="button" onClick={() => setIssuerStep(0)}>
                        ← Back
                      </Button>
                      <Button
                        type="button"
                        onClick={() => setIssuerStep(2)}
                        disabled={!account || (!isCurrentIssuer && !isAdmin) || !selectedAppDocsReady}
                        title={!selectedAppDocsReady ? "Both certificates required" : undefined}
                      >
                        Documents OK → Issue
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
                          onClick={async () => {
                            try {
                              const sid = await deriveSubjectIdFromAddress(citizenWallet);
                              await generateCredentialHashFromInputs();
                              setStatus(`Loaded Citizen ID from application for ${short(citizenWallet)}.`);
                              copyText(sid).catch(() => {});
                            } catch (e) {
                              setError(String(e?.message || e));
                            }
                          }}
                        >
                          Load from application
                        </Button>
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        Citizen ID is derived from the student&apos;s private ZK secret at application time (not from wallet).
                      </div>
                    </Field>

                    <Field label="Credential hash (auto-generated)">
                      <div className="flex gap-2">
                        <Input value={credentialHash} onChange={(e) => setCredentialHash(e.target.value)} />
                        <Button
                          variant="secondary"
                          type="button"
                          onClick={async () => {
                            try {
                              const h = await generateCredentialHashFromInputs();
                              setStatus("Generated credential hash (Poseidon).");
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
                      disabled={!account || (!isCurrentIssuer && !isAdmin) || !selectedAppId || !selectedAppDocsReady}
                      title={
                        !selectedAppDocsReady
                          ? "Student must upload income and caste certificates"
                          : !isCurrentIssuer && !isAdmin
                            ? "You must be an allowed issuer (or admin) to issue"
                            : undefined
                      }
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
                  Registry: <a className="text-blue-700 hover:text-blue-800" href={explorerLinks.registry} target="_blank" rel="noreferrer" title={REGISTRY_ADDRESS}>{short(REGISTRY_ADDRESS)}</a>{" "}
                  · Gate: <a className="text-blue-700 hover:text-blue-800" href={explorerLinks.gate} target="_blank" rel="noreferrer" title={GATE_ADDRESS}>{short(GATE_ADDRESS)}</a>{" "}
                  · Verifier: <a className="text-blue-700 hover:text-blue-800" href={explorerLinks.verifier} target="_blank" rel="noreferrer" title={VERIFIER_ADDRESS}>{short(VERIFIER_ADDRESS)}</a>
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
              subtitle="MahaDBT-style flow: Connect wallet → Academic year → Profile → Eligible schemes → Print & submit → Institute verify → ZK claim."
            >
              <div className="grid gap-3 print:hidden">
                <Stepper steps={citizenSteps} current={citizenStepperIndex} />

                {citizenStep === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-600">Step 1 — Connect wallet</div>
                    <div className="mt-2 text-sm text-slate-700">
                      Connect your MetaMask wallet on <strong>MST Testnet</strong> first. This wallet becomes your Citizen ID for ZK‑Samvidhan.
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <Button onClick={connect}>{account ? `Connected: ${short(account)}` : "Connect Wallet"}</Button>
                      {account ? (
                        <span className="text-xs font-semibold text-emerald-700">Wallet ready</span>
                      ) : (
                        <span className="text-xs text-amber-800">Required before continuing</span>
                      )}
                    </div>
                    <div className="mt-4 flex justify-end">
                      <Button
                        type="button"
                        disabled={!account}
                        onClick={() => {
                          checkIfCredentialExistsForConnectedWallet().catch(() => {});
                          setCitizenStep(1);
                        }}
                      >
                        Next → Academic year
                      </Button>
                    </div>
                  </div>
                ) : null}

                {citizenStep === 1 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-600">Step 2 — Academic year (AY)</div>
                    <div className="mt-2 text-sm text-slate-700">Select the academic year for this application / renewal claim (e.g. AY 2025-2026 → <strong>2026</strong>, AY 2026-2027 → <strong>2027</strong>).</div>
                    <div className="mt-3 max-w-xs">
                      <Field label="Academic year">
                        <select
                          value={epoch}
                          onChange={(e) => setEpoch(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                        >
                          {ACADEMIC_YEARS.map((y) => (
                            <option key={y} value={String(y)}>
                              AY {y - 1}-{y} (epoch {y})
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    {hasIssuedCredential ? (
                      <div className="mt-3 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-slate-800">
                        <div>
                          <strong>Annual renewal (AY {epoch})</strong> — upload only a new <strong>income certificate</strong> and
                          updated family income. Ration card, domicile, CAP ID, admission letter, and caste certificate stay on file
                          from your first admission (used in ZK proof, not re-uploaded).
                        </div>
                        {baseIssuedApplication?.oneTimeDocs ? (
                          <div className="text-xs text-slate-600">
                            One-time docs on file: {ONE_TIME_DOCUMENTS.map((d) => d.label).join(" · ")}
                          </div>
                        ) : null}
                        <Field label={`Family annual income (₹) for AY ${epoch}`}>
                          <Input
                            value={studentProfile.familyAnnualIncome}
                            onChange={(e) => setStudentProfile((p) => ({ ...p, familyAnnualIncome: e.target.value }))}
                          />
                        </Field>
                        <DocumentUploadField
                          label={`Income certificate (Tahsildar) — academic year ${epoch}`}
                          required
                          file={renewalIncomeFile}
                          onFileSelect={(f) => {
                            setRenewalIncomeFile(f);
                            setRenewalIncomeCid("");
                          }}
                          cid={renewalIncomeCid}
                          uploading={uploadingRenewalIncome}
                          onUpload={() => uploadRenewalIncomeCertificate().catch((e) => setError(String(e?.message || e)))}
                          tone="amber"
                        />
                        {renewalPendingForYear ? (
                          <div className="rounded-lg border border-amber-300 bg-amber-100/80 px-3 py-2 text-xs">
                            Income submitted for {epoch} — waiting for institute to verify and re-issue credential.
                          </div>
                        ) : renewalIssuedForYear ? (
                          <div className="rounded-lg border border-emerald-300 bg-emerald-100/80 px-3 py-2 text-xs">
                            Income verified for {epoch}. Continue to ZK claim.
                          </div>
                        ) : null}
                        <Button
                          type="button"
                          disabled={!renewalIncomeCid || renewalPendingForYear}
                          onClick={() => submitAnnualRenewal().catch((e) => setError(String(e?.message || e)))}
                        >
                          Submit annual income for verification
                        </Button>
                      </div>
                    ) : null}
                    <div className="mt-4 flex justify-between">
                      <Button variant="secondary" type="button" onClick={() => setCitizenStep(0)}>
                        ← Back
                      </Button>
                      <Button
                        type="button"
                        onClick={() => setCitizenStep(hasIssuedCredential ? 5 : 2)}
                      >
                        Next →
                      </Button>
                    </div>
                  </div>
                ) : null}

                {citizenStep === 2 && !hasIssuedCredential ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-600">Step 3 — Profile (MahaDBT-style)</div>
                    <div className="mt-2 text-sm text-slate-700">
                      Fill personal, education and bank details as on MahaDBT. All * fields are required before Apply.
                    </div>
                    <div className="mt-3 text-xs font-bold uppercase text-slate-500">Personal *</div>
                    <div className="mt-2 grid gap-3 md:grid-cols-2">
                      <Field label="Applicant name (SSC) *">
                        <Input value={studentProfile.applicantName} onChange={(e) => setStudentProfile((p) => ({ ...p, applicantName: e.target.value }))} />
                      </Field>
                      <Field label="Date of birth">
                        <Input value={studentProfile.dateOfBirth} onChange={(e) => setStudentProfile((p) => ({ ...p, dateOfBirth: e.target.value }))} />
                      </Field>
                      <Field label="Gender">
                        <select value={studentProfile.gender} onChange={(e) => setStudentProfile((p) => ({ ...p, gender: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                          <option>Male</option>
                          <option>Female</option>
                          <option>Other</option>
                        </select>
                      </Field>
                      <Field label="Mobile *">
                        <Input value={studentProfile.mobile} onChange={(e) => setStudentProfile((p) => ({ ...p, mobile: e.target.value }))} />
                      </Field>
                      <Field label="Email *">
                        <Input value={studentProfile.email} onChange={(e) => setStudentProfile((p) => ({ ...p, email: e.target.value }))} />
                      </Field>
                      <Field label="Parent / guardian mobile">
                        <Input value={studentProfile.parentMobile} onChange={(e) => setStudentProfile((p) => ({ ...p, parentMobile: e.target.value }))} />
                      </Field>
                      <Field label="Aadhaar (last 4 digits)">
                        <Input value={studentProfile.aadhaarLast4} onChange={(e) => setStudentProfile((p) => ({ ...p, aadhaarLast4: e.target.value }))} maxLength={4} />
                      </Field>
                    </div>
                    <div className="mt-4 text-xs font-bold uppercase text-slate-500">Caste & income *</div>
                    <div className="mt-2 grid gap-3 md:grid-cols-2">
                      <Field label="Caste category *">
                        <select value={studentProfile.casteCategory} onChange={(e) => setStudentProfile((p) => ({ ...p, casteCategory: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                          {CASTE_CATEGORIES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Caste name">
                        <Input value={studentProfile.casteName} onChange={(e) => setStudentProfile((p) => ({ ...p, casteName: e.target.value }))} />
                      </Field>
                      <Field label="Religion *">
                        <select value={studentProfile.religion} onChange={(e) => setStudentProfile((p) => ({ ...p, religion: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                          {RELIGIONS.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Family annual income (₹) *">
                        <Input value={studentProfile.familyAnnualIncome} onChange={(e) => setStudentProfile((p) => ({ ...p, familyAnnualIncome: e.target.value }))} />
                      </Field>
                      <Field label="Income certificate no.">
                        <Input value={studentProfile.incomeCertNo} onChange={(e) => setStudentProfile((p) => ({ ...p, incomeCertNo: e.target.value }))} />
                      </Field>
                      <Field label="Income cert. issue date">
                        <Input value={studentProfile.incomeCertIssueDate} onChange={(e) => setStudentProfile((p) => ({ ...p, incomeCertIssueDate: e.target.value }))} placeholder="DD/MM/YYYY" />
                      </Field>
                      <Field label="Caste certificate no.">
                        <Input value={studentProfile.casteCertNo} onChange={(e) => setStudentProfile((p) => ({ ...p, casteCertNo: e.target.value }))} />
                      </Field>
                      <Field label="Issuing district">
                        <Input value={studentProfile.issuingDistrict} onChange={(e) => setStudentProfile((p) => ({ ...p, issuingDistrict: e.target.value }))} />
                      </Field>
                    </div>
                    <div className="mt-4 text-xs font-bold uppercase text-slate-500">College / course *</div>
                    <div className="mt-2 grid gap-3 md:grid-cols-2">
                      <Field label="College / institute *">
                        <Input value={studentProfile.collegeName} onChange={(e) => setStudentProfile((p) => ({ ...p, collegeName: e.target.value }))} />
                      </Field>
                      <Field label="Institute code">
                        <Input value={studentProfile.instituteCode} onChange={(e) => setStudentProfile((p) => ({ ...p, instituteCode: e.target.value }))} />
                      </Field>
                      <Field label="Department *">
                        <Input value={studentProfile.department} onChange={(e) => setStudentProfile((p) => ({ ...p, department: e.target.value }))} />
                      </Field>
                      <Field label="Course *">
                        <Input value={studentProfile.course} onChange={(e) => setStudentProfile((p) => ({ ...p, course: e.target.value }))} />
                      </Field>
                      <Field label="Course year *">
                        <Input value={studentProfile.courseYear} onChange={(e) => setStudentProfile((p) => ({ ...p, courseYear: e.target.value }))} />
                      </Field>
                      <Field label="PRN / roll no. *">
                        <Input value={studentProfile.prn} onChange={(e) => setStudentProfile((p) => ({ ...p, prn: e.target.value }))} />
                      </Field>
                    </div>
                    <div className="mt-4 text-xs font-bold uppercase text-slate-500">Bank</div>
                    <div className="mt-2 grid gap-3 md:grid-cols-2">
                      <Field label="Bank account no.">
                        <Input value={studentProfile.bankAccount} onChange={(e) => setStudentProfile((p) => ({ ...p, bankAccount: e.target.value }))} />
                      </Field>
                      <Field label="IFSC">
                        <Input value={studentProfile.ifsc} onChange={(e) => setStudentProfile((p) => ({ ...p, ifsc: e.target.value }))} />
                      </Field>
                      <Field label="Branch">
                        <Input value={studentProfile.branchName} onChange={(e) => setStudentProfile((p) => ({ ...p, branchName: e.target.value }))} />
                      </Field>
                    </div>
                    <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={studentProfile.domicileMH !== false} onChange={(e) => setStudentProfile((p) => ({ ...p, domicileMH: e.target.checked }))} className="h-4 w-4" />
                      Domicile of Maharashtra *
                    </label>
                    <div className="mt-4 flex justify-between">
                      <Button variant="secondary" onClick={() => setCitizenStep(1)}>
                        ← Back
                      </Button>
                      <Button onClick={() => setCitizenStep(3)}>Next → Eligible schemes</Button>
                    </div>
                  </div>
                ) : null}

                {citizenStep === 3 && !hasIssuedCredential ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-600">Step 4 — Suggested eligible schemes</div>
                    <div className="mt-2 text-sm text-slate-700">
                      Based on caste <strong>{studentProfile.casteCategory}</strong>, religion <strong>{studentProfile.religion}</strong>, income{" "}
                      <strong>₹{Number(studentProfile.familyAnnualIncome || 0).toLocaleString("en-IN")}</strong>.
                    </div>
                    <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
                      <table className="min-w-full text-left text-sm">
                        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-600">
                          <tr>
                            <th className="px-3 py-2">Scheme name</th>
                            <th className="px-3 py-2">Department</th>
                            <th className="px-3 py-2">Type</th>
                            <th className="px-3 py-2">Income limit</th>
                            <th className="px-3 py-2">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {eligibleSchemes.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="px-3 py-4 text-slate-600">
                                No schemes match your profile. Adjust income or caste details.
                              </td>
                            </tr>
                          ) : (
                            eligibleSchemes.map((s) => (
                              <tr key={s.key} className="border-b border-slate-100">
                                <td className="px-3 py-2 font-medium text-slate-900">{s.name}</td>
                                <td className="px-3 py-2 text-slate-600">{s.department}</td>
                                <td className="px-3 py-2 text-slate-600">{s.schemeType}</td>
                                <td className="px-3 py-2">≤ ₹{s.incomeLimitINR.toLocaleString("en-IN")}</td>
                                <td className="px-3 py-2">
                                  <Button type="button" onClick={() => applyToScheme(s)}>
                                    Apply
                                  </Button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-4 flex justify-between">
                      <Button variant="secondary" onClick={() => setCitizenStep(2)}>
                        ← Back
                      </Button>
                    </div>
                  </div>
                ) : null}

                {citizenStep === 4 && !hasIssuedCredential ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-600">Step 5 — Apply online (documents + print)</div>
                    {selectedMahadbtScheme ? (
                      <div className="mt-2 rounded-xl border border-blue-200 bg-blue-50/80 p-3 text-sm">
                        <div className="font-semibold text-slate-900">{selectedMahadbtScheme.name}</div>
                        <div className="text-slate-600">{selectedMahadbtScheme.department} · AY epoch {epoch}</div>
                      </div>
                    ) : null}
                    {backendPinataOk === false ? (
                      <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                        Backend cannot upload: <span className="font-mono">{PINATA_PROXY_URL}</span> has no PINATA_JWT. Set it in server <code>.env</code> or Vercel (zkp-neon) and restart.
                      </div>
                    ) : null}
                    <div className="mt-3 space-y-4">
                      <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                        <div className="text-xs font-bold uppercase text-amber-900">Income certificate — this academic year ({epoch})</div>
                        <p className="mt-1 text-xs text-slate-600">Required every year (income may change). Upload fresh certificate for AY {epoch}.</p>
                        <div className="mt-2">
                          <DocumentUploadField
                            label={`Income certificate (Tahsildar) — ${epoch}`}
                            required
                            file={incomeCertFile}
                            onFileSelect={(f) => {
                              setIncomeCertFile(f);
                              setIncomeCertCid("");
                              if (f) setToast({ tone: "success", title: "Income file selected", message: f.name });
                            }}
                            cid={incomeCertCid}
                            uploading={uploadingIncome}
                            onUpload={() => uploadIncomeCertificate().catch((e) => setError(String(e?.message || e)))}
                            tone="amber"
                          />
                        </div>
                      </div>
                      <OneTimeDocsUpload
                        docs={oneTimeDocs}
                        setDocs={setOneTimeDocs}
                        pinataProxyUrl={PINATA_PROXY_URL}
                        onError={setError}
                        onToast={setToast}
                      />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          const miss = validateProfileForApply(studentProfile);
                          if (miss.length) {
                            setError(`Complete profile (Step 3): ${miss.join(", ")}`);
                            setCitizenStep(2);
                            return;
                          }
                          setShowPrintPreview(true);
                          printApplicationPreview();
                        }}
                      >
                        Preview / Print application
                      </Button>
                      <Button
                        disabled={!incomeCertCid || !oneTimeDocsComplete(oneTimeDocs) || hasSubmittedPending}
                        title={
                          !incomeCertCid
                            ? "Upload income certificate for this year"
                            : !oneTimeDocsComplete(oneTimeDocs)
                              ? "Upload all one-time documents"
                              : undefined
                        }
                        onClick={() => submitScholarshipApplication().catch((e) => setError(String(e?.message || e)))}
                      >
                        Submit to institute
                      </Button>
                    </div>
                    <div className="mt-4 flex justify-between">
                      <Button variant="secondary" onClick={() => setCitizenStep(3)}>
                        ← Back
                      </Button>
                    </div>
                  </div>
                ) : null}

                {showPrintPreview && !hasIssuedCredential ? (
                  <ApplicationPrint
                    profile={studentProfile}
                    account={account}
                    epoch={epoch}
                    scheme={selectedMahadbtScheme}
                    incomeCertCid={incomeCertCid}
                    casteCertCid={casteCertCid}
                    oneTimeDocs={oneTimeDocs}
                    applicationSnapshotCid={applicationSnapshotCid}
                  />
                ) : null}

                {citizenStep === 5 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-600">Step 6 — Your Citizen ID</div>
                    <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                      Your Citizen ID is derived from a private ZK secret in this browser (not your wallet address). Issuer loads the same ID from your submitted application.
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        variant="secondary"
                        type="button"
                        onClick={async () => {
                          try {
                            const sid = await deriveSubjectIdFromConnectedWallet();
                            setStatus("Citizen ID derived from your private ZK secret.");
                            copyText(sid).catch(() => {});
                          } catch (e) {
                            setError(String(e?.message || e));
                          }
                        }}
                      >
                        Generate Citizen ID
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
                      <Button variant="secondary" type="button" onClick={() => setCitizenStep(hasIssuedCredential ? 1 : 4)}>
                        ← Back
                      </Button>
                      <Button
                        type="button"
                        onClick={() => {
                          refreshClaimedEpochs().catch(() => {});
                          setCitizenStep(6);
                        }}
                        disabled={!isBytes32Hex(subjectId)}
                      >
                        Next → ZK claim
                      </Button>
                    </div>
                  </div>
                ) : null}

                {citizenStep === 6 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-600">
                      Step 7 — {hasIssuedCredential ? "Annual ZK claim" : "ZK claim"}
                    </div>
                    <div className="mt-2 grid gap-3 md:grid-cols-2">
                      <Field label="Academic year (selected earlier)">
                        <Input value={`AY ${Number(epoch) - 1}-${epoch} (epoch ${epoch})`} disabled />
                      </Field>
                      <Field label="Scheme threshold (public, from policy)">
                        <Input value={threshold} disabled />
                      </Field>
                    </div>
                    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-slate-800">
                      {hasIssuedCredential ? (
                        <>
                          Renewal: your income was verified at issuance. You do <strong>not</strong> re-upload a certificate or re-enter income. The proof only shows you still meet the scheme limit (≤ ₹
                          {Number(threshold).toLocaleString("en-IN")}/year).
                        </>
                      ) : (
                        <>
                          After the institute issues your credential, your claim uses the verified eligibility bound — income amount is not shown in the portal.
                        </>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                      {ACADEMIC_YEARS.map((y) => (
                        <span
                          key={y}
                          className={`rounded-full px-2 py-0.5 border ${
                            claimedEpochs[y] ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-slate-50 border-slate-200"
                          }`}
                        >
                          {y}: {claimedEpochs[y] ? "claimed" : "open"}
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        variant="secondary"
                        type="button"
                        onClick={async () => {
                          try {
                            const h = await generateCredentialHashFromInputs();
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
                        onClick={async () => {
                          const n = await generateNewNullifier();
                          setStatus("Generated one-time nullifier for this academic year.");
                          copyText(n).catch(() => {});
                        }}
                      >
                        New nullifier
                      </Button>
                      <Button
                        type="button"
                        onClick={() =>
                          generateProofAndClaim()
                            .then(() => setCitizenStep(7))
                            .catch((e) => setError(String(e?.message || e)))
                        }
                        disabled={!canClaimForYear || claimedEpochs[Number(epoch)]}
                        title={
                          !hasIssuedCredential
                            ? "Claim is enabled only after the institute issues your credential."
                            : !canClaimForYear
                              ? `Submit and get institute approval for ${epoch} income first`
                              : claimedEpochs[Number(epoch)]
                                ? `You already claimed for ${epoch}.`
                                : undefined
                        }
                      >
                        Submit annual claim ({epoch})
                      </Button>
                    </div>
                    <div className="mt-2 text-xs text-slate-600">
                      Uses ZK files from <code className="rounded bg-white/10 px-1 py-0.5">/public/zk</code> and submits on-chain.
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <Button variant="secondary" type="button" onClick={() => setCitizenStep(5)}>
                        ← Back
                      </Button>
                      <Button variant="secondary" type="button" onClick={() => setCitizenStep(7)}>
                        Skip to status →
                      </Button>
                    </div>
                  </div>
                ) : null}

                {citizenStep === 7 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-600">Step 8 — Status</div>
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
                        No claim submitted yet. Go back to ZK claim step after institute issues your credential.
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
                      <Button variant="secondary" type="button" onClick={() => setCitizenStep(6)}>
                        ← Back
                      </Button>
                      <Button variant="secondary" type="button" onClick={() => setCitizenStep(0)}>
                        Start from wallet
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
                After <span className="font-semibold text-slate-900">Print & Submit</span>, the institute reviews your IPFS documents and issues an on-chain credential. Then complete <span className="font-semibold text-slate-900">ZK claim</span> for the selected academic year.
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
