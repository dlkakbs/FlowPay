// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/ArcInvoice.sol";

contract DeployArcInvoice is Script {
    function run() external {
        vm.startBroadcast();
        ArcInvoice invoice = new ArcInvoice();
        vm.stopBroadcast();

        console.log("ArcInvoice deployed:", address(invoice));
    }
}
