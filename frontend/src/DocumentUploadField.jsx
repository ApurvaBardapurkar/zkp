import { useRef } from "react";

const ACCEPT = ".pdf,.jpg,.jpeg,.png,image/jpeg,image/png,application/pdf";

/**
 * Two-step upload: Choose file → Upload to IPFS (avoids native input UX issues on Windows).
 */
export function DocumentUploadField({
  label,
  required,
  file,
  onFileSelect,
  cid,
  uploading,
  onUpload,
  tone = "amber",
}) {
  const inputRef = useRef(null);
  const border = tone === "amber" ? "border-amber-200 bg-amber-50/60" : "border-slate-200 bg-white";

  const pickFile = () => {
    inputRef.current?.click();
  };

  const handleChange = (e) => {
    const f = e.target.files?.[0] || null;
    onFileSelect(f);
    // allow re-selecting the same filename later
    e.target.value = "";
  };

  const handleUpload = () => {
    if (!file) {
      pickFile();
      return;
    }
    onUpload();
  };

  return (
    <div className={`rounded-xl border p-3 ${border}`}>
      <div className="text-xs font-semibold uppercase text-slate-800">
        {label}
        {required ? " *" : ""}
      </div>
      <p className="mt-1 text-xs text-slate-600">Step A: Choose file · Step B: Upload to IPFS (max 5 MB)</p>

      <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={handleChange} />

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={pickFile}
          className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
        >
          {file ? "Change file" : "Choose file"}
        </button>
        <button
          type="button"
          onClick={handleUpload}
          disabled={uploading}
          className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {uploading ? "Uploading…" : cid ? "Re-upload" : "Upload to IPFS"}
        </button>
      </div>

      <div className="mt-2 rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-xs text-slate-700">
        {file ? (
          <>
            <span className="font-semibold text-emerald-800">Ready:</span> {file.name} ({Math.max(1, Math.round(file.size / 1024))} KB)
          </>
        ) : (
          <span className="text-amber-900">No file chosen — click <strong>Choose file</strong> first</span>
        )}
      </div>

      {cid ? (
        <div className="mt-2 text-xs text-emerald-800">
          ✓ On IPFS: <code className="break-all">{cid}</code>
        </div>
      ) : file ? (
        <div className="mt-2 text-xs text-slate-600">File selected. Click <strong>Upload to IPFS</strong> to pin it.</div>
      ) : null}
    </div>
  );
}
