// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Standard snarkjs Groth16 verifier interface.
interface IGroth16Verifier {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[] calldata input
    ) external view returns (bool);
}

