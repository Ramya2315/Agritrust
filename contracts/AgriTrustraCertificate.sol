// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract AgriTrustraCertificate {
    address public owner;

    struct Certificate {
        string farmId;
        string farmerId;
        string cropType;
        bytes32 metadataHash;
        address issuer;
        uint256 issuedAt;
        bool exists;
    }

    mapping(bytes32 => Certificate) private certificates;

    event CertificateIssued(
        bytes32 indexed certificateId,
        string farmId,
        string farmerId,
        string cropType,
        bytes32 metadataHash,
        address indexed issuer,
        uint256 issuedAt
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can issue certificates");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function issueCertificate(
        string calldata farmId,
        string calldata farmerId,
        string calldata cropType,
        bytes32 metadataHash
    ) external onlyOwner returns (bytes32 certificateId) {
        certificateId = keccak256(
            abi.encodePacked(
                farmId,
                farmerId,
                cropType,
                metadataHash,
                block.chainid,
                block.timestamp,
                msg.sender
            )
        );

        require(!certificates[certificateId].exists, "Certificate already exists");

        certificates[certificateId] = Certificate({
            farmId: farmId,
            farmerId: farmerId,
            cropType: cropType,
            metadataHash: metadataHash,
            issuer: msg.sender,
            issuedAt: block.timestamp,
            exists: true
        });

        emit CertificateIssued(
            certificateId,
            farmId,
            farmerId,
            cropType,
            metadataHash,
            msg.sender,
            block.timestamp
        );
    }

    function getCertificate(bytes32 certificateId) external view returns (Certificate memory) {
        require(certificates[certificateId].exists, "Certificate not found");
        return certificates[certificateId];
    }
}
