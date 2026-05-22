// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Credential registry with revocation, expiry, and Merkle root for ZK leaf proofs.
contract ZKSamvidhanRegistryV2 {
    event IssuerUpdated(address indexed issuer, bool allowed);
    event CredentialIssued(
        bytes32 indexed subjectId,
        bytes32 indexed credentialHash,
        string encryptedDocCid,
        bytes32 merkleRoot,
        uint256 expiresAt
    );
    event CredentialRevoked(bytes32 indexed credentialHash, address indexed revoker);
    event MerkleRootUpdated(bytes32 indexed merkleRoot, uint256 leafCount);
    event NullifierUsed(bytes32 indexed nullifierHash, address indexed caller);

    address public immutable admin;

    mapping(address => bool) public isIssuer;
    mapping(bytes32 => bytes32) public credentialHashBySubject;
    mapping(bytes32 => string) public encryptedDocCidBySubject;
    mapping(bytes32 => bool) public nullifierUsed;
    mapping(bytes32 => bool) public revokedCredential;
    mapping(bytes32 => uint256) public credentialExpiresAt;
    mapping(bytes32 => bool) public issuedLeaf;

    bytes32 public merkleRoot;
    uint256 public leafCount;

    error NotAdmin();
    error NotIssuer();
    error CredentialMissing();
    error CredentialMismatch();
    error CredentialWasRevoked();
    error CredentialExpired();
    error NullifierAlreadyUsed();
    error LeafAlreadyIssued();
    error MerkleRootMismatch();

    constructor() {
        admin = msg.sender;
    }

    function setIssuer(address issuer, bool allowed) external {
        if (msg.sender != admin) revert NotAdmin();
        isIssuer[issuer] = allowed;
        emit IssuerUpdated(issuer, allowed);
    }

    function issueCredential(
        bytes32 subjectId,
        bytes32 credentialHash,
        string calldata encryptedDocCid,
        bytes32 newMerkleRoot,
        uint256 expiresAt
    ) external {
        if (!isIssuer[msg.sender]) revert NotIssuer();
        if (issuedLeaf[credentialHash]) revert LeafAlreadyIssued();
        if (newMerkleRoot == bytes32(0)) revert MerkleRootMismatch();

        issuedLeaf[credentialHash] = true;
        leafCount += 1;
        merkleRoot = newMerkleRoot;

        credentialHashBySubject[subjectId] = credentialHash;
        encryptedDocCidBySubject[subjectId] = encryptedDocCid;
        credentialExpiresAt[credentialHash] = expiresAt;

        emit CredentialIssued(subjectId, credentialHash, encryptedDocCid, newMerkleRoot, expiresAt);
        emit MerkleRootUpdated(newMerkleRoot, leafCount);
    }

    function revokeCredential(bytes32 credentialHash) external {
        if (msg.sender != admin && !isIssuer[msg.sender]) revert NotIssuer();
        revokedCredential[credentialHash] = true;
        emit CredentialRevoked(credentialHash, msg.sender);
    }

    function consumeNullifier(bytes32 nullifierHash) external {
        if (nullifierUsed[nullifierHash]) revert NullifierAlreadyUsed();
        nullifierUsed[nullifierHash] = true;
        emit NullifierUsed(nullifierHash, msg.sender);
    }

    function assertCredential(bytes32 subjectId, bytes32 expectedCredentialHash) external view {
        bytes32 stored = credentialHashBySubject[subjectId];
        if (stored == bytes32(0)) revert CredentialMissing();
        if (stored != expectedCredentialHash) revert CredentialMismatch();
        if (revokedCredential[expectedCredentialHash]) revert CredentialWasRevoked();
        uint256 exp = credentialExpiresAt[expectedCredentialHash];
        if (exp != 0 && block.timestamp > exp) revert CredentialExpired();
    }

    function assertMerkleRoot(bytes32 expectedRoot) external view {
        if (merkleRoot != expectedRoot) revert MerkleRootMismatch();
    }
}
