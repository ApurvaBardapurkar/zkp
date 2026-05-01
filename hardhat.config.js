require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const MST_RPC_URL = process.env.MST_RPC_URL || "https://testnetrpc.mstblockchain.com";
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";
const MST_CHAIN_ID = Number(process.env.MST_CHAIN_ID || "91562037");

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    mstTestnet: {
      url: MST_RPC_URL,
      chainId: MST_CHAIN_ID,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
  },
};

