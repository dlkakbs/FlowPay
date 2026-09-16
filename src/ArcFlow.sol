// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title  ArcFlow
/// @notice Arc üzerinde native USDC ile streaming payment.
///         Payer USDC yatırır, recipient her saniye kazanır, istediği an çeker.
///
///  Matematik:
///    accumulated = rate × (now - startTime)
///    withdrawable = accumulated - alreadyWithdrawn
///    remaining    = deposit - accumulated  (payer iptal edince geri alır)

contract ArcFlow {

    // ─── Types ────────────────────────────────────────────────────────────

    struct Stream {
        address payer;
        address recipient;
        uint256 rate;        // wei/saniye, native USDC 18 decimals
        uint256 startTime;   // stream başlangıcı
        uint256 deposit;     // toplam yatırılan USDC
        uint256 withdrawn;   // recipient'in çektiği toplam
        bool    active;
    }

    // ─── State ────────────────────────────────────────────────────────────

    uint256 public streamCount;
    mapping(uint256 => Stream) public streams;
    uint256 private locked = 1;

    // ─── Events ───────────────────────────────────────────────────────────

    event StreamCreated(
        uint256 indexed id,
        address indexed payer,
        address indexed recipient,
        uint256 rate,
        uint256 deposit
    );
    event Withdrawn(uint256 indexed id, address indexed recipient, uint256 amount);
    event StreamCanceled(uint256 indexed id, uint256 recipientAmount, uint256 payerRefund);
    event ToppedUp(uint256 indexed id, uint256 amount);

    // ─── Errors ───────────────────────────────────────────────────────────

    error ZeroDeposit();
    error ZeroRate();
    error ZeroAddress();
    error NotActive();
    error NotPayer();
    error NotRecipient();
    error NothingToWithdraw();
    error TransferFailed();
    error ReentrantCall();

    modifier nonReentrant() {
        if (locked != 1) revert ReentrantCall();
        locked = 2;
        _;
        locked = 1;
    }

    // ─── Payer: Stream aç ─────────────────────────────────────────────────

    /// @param recipient  Ödeme alacak adres
    /// @param rate       Saniyede kaç wei USDC akacak
    ///                   Örnek hesap: aylık 1000 USDC → rate = 1000e18 / 30 / 86400
    function createStream(address recipient, uint256 rate) external payable returns (uint256 id) {
        if (msg.value == 0) revert ZeroDeposit();
        if (rate == 0)      revert ZeroRate();
        if (recipient == address(0)) revert ZeroAddress();

        id = streamCount++;
        streams[id] = Stream({
            payer:     msg.sender,
            recipient: recipient,
            rate:      rate,
            startTime: block.timestamp,
            deposit:   msg.value,
            withdrawn: 0,
            active:    true
        });

        emit StreamCreated(id, msg.sender, recipient, rate, msg.value);
    }

    // ─── Recipient: Birikeni çek ──────────────────────────────────────────

    function withdraw(uint256 id) external nonReentrant {
        Stream storage s = streams[id];
        if (!s.active)              revert NotActive();
        if (msg.sender != s.recipient) revert NotRecipient();

        uint256 amount = withdrawable(id);
        if (amount == 0) revert NothingToWithdraw();

        s.withdrawn += amount;
        _sendValue(payable(s.recipient), amount);

        emit Withdrawn(id, s.recipient, amount);
    }

    // ─── Payer: Stream'i iptal et ─────────────────────────────────────────

    function cancelStream(uint256 id) external nonReentrant {
        Stream storage s = streams[id];
        if (!s.active)           revert NotActive();
        if (msg.sender != s.payer) revert NotPayer();

        uint256 recipientAmount = withdrawable(id);
        uint256 payerRefund     = s.deposit - s.withdrawn - recipientAmount;

        s.active = false;

        if (recipientAmount > 0) _sendValue(payable(s.recipient), recipientAmount);
        if (payerRefund > 0)     _sendValue(payable(s.payer), payerRefund);

        emit StreamCanceled(id, recipientAmount, payerRefund);
    }

    // ─── Payer: Deposit ekle ──────────────────────────────────────────────

    function topUp(uint256 id) external payable {
        Stream storage s = streams[id];
        if (!s.active) revert NotActive();
        if (msg.value == 0) revert ZeroDeposit();

        s.deposit += msg.value;
        emit ToppedUp(id, msg.value);
    }

    // ─── View ─────────────────────────────────────────────────────────────

    /// Şu ana kadar recipient'e ne kadar birikti (çekilmemiş)
    function withdrawable(uint256 id) public view returns (uint256) {
        Stream memory s = streams[id];
        if (!s.active) return 0;

        uint256 elapsed     = block.timestamp - s.startTime;
        uint256 accumulated = elapsed * s.rate;

        // deposit'i aşamaz
        if (accumulated > s.deposit) accumulated = s.deposit;

        return accumulated - s.withdrawn;
    }

    /// Stream'in kaç saniye daha çalışacağı (mevcut deposit ile)
    function remainingTime(uint256 id) external view returns (uint256) {
        Stream memory s = streams[id];
        if (!s.active) return 0;

        uint256 elapsed  = block.timestamp - s.startTime;
        uint256 consumed = elapsed * s.rate;
        if (consumed >= s.deposit) return 0;

        return (s.deposit - consumed) / s.rate;
    }

    /// Saniyede kaç native USDC akıyor (18 decimal)
    function ratePerSecond(uint256 id) external view returns (uint256) {
        return streams[id].rate;
    }

    /// Helper: aylık USDC miktarından rate hesapla
    function monthlyToRate(uint256 monthlyUsdc) external pure returns (uint256) {
        // 30 gün = 2_592_000 saniye
        return monthlyUsdc / 2_592_000;
    }

    function _sendValue(address payable recipient, uint256 amount) internal {
        (bool success, ) = recipient.call{value: amount}("");
        if (!success) revert TransferFailed();
    }
}
