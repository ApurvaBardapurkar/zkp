import { useEffect, useState } from "react";
import { GATE_ADDRESS, REGISTRY_ADDRESS, VERIFIER_ADDRESS, addrLink } from "./chainConfig.js";
import { ZK_WASM_URL, ZK_ZKEY_URL } from "./zkArtifacts.js";

function short(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function LiveDeploymentBar({ pinataProxyUrl, persistence, pinataOk }) {
  const [zkOk, setZkOk] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [w, z] = await Promise.all([
          fetch(ZK_WASM_URL, { method: "HEAD" }),
          fetch(ZK_ZKEY_URL, { method: "HEAD" }),
        ]);
        if (!cancelled) setZkOk(w.ok && z.ok);
      } catch {
        if (!cancelled) setZkOk(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-sky-50 p-4 text-sm text-slate-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-blue-600 px-2.5 py-0.5 text-xs font-bold text-white">ZK V2 LIVE</span>
        <span className="text-slate-600">MST Testnet · Groth16 scholarship circuit</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs">
        <span>
          Registry{" "}
          <a className="text-blue-700 hover:underline" href={addrLink(REGISTRY_ADDRESS)} target="_blank" rel="noreferrer">
            {short(REGISTRY_ADDRESS)}
          </a>
        </span>
        <span>
          Gate{" "}
          <a className="text-blue-700 hover:underline" href={addrLink(GATE_ADDRESS)} target="_blank" rel="noreferrer">
            {short(GATE_ADDRESS)}
          </a>
        </span>
        <span>
          Verifier{" "}
          <a className="text-blue-700 hover:underline" href={addrLink(VERIFIER_ADDRESS)} target="_blank" rel="noreferrer">
            {short(VERIFIER_ADDRESS)}
          </a>
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
        <span>
          API: <span className="font-semibold text-slate-800">{pinataProxyUrl.replace(/^https?:\/\//, "")}</span>
          {persistence ? ` · persistence: ${persistence}` : ""}
          {pinataOk === true ? " · Pinata ✓" : pinataOk === false ? " · Pinata ✗" : ""}
        </span>
        <span>
          ZK files:{" "}
          {zkOk === true ? (
            <span className="font-semibold text-emerald-700">scholarship wasm + zkey ✓</span>
          ) : zkOk === false ? (
            <span className="font-semibold text-red-700">missing — redeploy frontend with /public/zk</span>
          ) : (
            "checking…"
          )}
        </span>
      </div>
    </div>
  );
}
