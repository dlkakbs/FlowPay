// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/ArcFlow.sol";

contract DeployArcFlow is Script {
    function run() external {
        vm.startBroadcast();
        ArcFlow flow = new ArcFlow();
        vm.stopBroadcast();

        console.log("ArcFlow deployed:", address(flow));
    }
}
