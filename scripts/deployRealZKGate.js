const hre = require("hardhat");

async function main() {
  const registryAddress = process.env.REGISTRY_ADDRESS;
  if (!registryAddress) {
    throw new Error("Missing REGISTRY_ADDRESS in .env");
  }

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const Groth16Verifier = await hre.ethers.getContractFactory("Groth16Verifier");
  const verifier = await Groth16Verifier.deploy();
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();
  console.log("Groth16Verifier:", verifierAddress);

  const Gate = await hre.ethers.getContractFactory("ScholarshipGateGroth16");
  const gate = await Gate.deploy(registryAddress, verifierAddress);
  await gate.waitForDeployment();
  const gateAddress = await gate.getAddress();
  console.log("ScholarshipGateGroth16:", gateAddress);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

