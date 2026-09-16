// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/ArcPaywallV2.sol";

contract ArcPaywallV2Test is Test {
    ArcPaywallV2 paywall;

    uint256 ownerKey = 0xA11CE;
    uint256 clientKey = 0xB0B;
    uint256 providerKey = 0xCAFE;
    uint256 settlerKey = 0x5157;

    address owner;
    address client;
    address provider;
    address settler;

    uint256 constant LOW_PRICE = 1e15;
    uint256 constant HIGH_PRICE = 2e15;
    uint256 constant DEPOSIT = 5 ether;

    bytes32 constant SERVICE_A = keccak256("svc:alpha");
    bytes32 constant SERVICE_B = keccak256("svc:beta");

    function setUp() public {
        owner = vm.addr(ownerKey);
        client = vm.addr(clientKey);
        provider = vm.addr(providerKey);
        settler = vm.addr(settlerKey);

        vm.prank(owner);
        paywall = new ArcPaywallV2();

        vm.deal(client, 10 ether);
        vm.deal(owner, 10 ether);
        vm.deal(provider, 10 ether);

        vm.prank(provider);
        paywall.registerService(SERVICE_A, LOW_PRICE);

        vm.prank(provider);
        paywall.registerService(SERVICE_B, HIGH_PRICE);
    }

    function _sign(bytes32 serviceId, uint256 nonce, uint256 deadline, uint256 price) internal view returns (bytes memory) {
        bytes32 msgHash = keccak256(
            abi.encodePacked(address(paywall), block.chainid, serviceId, client, nonce, deadline, price)
        );
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", msgHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(clientKey, ethHash);
        return abi.encodePacked(r, s, v);
    }

    function test_registerService_tracksOwnerServices() public view {
        ArcPaywallV2.Service memory service = paywall.getService(SERVICE_A);
        assertEq(service.owner, provider);
        assertEq(service.pricePerRequest, LOW_PRICE);
        assertTrue(service.active);

        bytes32[] memory providerServices = paywall.getOwnerServices(provider);
        assertEq(providerServices.length, 2);
        assertEq(providerServices[0], SERVICE_A);
        assertEq(providerServices[1], SERVICE_B);
    }

    function test_redeemBatch_creditsClaimableByProvider() public {
        vm.prank(client);
        paywall.deposit{value: DEPOSIT}();

        bytes32[] memory serviceIds = new bytes32[](2);
        address[] memory clients = new address[](2);
        uint256[] memory nonces = new uint256[](2);
        uint256[] memory deadlines = new uint256[](2);
        uint256[] memory paymentAmounts = new uint256[](2);
        bytes[] memory signatures = new bytes[](2);

        serviceIds[0] = SERVICE_A;
        serviceIds[1] = SERVICE_B;
        clients[0] = client;
        clients[1] = client;
        nonces[0] = 0;
        nonces[1] = 1;
        deadlines[0] = block.timestamp + 1 days;
        deadlines[1] = block.timestamp + 1 days;
        paymentAmounts[0] = LOW_PRICE;
        paymentAmounts[1] = HIGH_PRICE;
        signatures[0] = _sign(SERVICE_A, 0, deadlines[0], LOW_PRICE);
        signatures[1] = _sign(SERVICE_B, 1, deadlines[1], HIGH_PRICE);

        vm.prank(owner);
        paywall.redeemBatch(serviceIds, clients, nonces, deadlines, paymentAmounts, signatures);

        assertEq(paywall.balanceOf(client), DEPOSIT - LOW_PRICE - HIGH_PRICE);
        assertEq(paywall.nextNonce(client), 2);
        assertEq(paywall.claimable(provider), LOW_PRICE + HIGH_PRICE);
    }

    function test_withdrawProviderEarnings() public {
        vm.prank(client);
        paywall.deposit{value: DEPOSIT}();

        bytes32[] memory serviceIds = new bytes32[](1);
        address[] memory clients = new address[](1);
        uint256[] memory nonces = new uint256[](1);
        uint256[] memory deadlines = new uint256[](1);
        uint256[] memory paymentAmounts = new uint256[](1);
        bytes[] memory signatures = new bytes[](1);

        serviceIds[0] = SERVICE_A;
        clients[0] = client;
        nonces[0] = 0;
        deadlines[0] = block.timestamp + 1 days;
        paymentAmounts[0] = LOW_PRICE;
        signatures[0] = _sign(SERVICE_A, 0, deadlines[0], LOW_PRICE);

        vm.prank(owner);
        paywall.redeemBatch(serviceIds, clients, nonces, deadlines, paymentAmounts, signatures);

        uint256 before = provider.balance;
        vm.prank(provider);
        paywall.withdrawProviderEarnings();

        assertEq(provider.balance - before, LOW_PRICE);
        assertEq(paywall.claimable(provider), 0);
    }

    function test_requestsRemaining_isServiceSpecific() public {
        vm.prank(client);
        paywall.deposit{value: DEPOSIT}();

        assertEq(paywall.requestsRemaining(client, SERVICE_A), DEPOSIT / LOW_PRICE);
        assertEq(paywall.requestsRemaining(client, SERVICE_B), DEPOSIT / HIGH_PRICE);
    }

    function test_ownerCanRotateSettler() public {
        vm.prank(owner);
        paywall.setSettler(settler);

        assertEq(paywall.settler(), settler);
    }

    function test_oldSettlerCannotRedeemAfterRotation() public {
        vm.prank(owner);
        paywall.setSettler(settler);

        bytes32[] memory serviceIds = new bytes32[](0);
        address[] memory clients = new address[](0);
        uint256[] memory nonces = new uint256[](0);
        uint256[] memory deadlines = new uint256[](0);
        uint256[] memory paymentAmounts = new uint256[](0);
        bytes[] memory signatures = new bytes[](0);

        vm.prank(owner);
        vm.expectRevert(ArcPaywallV2.NotSettler.selector);
        paywall.redeemBatch(serviceIds, clients, nonces, deadlines, paymentAmounts, signatures);

        vm.prank(settler);
        paywall.redeemBatch(serviceIds, clients, nonces, deadlines, paymentAmounts, signatures);
    }

    function test_redeemUsesClientSignedPriceSnapshot() public {
        vm.prank(client);
        paywall.deposit{value: DEPOSIT}();

        uint256 deadline = block.timestamp + 1 days;
        bytes32[] memory serviceIds = new bytes32[](1);
        address[] memory clients = new address[](1);
        uint256[] memory nonces = new uint256[](1);
        uint256[] memory deadlines = new uint256[](1);
        uint256[] memory paymentAmounts = new uint256[](1);
        bytes[] memory signatures = new bytes[](1);

        serviceIds[0] = SERVICE_A;
        clients[0] = client;
        deadlines[0] = deadline;
        paymentAmounts[0] = LOW_PRICE;
        signatures[0] = _sign(SERVICE_A, 0, deadline, LOW_PRICE);

        vm.prank(provider);
        paywall.updateServicePrice(SERVICE_A, HIGH_PRICE);

        vm.prank(owner);
        paywall.redeemBatch(serviceIds, clients, nonces, deadlines, paymentAmounts, signatures);

        assertEq(paywall.balanceOf(client), DEPOSIT - LOW_PRICE);
        assertEq(paywall.claimable(provider), LOW_PRICE);
    }

    function test_twoStepOwnershipTransfer() public {
        address newOwner = makeAddr("newOwner");

        vm.prank(owner);
        paywall.transferOwnership(newOwner);
        assertEq(paywall.pendingOwner(), newOwner);

        vm.prank(newOwner);
        paywall.acceptOwnership();

        assertEq(paywall.owner(), newOwner);
        assertEq(paywall.pendingOwner(), address(0));
    }
}
