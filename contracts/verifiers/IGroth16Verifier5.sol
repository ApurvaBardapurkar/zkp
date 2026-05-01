// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal Groth16 verifier interface for 5 public inputs.
interface IGroth16Verifier5 {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[5] calldata input
    ) external view returns (bool);
}

