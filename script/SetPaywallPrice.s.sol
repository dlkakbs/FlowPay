// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/ArcPaywall.sol";

contract SetPaywallPrice is Script {
    function run() external {
        address paywallAddress = vm.envAddress("PAYWALL_ADDRESS");

        // 0.001 native USDC = 1e15 (18 decimals)
        uint256 newPrice = 1e15;

        vm.startBroadcast();
        ArcPaywall(paywallAddress).setPrice(newPrice);
        vm.stopBroadcast();

        console.log("ArcPaywall updated:", paywallAddress);
        console.log("New price per request:", newPrice);
    }
}
