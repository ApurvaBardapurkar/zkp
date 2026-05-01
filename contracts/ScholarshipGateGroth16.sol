// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ZKSamvidhanRegistry} from "./ZKSamvidhanRegistry.sol";
import {IGroth16Verifier4} from "./verifiers/IGroth16Verifier4.sol";

/// @notice Scholarship gate wired for snarkjs Groth16 verifiers (fixed public input size).
/// @dev Public input ordering MUST match the circuit's declared public signals:
///  - input[0] = subjectId
///  - input[1] = credentialHash
///  - input[2] = nullifierHash
///  - input[3] = policyId
contract ScholarshipGateGroth16 {
    event VerifiedAndClaimed(bytes32 indexed subjectId, bytes32 indexed nullifierHash, uint256 indexed policyId, address caller);

    ZKSamvidhanRegistry public immutable registry;
    IGroth16Verifier4 public verifier;

    error InvalidProof();

    constructor(ZKSamvidhanRegistry _registry, IGroth16Verifier4 _verifier) {
        registry = _registry;
        verifier = _verifier;
    }

    function setVerifier(IGroth16Verifier4 _verifier) external {
        if (msg.sender != registry.admin()) revert ZKSamvidhanRegistry.NotAdmin();
        verifier = _verifier;
    }

    function verifyAndClaim(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[4] calldata input
    ) external {
        bool ok = verifier.verifyProof(a, b, c, input);
        if (!ok) revert InvalidProof();

        bytes32 subjectId = bytes32(input[0]);
        bytes32 credentialHash = bytes32(input[1]);
        bytes32 nullifierHash = bytes32(input[2]);
        uint256 policyId = input[3];

        registry.assertCredential(subjectId, credentialHash);
        registry.consumeNullifier(nullifierHash);

        emit VerifiedAndClaimed(subjectId, nullifierHash, policyId, msg.sender);
    }
}

