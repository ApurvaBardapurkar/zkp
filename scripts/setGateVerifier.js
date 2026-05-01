const hre = require("hardhat");

async function main() {
  const gateAddress = process.env.GATE_ADDRESS;
  const newVerifierAddress = process.env.NEW_VERIFIER_ADDRESS;
  if (!gateAddress || !newVerifierAddress) {
    throw new Error("Missing GATE_ADDRESS or NEW_VERIFIER_ADDRESS in .env");
  }

  const [caller] = await hre.ethers.getSigners();
  console.log("Caller:", caller.address);

  const gate = await hre.ethers.getContractAt("ScholarshipGateGroth16", gateAddress);
  const tx = await gate.setVerifier(newVerifierAddress);
  console.log("Tx:", tx.hash);
  await tx.wait();

  console.log("Updated verifier to:", newVerifierAddress);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

