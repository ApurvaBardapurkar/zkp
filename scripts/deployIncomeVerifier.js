const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // snarkjs exports the verifier contract as "Groth16Verifier"
  const Groth16Verifier = await hre.ethers.getContractFactory("Groth16Verifier");
  const verifier = await Groth16Verifier.deploy();
  await verifier.waitForDeployment();

  console.log("IncomeEligibility Groth16 Verifier:", await verifier.getAddress());
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

