#!/usr/bin/env node
/**
 * Build scholarshipEligibility Groth16 artifacts (cross-platform).
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const circuitsDir = path.join(root, "circuits");
const buildDir = path.join(circuitsDir, "build");
const ptauDir = path.join(circuitsDir, "ptau");
const circomBin =
  process.platform === "win32"
    ? path.join(root, "tools", "circom.exe")
    : "circom";

function run(cmd, opts = {}) {
  console.log(">", cmd);
  execSync(cmd, { stdio: "inherit", cwd: opts.cwd || buildDir, ...opts });
}

fs.mkdirSync(buildDir, { recursive: true });
fs.mkdirSync(ptauDir, { recursive: true });

if (!fs.existsSync(circomBin) && circomBin !== "circom") {
  console.error("Missing circom. Install circom or place tools/circom.exe");
  process.exit(1);
}

const circuitSrc = path.join(circuitsDir, "scholarshipEligibility.circom");
run(`"${circomBin}" "${circuitSrc}" --r1cs --wasm --sym -o "${buildDir}"`, { cwd: root });

const ptau0 = path.join(ptauDir, "powersoftau_0000.ptau");
const ptauPhase1 = path.join(ptauDir, "powersoftau_phase1.ptau");
const ptauPhase2 = path.join(ptauDir, "powersoftau_phase2.ptau");

if (!fs.existsSync(ptauPhase2)) {
  run(`npx snarkjs powersoftau new bn128 16 "${ptau0}" -v`, { cwd: root });
  run(`npx snarkjs powersoftau contribute "${ptau0}" "${ptauPhase1}" --name="zk-samvidhan" -v -e="entropy"`, {
    cwd: root,
  });
  run(`npx snarkjs powersoftau prepare phase2 "${ptauPhase1}" "${ptauPhase2}" -v`, { cwd: root });
}

const r1cs = path.join(buildDir, "scholarshipEligibility.r1cs");
const zkey0 = path.join(buildDir, "scholarship_0000.zkey");
const zkeyFinal = path.join(buildDir, "scholarship_final.zkey");

run(`npx snarkjs groth16 setup "${r1cs}" "${ptauPhase2}" "${zkey0}"`, { cwd: root });
run(`npx snarkjs zkey contribute "${zkey0}" "${zkeyFinal}" --name="zk-samvidhan" -v -e="entropy2"`, {
  cwd: root,
});

const vkey = path.join(buildDir, "scholarship_verification_key.json");
run(`npx snarkjs zkey export verificationkey "${zkeyFinal}" "${vkey}"`, { cwd: root });

const verifierSol = path.join(buildDir, "ScholarshipEligibilityVerifier.sol");
run(`npx snarkjs zkey export solidityverifier "${zkeyFinal}" "${verifierSol}"`, { cwd: root });

const contractsVerifier = path.join(root, "contracts", "verifiers", "ScholarshipEligibilityVerifier.sol");
let sol = fs.readFileSync(verifierSol, "utf8");
sol = sol.replace("contract Groth16Verifier", "contract ScholarshipGroth16Verifier");
fs.writeFileSync(contractsVerifier, sol);

const wasmDir = path.join(buildDir, "scholarshipEligibility_js");
const frontendZk = path.join(root, "frontend", "public", "zk");
fs.mkdirSync(frontendZk, { recursive: true });
fs.cpSync(wasmDir, path.join(frontendZk, "scholarshipEligibility_js"), { recursive: true });
fs.copyFileSync(zkeyFinal, path.join(frontendZk, "scholarship_final.zkey"));

console.log("\nDone. Verifier:", contractsVerifier);
console.log("Frontend zk:", frontendZk);
