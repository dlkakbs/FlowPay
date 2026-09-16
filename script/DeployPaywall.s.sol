// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/ArcPaywall.sol";

contract DeployArcPaywall is Script {
    function run() external {
        // 0.001 native USDC = 1e15 (18 decimals)
        uint256 pricePerRequest = 1e15;

        vm.startBroadcast();
        ArcPaywall paywall = new ArcPaywall(pricePerRequest);
        vm.stopBroadcast();

        console.log("ArcPaywall deployed:", address(paywall));
        console.log("Price per request:", pricePerRequest);
    }
}
