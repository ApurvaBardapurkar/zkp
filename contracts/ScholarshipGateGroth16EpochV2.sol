// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ZKSamvidhanRegistryV2} from "./ZKSamvidhanRegistryV2.sol";
import {ScholarshipGroth16Verifier} from "./verifiers/ScholarshipEligibilityVerifier.sol";

/// @notice Gate for scholarshipEligibility circuit (7 public inputs).
/// Public input order:
///   [0] subjectId, [1] credentialHash, [2] nullifierHash, [3] policyId,
///   [4] epoch, [5] incomeCommitment, [6] merkleRoot
contract ScholarshipGateGroth16EpochV2 {
    event VerifiedAndClaimed(
        bytes32 indexed subjectId,
        bytes32 indexed nullifierHash,
        uint256 indexed policyId,
        uint256 epoch,
        address caller
    );

    ZKSamvidhanRegistryV2 public immutable registry;
    ScholarshipGroth16Verifier public verifier;

    mapping(bytes32 => mapping(uint256 => mapping(uint256 => bool))) public claimed;

    error InvalidProof();
    error AlreadyClaimedForEpoch();

    constructor(ZKSamvidhanRegistryV2 _registry, ScholarshipGroth16Verifier _verifier) {
        registry = _registry;
        verifier = _verifier;
    }

    function setVerifier(ScholarshipGroth16Verifier _verifier) external {
        if (msg.sender != registry.admin()) revert ZKSamvidhanRegistryV2.NotAdmin();
        verifier = _verifier;
    }

    function verifyAndClaim(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[7] calldata input
    ) external {
        if (!verifier.verifyProof(a, b, c, input)) revert InvalidProof();

        bytes32 subjectId = bytes32(input[0]);
        bytes32 credentialHash = bytes32(input[1]);
        bytes32 nullifierHash = bytes32(input[2]);
        uint256 policyId = input[3];
        uint256 epoch = input[4];
        bytes32 merkleRoot = bytes32(input[6]);

        registry.assertCredential(subjectId, credentialHash);
        registry.assertMerkleRoot(merkleRoot);

        if (claimed[subjectId][policyId][epoch]) revert AlreadyClaimedForEpoch();
        claimed[subjectId][policyId][epoch] = true;

        registry.consumeNullifier(nullifierHash);

        emit VerifiedAndClaimed(subjectId, nullifierHash, policyId, epoch, msg.sender);
    }
}
