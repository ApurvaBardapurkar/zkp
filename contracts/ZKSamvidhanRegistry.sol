// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal credential registry + nullifier-based gating for a welfare/scholarship flow.
/// @dev Stores only hashes + optional CID of encrypted documents (never raw PII).
contract ZKSamvidhanRegistry {
    event IssuerUpdated(address indexed issuer, bool allowed);
    event CredentialIssued(bytes32 indexed subjectId, bytes32 indexed credentialHash, string encryptedDocCid);
    event NullifierUsed(bytes32 indexed nullifierHash, address indexed caller);

    address public immutable admin;

    mapping(address => bool) public isIssuer;
    mapping(bytes32 => bytes32) public credentialHashBySubject; // subjectId -> credentialHash
    mapping(bytes32 => string) public encryptedDocCidBySubject; // subjectId -> ipfs cid (encrypted blob)
    mapping(bytes32 => bool) public nullifierUsed; // nullifierHash -> used

    error NotAdmin();
    error NotIssuer();
    error CredentialMissing();
    error CredentialMismatch();
    error NullifierAlreadyUsed();

    constructor() {
        admin = msg.sender;
    }

    function setIssuer(address issuer, bool allowed) external {
        if (msg.sender != admin) revert NotAdmin();
        isIssuer[issuer] = allowed;
        emit IssuerUpdated(issuer, allowed);
    }

    /// @param subjectId A privacy-preserving identifier (e.g., hash of user pubkey/commitment).
    /// @param credentialHash Hash of the issued credential (e.g., Poseidon/MiMC/SHA256 over canonical fields).
    /// @param encryptedDocCid Optional IPFS CID pointing to an encrypted document bundle.
    function issueCredential(bytes32 subjectId, bytes32 credentialHash, string calldata encryptedDocCid) external {
        if (!isIssuer[msg.sender]) revert NotIssuer();
        credentialHashBySubject[subjectId] = credentialHash;
        encryptedDocCidBySubject[subjectId] = encryptedDocCid;
        emit CredentialIssued(subjectId, credentialHash, encryptedDocCid);
    }

    /// @notice Marks a nullifier as used (call after a successful zk verification).
    function consumeNullifier(bytes32 nullifierHash) external {
        if (nullifierUsed[nullifierHash]) revert NullifierAlreadyUsed();
        nullifierUsed[nullifierHash] = true;
        emit NullifierUsed(nullifierHash, msg.sender);
    }

    function assertCredential(bytes32 subjectId, bytes32 expectedCredentialHash) external view {
        bytes32 stored = credentialHashBySubject[subjectId];
        if (stored == bytes32(0)) revert CredentialMissing();
        if (stored != expectedCredentialHash) revert CredentialMismatch();
    }
}

