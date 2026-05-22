const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const Registry = await hre.ethers.getContractFactory("ZKSamvidhanRegistryV2");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("ZKSamvidhanRegistryV2:", registryAddress);

  const Verifier = await hre.ethers.getContractFactory("ScholarshipGroth16Verifier");
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();
  console.log("ScholarshipEligibility Groth16 Verifier:", verifierAddress);

  const Gate = await hre.ethers.getContractFactory("ScholarshipGateGroth16EpochV2");
  const gate = await Gate.deploy(registryAddress, verifierAddress);
  await gate.waitForDeployment();
  const gateAddress = await gate.getAddress();
  console.log("ScholarshipGateGroth16EpochV2:", gateAddress);

  const issuer = process.env.ISSUER_ADDRESS || deployer.address;
  const tx = await registry.setIssuer(issuer, true);
  await tx.wait();
  console.log("Issuer allowlisted:", issuer);

  const out = {
    network: "mstTestnet",
    registryV2: registryAddress,
    gateV2: gateAddress,
    verifier: verifierAddress,
    issuer,
    deployedAt: new Date().toISOString(),
  };

  const outPath = path.join(__dirname, "..", "deployments", "scholarship-v2.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log("Wrote", outPath);
  console.log("\nSet in Vercel / frontend .env:");
  console.log(`VITE_REGISTRY_ADDRESS=${registryAddress}`);
  console.log(`VITE_GATE_ADDRESS=${gateAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
