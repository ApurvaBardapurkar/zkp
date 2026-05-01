// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice snarkjs Groth16 verifier interface with 4 public inputs.
/// @dev snarkjs exports verifiers with fixed-size public signal arrays.
interface IGroth16Verifier4 {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[4] calldata input
    ) external view returns (bool);
}

