/** V2 Groth16 artifacts (must exist under public/zk after npm run circuit:build). */
export const ZK_WASM_URL = "/zk/scholarshipEligibility_js/scholarshipEligibility.wasm";
export const ZK_ZKEY_URL = "/zk/scholarship_final.zkey";

export async function assertZkArtifactsAvailable() {
  const [wasm, zkey] = await Promise.all([
    fetch(ZK_WASM_URL, { method: "HEAD" }),
    fetch(ZK_ZKEY_URL, { method: "HEAD" }),
  ]);
  if (!wasm.ok || !zkey.ok) {
    throw new Error(
      `ZK proof files missing. Run from repo root: npm run circuit:build\n` +
        `Expected:\n  ${ZK_WASM_URL}\n  ${ZK_ZKEY_URL}\n` +
        `(Do not use old incomeEligibility.wasm — V2 uses scholarshipEligibility.)`
    );
  }
}
