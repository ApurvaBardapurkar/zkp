import { DocumentUploadField } from "./DocumentUploadField.jsx";
import { ONE_TIME_DOCUMENTS } from "./documentsConfig.js";
import { pinFileToIpfs } from "./pinataUpload.js";

export function OneTimeDocsUpload({ docs, setDocs, pinataProxyUrl, onError, onToast }) {
  async function uploadDoc(key, label) {
    const entry = docs[key];
    if (!entry?.file) {
      onToast?.({ tone: "error", title: "No file", message: `Choose file for ${label} first.` });
      throw new Error(`Choose file for ${label}`);
    }
    onToast?.({ tone: "loading", title: "Uploading", message: `${label} → IPFS…` });
    const cid = await pinFileToIpfs(pinataProxyUrl, entry.file);
    setDocs((prev) => ({
      ...prev,
      [key]: { ...prev[key], cid, name: entry.file.name },
    }));
    onToast?.({ tone: "success", title: "Uploaded", message: `${label}: ${cid}` });
    return cid;
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
        <strong>One-time documents</strong> — upload once at first admission. You will <em>not</em> upload these again each year;
        renewal only needs a fresh <strong>income certificate</strong>.
      </div>
      {ONE_TIME_DOCUMENTS.map((d) => (
        <DocumentUploadField
          key={d.key}
          label={d.label}
          required={d.required}
          file={docs[d.key]?.file}
          onFileSelect={(f) =>
            setDocs((prev) => ({
              ...prev,
              [d.key]: { ...prev[d.key], file: f, cid: f ? "" : prev[d.key]?.cid },
            }))
          }
          cid={docs[d.key]?.cid}
          uploading={false}
          onUpload={() => uploadDoc(d.key, d.label).catch((e) => onError?.(String(e?.message || e)))}
          tone={d.key === "casteCert" ? "slate" : "amber"}
        />
      ))}
    </div>
  );
}
