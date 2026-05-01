// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ZKSamvidhanRegistry} from "./ZKSamvidhanRegistry.sol";
import {IGroth16Verifier5} from "./verifiers/IGroth16Verifier5.sol";

/// @notice Scholarship gate for Groth16 verifiers with epoch enforcement.
/// @dev Public input ordering MUST match the circuit's declared public signals:
///  - input[0] = subjectId
///  - input[1] = credentialHash
///  - input[2] = nullifierHash
///  - input[3] = policyId
///  - input[4] = epoch (e.g., academic year like 2026)
contract ScholarshipGateGroth16Epoch {
    event VerifiedAndClaimed(bytes32 indexed subjectId, bytes32 indexed nullifierHash, uint256 indexed policyId, uint256 epoch, address caller);

    ZKSamvidhanRegistry public immutable registry;
    IGroth16Verifier5 public verifier;

    /// @dev One claim per subject+policy+epoch regardless of nullifier.
    mapping(bytes32 => mapping(uint256 => mapping(uint256 => bool))) public claimed;

    error InvalidProof();
    error AlreadyClaimedForEpoch();

    constructor(ZKSamvidhanRegistry _registry, IGroth16Verifier5 _verifier) {
        registry = _registry;
        verifier = _verifier;
    }

    function setVerifier(IGroth16Verifier5 _verifier) external {
        if (msg.sender != registry.admin()) revert ZKSamvidhanRegistry.NotAdmin();
        verifier = _verifier;
    }

    function verifyAndClaim(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[5] calldata input
    ) external {
        bool ok = verifier.verifyProof(a, b, c, input);
        if (!ok) revert InvalidProof();

        bytes32 subjectId = bytes32(input[0]);
        bytes32 credentialHash = bytes32(input[1]);
        bytes32 nullifierHash = bytes32(input[2]);
        uint256 policyId = input[3];
        uint256 epoch = input[4];

        // Require credential (issuer attestation) exists for this subject.
        registry.assertCredential(subjectId, credentialHash);

        // Enforce renewal period constraints: one claim per epoch.
        if (claimed[subjectId][policyId][epoch]) revert AlreadyClaimedForEpoch();
        claimed[subjectId][policyId][epoch] = true;

        // Still consume nullifier to prevent proof replay and allow future extensions.
        registry.consumeNullifier(nullifierHash);

        emit VerifiedAndClaimed(subjectId, nullifierHash, policyId, epoch, msg.sender);
    }
}

