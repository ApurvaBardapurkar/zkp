$ErrorActionPreference = "Stop"

# ZK-Samvidhan Groth16 build (Windows PowerShell)
# Requirements:
#  - Circom available at .\tools\circom.exe (this repo downloads it)
#  - snarkjs available via npx (already installed in this repo)
#
# Output:
#  - circuits/build/IncomeEligibilityVerifier.sol  (copy to contracts/verifiers/)
#  - circuits/build/verification_key.json
#  - circuits/build/proof.json + public.json (example)

$root = Resolve-Path "$PSScriptRoot\.."
$circomBin = Join-Path $root "tools\circom.exe"
$circuits = Join-Path $root "circuits"
$build = Join-Path $circuits "build"
$ptauDir = Join-Path $circuits "ptau"

New-Item -ItemType Directory -Force -Path $build | Out-Null
New-Item -ItemType Directory -Force -Path $ptauDir | Out-Null

Write-Host "==> Compiling circuit"
Push-Location $build
Remove-Item -Force -ErrorAction SilentlyContinue `
  ".\\*.zkey",".\\proof.json",".\\public.json",".\\verification_key.json",".\\IncomeEligibilityVerifier.sol"
if (!(Test-Path $circomBin)) {
  throw "Missing circom binary at $circomBin. Run the download step in README or re-run setup."
}
& $circomBin "$circuits\incomeEligibility.circom" --r1cs --wasm --sym -o .

Write-Host "==> Powers of Tau (phase 1)"
$ptau0 = Join-Path $ptauDir "powersoftau_0000.ptau"
$ptauPhase1 = Join-Path $ptauDir "powersoftau_phase1.ptau"
$ptauPhase2 = Join-Path $ptauDir "powersoftau_phase2.ptau"
if (!(Test-Path $ptauPhase2)) {
  npx snarkjs powersoftau new bn128 14 "$ptau0" -v
  npx snarkjs powersoftau contribute "$ptau0" "$ptauPhase1" --name="zk-samvidhan demo" -v -e="random entropy"
  npx snarkjs powersoftau prepare phase2 "$ptauPhase1" "$ptauPhase2" -v
}

Write-Host "==> Groth16 setup"
$zkey0 = Join-Path $build "circuit_0000.zkey"
$zkeyFinal = Join-Path $build "circuit_final.zkey"
npx snarkjs groth16 setup "$build\incomeEligibility.r1cs" "$ptauPhase2" "$zkey0"
npx snarkjs zkey contribute "$zkey0" "$zkeyFinal" --name="zk-samvidhan demo" -v -e="random entropy"

Write-Host "==> Export verification key + Solidity verifier"
npx snarkjs zkey export verificationkey "$zkeyFinal" "$build\verification_key.json"
npx snarkjs zkey export solidityverifier "$zkeyFinal" "$build\IncomeEligibilityVerifier.sol"

Write-Host "==> Example proof generation"
Copy-Item "$circuits\input.example.json" "$build\input.json" -Force
npx snarkjs groth16 fullprove "$build\input.json" "$build\incomeEligibility_js\incomeEligibility.wasm" "$zkeyFinal" "$build\proof.json" "$build\public.json"
npx snarkjs groth16 verify "$build\verification_key.json" "$build\public.json" "$build\proof.json"

Write-Host ""
Write-Host "Done."
Write-Host "Verifier: $build\IncomeEligibilityVerifier.sol"
Write-Host "Public signals: $build\public.json"
Write-Host "Proof: $build\proof.json"
Pop-Location

