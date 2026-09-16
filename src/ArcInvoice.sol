// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title  ArcInvoice
/// @notice Arc üzerinde native USDC ile fatura gönder/al.
///
///  Flow:
///    Freelancer → createInvoice(amount, description, deadline)
///                 invoiceId döner, bu ID'yi müşteriye gönderir
///    Müşteri    → payInvoice(invoiceId) + USDC
///                 USDC direkt freelancer'a gider
///    İptal      → cancelInvoice(invoiceId) — sadece creator, ödenmemişse

contract ArcInvoice {

    // ─── Types ────────────────────────────────────────────────────────────

    enum Status { Pending, Paid, Canceled }

    struct Invoice {
        address creator;     // parayı alacak kişi
        uint256 amount;      // istenen USDC miktarı (wei)
        string  description; // "Logo tasarımı", "Mart ayı danışmanlık" vb.
        uint256 deadline;    // 0 = süresiz, unix timestamp
        Status  status;
    }

    // ─── State ────────────────────────────────────────────────────────────

    uint256 public invoiceCount;
    mapping(uint256 => Invoice) public invoices;
    mapping(address => uint256[]) public myInvoices; // creator → invoice listesi
    uint256 private locked = 1;

    // ─── Events ───────────────────────────────────────────────────────────

    event InvoiceCreated(uint256 indexed id, address indexed creator, uint256 amount, string description);
    event InvoicePaid(uint256 indexed id, address indexed payer, uint256 amount);
    event InvoiceCanceled(uint256 indexed id);

    // ─── Errors ───────────────────────────────────────────────────────────

    error ZeroAmount();
    error NotPending();
    error Expired();
    error WrongAmount();
    error NotCreator();
    error TransferFailed();
    error ReentrantCall();

    modifier nonReentrant() {
        if (locked != 1) revert ReentrantCall();
        locked = 2;
        _;
        locked = 1;
    }

    // ─── Creator: Fatura oluştur ──────────────────────────────────────────

    /// @param amount      Kaç wei USDC isteniyor
    /// @param description Fatura açıklaması
    /// @param deadline    Son ödeme tarihi (unix), süresizse 0
    function createInvoice(
        uint256 amount,
        string calldata description,
        uint256 deadline
    ) external returns (uint256 id) {
        if (amount == 0) revert ZeroAmount();

        id = invoiceCount++;
        invoices[id] = Invoice({
            creator:     msg.sender,
            amount:      amount,
            description: description,
            deadline:    deadline,
            status:      Status.Pending
        });

        myInvoices[msg.sender].push(id);

        emit InvoiceCreated(id, msg.sender, amount, description);
    }

    // ─── Payer: Fatura öde ────────────────────────────────────────────────

    function payInvoice(uint256 id) external payable nonReentrant {
        Invoice storage inv = invoices[id];

        if (inv.status != Status.Pending)              revert NotPending();
        if (inv.deadline != 0 && block.timestamp > inv.deadline) revert Expired();
        if (msg.value != inv.amount)                   revert WrongAmount();

        inv.status = Status.Paid;
        (bool success, ) = payable(inv.creator).call{value: msg.value}("");
        if (!success) revert TransferFailed();

        emit InvoicePaid(id, msg.sender, msg.value);
    }

    // ─── Creator: İptal et ────────────────────────────────────────────────

    function cancelInvoice(uint256 id) external {
        Invoice storage inv = invoices[id];
        if (msg.sender != inv.creator) revert NotCreator();
        if (inv.status != Status.Pending) revert NotPending();

        inv.status = Status.Canceled;
        emit InvoiceCanceled(id);
    }

    // ─── View ─────────────────────────────────────────────────────────────

    function getInvoice(uint256 id) external view returns (Invoice memory) {
        return invoices[id];
    }

    function getMyInvoices(address creator) external view returns (uint256[] memory) {
        return myInvoices[creator];
    }

    function isExpired(uint256 id) external view returns (bool) {
        Invoice memory inv = invoices[id];
        if (inv.deadline == 0) return false;
        return block.timestamp > inv.deadline;
    }
}
