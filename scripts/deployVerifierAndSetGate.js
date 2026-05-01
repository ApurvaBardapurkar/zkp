const hre = require("hardhat");

async function main() {
  const gateAddress = process.env.GATE_ADDRESS;
  if (!gateAddress) throw new Error("Missing GATE_ADDRESS in .env");

  const [caller] = await hre.ethers.getSigners();
  console.log("Caller:", caller.address);
  console.log("Gate:", gateAddress);

  // snarkjs exports the verifier contract as "Groth16Verifier"
  const Groth16Verifier = await hre.ethers.getContractFactory("Groth16Verifier");
  const verifier = await Groth16Verifier.deploy();
  await verifier.waitForDeployment();
  const verifierAddr = await verifier.getAddress();
  console.log("Deployed IncomeEligibility Groth16 Verifier:", verifierAddr);

  // Update gate to use the new verifier
  const gate = await hre.ethers.getContractAt("ScholarshipGateGroth16", gateAddress);
  const tx = await gate.setVerifier(verifierAddr);
  console.log("setVerifier tx:", tx.hash);
  await tx.wait();
  console.log("Gate verifier updated to:", verifierAddr);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

