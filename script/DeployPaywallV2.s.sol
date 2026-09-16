// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/ArcPaywallV2.sol";

contract DeployArcPaywallV2 is Script {
    function run() external {
        address settler = vm.envOr("SETTLER_ADDRESS", address(0));

        vm.startBroadcast();
        ArcPaywallV2 paywall = new ArcPaywallV2();
        if (settler != address(0)) {
            paywall.setSettler(settler);
        }
        vm.stopBroadcast();

        console.log("ArcPaywallV2 deployed:", address(paywall));
        console.log("Settlement signer override:", settler);
    }
}
