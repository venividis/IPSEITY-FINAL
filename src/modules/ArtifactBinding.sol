// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IIpseityModuleIdentity {
    function account(uint256 id) external view returns (address);
    function ownerOf(uint256 id) external view returns (address);
    function statsOf(uint256 id) external view returns (uint256, uint256, uint256, uint256);
}

interface IIpseityModuleAccount {
    function token() external view returns (uint256 chainId, address collection, uint256 tokenId);
    function owner() external view returns (address);
}

/// @notice Read-only binding to the existing IPSEITY Reach, never a replacement account.
/// @dev The account footer alone is not authority: a stranger can implement token().
/// Every match is checked against the collection's canonical ERC-6551 derivation.
contract ArtifactBinding {
    IIpseityModuleIdentity public immutable collection;
    error InvalidCollection();
    error ExhaustedCustodyEpoch();

    constructor(address collection_) {
        if (collection_.code.length == 0) revert InvalidCollection();
        collection = IIpseityModuleIdentity(collection_);
    }

    function artifactIdOfAccount(address account_) public view returns (uint256) {
        if (account_.code.length == 0) return 0;
        try IIpseityModuleAccount(account_).token() returns (uint256 chain, address token, uint256 id) {
            if (chain != block.chainid || token != address(collection) || id == 0) return 0;
            if (collection.account(id) != account_) return 0;
            try collection.ownerOf(id) returns (address holder) {
                try IIpseityModuleAccount(account_).owner() returns (address controller) {
                    return holder != address(0) && controller == holder ? id : 0;
                } catch { return 0; }
            } catch { return 0; }
        } catch { return 0; }
    }

    function ownerOf(uint256 id) external view returns (address) { return collection.ownerOf(id); }

    /// @dev The existing transfer statistic saturates at uint32.max. Refuse there
    /// rather than let a future transfer retain authority from an earlier custody.
    /// Epoch one is the first owner; every transfer, including back to that owner,
    /// changes the epoch. This does not use the account's per-key session nonce.
    function ownershipEpoch(uint256 id) public view returns (uint256) {
        collection.ownerOf(id);
        (, uint256 transfers,,) = collection.statsOf(id);
        if (transfers >= type(uint32).max) revert ExhaustedCustodyEpoch();
        return transfers + 1;
    }
}
