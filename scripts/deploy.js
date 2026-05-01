const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const Registry = await hre.ethers.getContractFactory("ZKSamvidhanRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  console.log("Registry:", await registry.getAddress());

  const MockVerifier = await hre.ethers.getContractFactory("MockGroth16Verifier");
  const verifier = await MockVerifier.deploy();
  await verifier.waitForDeployment();
  console.log("MockVerifier:", await verifier.getAddress());

  const Gate = await hre.ethers.getContractFactory("ScholarshipGate");
  const gate = await Gate.deploy(await registry.getAddress(), await verifier.getAddress());
  await gate.waitForDeployment();
  console.log("ScholarshipGate:", await gate.getAddress());
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

