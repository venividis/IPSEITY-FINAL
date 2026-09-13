// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*───────────────────────────────────────────────────────────────────────────
  An inscription's address is a consequence of its bytes and this deployer.
  The initcode reads no state. Its runtime begins with STOP; no byte supplied
  by a holder can execute. Engine's nonce-addressed SSTORE2 stays untouched.
───────────────────────────────────────────────────────────────────────────*/
library Shard {
    uint256 internal constant MAX = 24_575;

    error Empty();
    error TooLarge(uint256 size);
    error CutFailed();
    error InvalidShard();
    error WrongTotal();

    function _init(bytes memory data) private pure returns (bytes memory) {
        if (data.length == 0) revert Empty();
        if (data.length > MAX) revert TooLarge(data.length);
        return abi.encodePacked(hex"61", uint16(data.length + 1), hex"80600c6000396000f300", data);
    }

    function _address(bytes memory init) private view returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff), address(this), bytes32(0), keccak256(init)
        )))));
    }

    function cut(bytes memory data) internal returns (address ptr) {
        bytes memory init = _init(data);
        ptr = _address(init);
        if (ptr.code.length != 0) {
            // Content addressing proves the initcode; checking the runtime
            // also makes the idempotent branch an explicit bytes covenant.
            if (ptr.codehash != keccak256(abi.encodePacked(hex"00", data))) revert InvalidShard();
            return ptr;
        }
        assembly ("memory-safe") {
            ptr := create2(0, add(init, 0x20), mload(init), 0)
        }
        if (ptr == address(0)) revert CutFailed();
    }

    function addressOf(bytes memory data) internal view returns (address ptr, bool exists) {
        ptr = _address(_init(data));
        exists = ptr.code.length != 0;
    }

    function size(address ptr) internal view returns (uint256 n) {
        n = ptr.code.length;
        if (n < 2 || n > MAX + 1) revert InvalidShard();
        uint256 first;
        assembly ("memory-safe") {
            extcodecopy(ptr, 0, 0, 1)
            first := byte(0, mload(0))
        }
        if (first != 0) revert InvalidShard();
        unchecked { --n; }
    }

    function read(address ptr) internal view returns (bytes memory out) {
        uint256 n = size(ptr);
        out = new bytes(n);
        assembly ("memory-safe") { extcodecopy(ptr, add(out, 0x20), 1, n) }
    }

    /// The total is checked before every copy and again at the end. No
    /// caller-supplied total can turn EXTCODECOPY into a buffer overrun.
    function join(address[] memory ptrs, uint256 total) internal view returns (bytes memory out) {
        if (ptrs.length > 256 || total > MAX * 256) revert WrongTotal();
        out = new bytes(total);
        uint256 cursor;
        for (uint256 i; i < ptrs.length; ++i) {
            uint256 n = size(ptrs[i]);
            if (n > total - cursor) revert WrongTotal();
            address ptr = ptrs[i];
            assembly ("memory-safe") { extcodecopy(ptr, add(add(out, 0x20), cursor), 1, n) }
            cursor += n;
        }
        if (cursor != total) revert WrongTotal();
    }
}
