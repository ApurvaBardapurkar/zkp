## Circuits (next step for full ZK)

This repo ships an **on-chain ready interface** (`IGroth16Verifier`) and an **app gate** (`ScholarshipGate.sol`).

To make it fully end-to-end with real ZK proofs:

- Install a Circom compiler (`circom`) on your machine
- Write a circuit (example: `income < threshold` + bind to a credential hash + nullifier)
- Run Groth16 setup and export the Solidity verifier:
  - `snarkjs zkey export solidityverifier circuit_final.zkey contracts/verifiers/IncomeVerifier.sol`
- Deploy the real verifier and set it on `ScholarshipGate`

For the demo scaffolding, we deploy `MockGroth16Verifier` (always-true) so you can deploy and integrate the rest of the stack first.

