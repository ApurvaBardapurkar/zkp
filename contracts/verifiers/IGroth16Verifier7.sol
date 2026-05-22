// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IGroth16Verifier7 {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[7] calldata input
    ) external view returns (bool);
}
