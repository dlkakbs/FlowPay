// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title  ArcPaywall
/// @notice Arc üzerinde native USDC ile per-request ödeme.
///         Client önceden USDC yatırır, her request için off-chain imzalar.
///         Agent owner imzaları toplu olarak on-chain redeem eder.
///
///  Flow:
///    Client  → deposit()                     USDC yatır
///    Client  → her request için off-chain sign (zincire gitmez, gas yok)
///    Owner   → redeemBatch(...)              toplu redeem, tek tx
///
///  Güvenlik:
///    - Domain separation: address(this) + chainid imzada
///    - Strict nonce: kullanıcı başına monoton artan uint256
///    - Expiry: her imzanın deadline'ı var, süresi geçmiş imzalar reddedilir
///    - Escape path: owner 7 gün işlem yapmazsa kullanıcı kendi deposit'ini çekebilir
///    - Max deposit: custody riskini sınırlar

contract ArcPaywall {

    uint256 public constant MAX_DEPOSIT     = 10 ether;  // max 10 USDC per client
    uint256 public constant OWNER_TIMEOUT   = 7 days;    // escape path süresi

    address public owner;
    uint256 public pricePerRequest;
    uint256 public lastOwnerAction;

    mapping(address => uint256) public deposits;
    mapping(address => uint256) public nonces;   // kullanıcı başına monoton artan nonce

    event Deposited(address indexed client, uint256 amount);
    event Withdrawn(address indexed client, uint256 amount);
    event RequestPaid(address indexed client, uint256 nonce, uint256 amount);
    event PriceUpdated(uint256 oldPrice, uint256 newPrice);
    event EscapeWithdraw(address indexed client, uint256 amount);

    error NotOwner();
    error ZeroDeposit();
    error DepositExceedsMax();
    error BadNonce();
    error Expired();
    error InvalidSignature();
    error InsufficientDeposit();
    error NothingToWithdraw();
    error OwnerStillActive();

    constructor(uint256 _pricePerRequest) {
        owner = msg.sender;
        pricePerRequest = _pricePerRequest;
        lastOwnerAction = block.timestamp;
    }

    // ─── Client: USDC yatır ───────────────────────────────────────────────

    function deposit() external payable {
        if (msg.value == 0) revert ZeroDeposit();
        if (deposits[msg.sender] + msg.value > MAX_DEPOSIT) revert DepositExceedsMax();
        deposits[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    // ─── Client: Kullanılmayan bakiyeyi geri çek ──────────────────────────

    function withdraw(uint256 amount) external {
        if (deposits[msg.sender] < amount) revert InsufficientDeposit();
        if (amount == 0) revert NothingToWithdraw();
        deposits[msg.sender] -= amount;
        payable(msg.sender).transfer(amount);
        emit Withdrawn(msg.sender, amount);
    }

    // ─── Client: Escape path — owner 7 gün hareketsizse tüm bakiyeyi çek ─

    function emergencyWithdraw() external {
        if (block.timestamp < lastOwnerAction + OWNER_TIMEOUT) revert OwnerStillActive();
        uint256 amount = deposits[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        deposits[msg.sender] = 0;
        payable(msg.sender).transfer(amount);
        emit EscapeWithdraw(msg.sender, amount);
    }

    // ─── Owner: Toplu redeem (gas tasarrufu) ──────────────────────────────

    function redeemBatch(
        address[] calldata clients,
        uint256[] calldata clientNonces,
        uint256[] calldata deadlines,
        bytes[]   calldata signatures
    ) external {
        if (msg.sender != owner) revert NotOwner();
        lastOwnerAction = block.timestamp;

        uint256 totalEarned;

        for (uint256 i = 0; i < clients.length; i++) {
            address client   = clients[i];
            uint256 nonce    = clientNonces[i];
            uint256 deadline = deadlines[i];

            // Süresi geçmiş imzayı atla
            if (block.timestamp > deadline) continue;

            // Nonce sıralı olmalı: beklenen nonce'dan küçükse zaten kullanılmış
            if (nonce != nonces[client]) continue;

            // Bakiye yeterli değilse atla
            if (deposits[client] < pricePerRequest) continue;

            // İmzayı doğrula: domain + nonce + deadline + price
            bytes32 msgHash = keccak256(abi.encodePacked(
                address(this),
                block.chainid,
                client,
                nonce,
                deadline,
                pricePerRequest
            ));
            bytes32 ethHash = keccak256(abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                msgHash
            ));
            if (_recover(ethHash, signatures[i]) != client) continue;

            nonces[client]++;
            deposits[client] -= pricePerRequest;
            totalEarned += pricePerRequest;

            emit RequestPaid(client, nonce, pricePerRequest);
        }

        if (totalEarned > 0) payable(owner).transfer(totalEarned);
    }

    // ─── Owner: Fiyat güncelle ────────────────────────────────────────────

    function setPrice(uint256 newPrice) external {
        if (msg.sender != owner) revert NotOwner();
        lastOwnerAction = block.timestamp;
        emit PriceUpdated(pricePerRequest, newPrice);
        pricePerRequest = newPrice;
    }

    // ─── View ─────────────────────────────────────────────────────────────

    function balanceOf(address client) external view returns (uint256) {
        return deposits[client];
    }

    function requestsRemaining(address client) external view returns (uint256) {
        if (pricePerRequest == 0) return 0;
        return deposits[client] / pricePerRequest;
    }

    function nextNonce(address client) external view returns (uint256) {
        return nonces[client];
    }

    // ─── Internal ─────────────────────────────────────────────────────────

    function _recover(bytes32 hash, bytes memory sig) internal pure returns (address) {
        require(sig.length == 65, "Bad sig length");
        bytes32 r; bytes32 s; uint8 v;
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        if (v < 27) v += 27;
        return ecrecover(hash, v, r, s);
    }
}
