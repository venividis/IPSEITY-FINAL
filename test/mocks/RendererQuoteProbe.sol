// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Renderer} from "../../src/Renderer.sol";
import {Engine} from "../../src/Engine.sol";
import {Sigil} from "../../src/Sigil.sol";

/// @dev The production escaper exposed for byte-exact and gas regression.
contract RendererQuoteProbe is Renderer {
    constructor() Renderer(Engine(address(0)), Sigil(address(0))) {}

    function quote(bytes memory data) external pure returns (bytes memory) {
        return _quote(data);
    }
}
