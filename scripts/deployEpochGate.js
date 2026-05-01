const hre = require("hardhat");

async function main() {
  const registryAddress = process.env.REGISTRY_ADDRESS;
  if (!registryAddress) {
    throw new Error("Missing REGISTRY_ADDRESS in .env");
  }

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Registry:", registryAddress);

  // Deploy updated Groth16 verifier (5 public inputs)
  const Groth16Verifier = await hre.ethers.getContractFactory("Groth16Verifier");
  const verifier = await Groth16Verifier.deploy();
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();
  console.log("IncomeEligibility Groth16 Verifier (epoch):", verifierAddress);

  // Deploy new epoch-enforcing gate
  const Gate = await hre.ethers.getContractFactory("ScholarshipGateGroth16Epoch");
  const gate = await Gate.deploy(registryAddress, verifierAddress);
  await gate.waitForDeployment();
  const gateAddress = await gate.getAddress();
  console.log("ScholarshipGateGroth16Epoch:", gateAddress);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

