// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Exact legacy cartridge tuple shapes, without importing another registry.
library CartridgeTypes {
    struct Cartridge {
        string manifestJSON;
        bytes32 contentHash;
        uint64 revision;
        bool frozen;
    }
    struct LaunchManifest {
        string manifestJSON;
        bytes32 contentHash;
        bytes32 manifestHash;
        uint64 revision;
        bool frozen;
        address holder;
        address controller;
        uint256 parentArtifactId;
        uint256 parentOwnershipEpoch;
        bool authorized;
        bool onchainContentAvailable;
    }
}
