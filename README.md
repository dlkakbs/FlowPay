# FlowPay

**Payment infrastructure on Arc — streaming, invoicing, and paywalls powered by native USDC.**

Live demo: [flowonarc.net](https://flowonarc.net)

---

## What is FlowPay?

FlowPay is a payment layer built for Arc Mainnet, with Arc Testnet retained for staging. Think Stripe, but on-chain — no intermediaries, no chargebacks, settlement in native USDC. It ships three composable payment primitives:

| Module | What it does |
|--------|-------------|
| **Stream** | Per-second salary, subscription, or vesting payments |
| **Invoice** | Create & pay USDC invoices with shareable IDs |
| **Paywall** | Onchain marketplace for pay-per-request APIs and AI-powered services — providers own services onchain, set service-specific pricing, and earn claimable revenue in native USDC |

---

## Built on Arc

FlowPay is built around what Arc uniquely makes possible.

### Native USDC as Gas

Arc makes USDC the native gas token of the network. Every transaction fee is paid in USDC — the same asset users are already transacting with. This eliminates a fundamental problem in traditional blockchain payments: you need a volatile asset (ETH, MATIC) just to move a stable one.

For FlowPay this means:
- Users deposit USDC and consume credits — no separate gas wallet required
- Per-request costs are predictable in dollar terms, not subject to gas market swings

Arc exposes one USDC balance through two interfaces: native value uses 18 decimals while the optional ERC-20 interface uses 6 decimals. FlowPay's payment contracts use the native 18-decimal value interface and never mix raw values from the two representations.

### Sub-Cent Transaction Costs

Arc's fee design uses an exponentially weighted moving average of block utilization instead of block-by-block price jumps. Combined with bounded base fees and high throughput (~3,000 TPS at <350ms finality with 20 validators), fees stay consistently low and don't spike under demand.

This is the technical prerequisite that makes FlowPay's paywall model viable. At Ethereum gas prices, a `0.001 USDC` API call would cost more in gas than the payment itself — the economics don't work. On Arc, micropayments are real.

FlowPay's batch settlement pattern is built around this: clients sign each request off-chain (zero gas), and the owner submits up to 50 payments in a single `redeemBatch` transaction. Gas is amortized across the batch, driving per-request overhead toward zero.

### Deterministic Sub-Second Finality

Arc uses Malachite — a high-performance BFT consensus protocol based on Tendermint. Once 2/3 of validators commit a block, the transaction is immediately and irreversibly final. There is no probabilistic finality, no reorg risk, no "wait 12 confirmations."

This matters for payment infrastructure: a stream withdrawal or invoice payment is settled the moment it lands in a block. FlowPay's frontend can show confirmed state without artificial delays.

### Circle Ecosystem Integration

Arc is built by Circle and is natively integrated into Circle's USDC issuance infrastructure. Arc's USDC is the canonical version — not a bridge wrapper or a synthetic. FlowPay's payment primitives operate on top of this foundation.

### EVM Compatibility

Arc is EVM-compatible. FlowPay's contracts are standard Solidity and built with Foundry. Mainnet transactions use [Arc Explorer](https://explorer.arc.io); staging remains available on the [Arc Testnet explorer](https://explorer.testnet.arc.io).

---

## Deployed Contracts (Arc Testnet)

| Contract | Address |
|----------|---------|
| FlowPay Stream (`ArcFlow` contract) | [`0xAB78614fED57bB451b70EE194fC4043CADCC39eF`](https://explorer.testnet.arc.io/address/0xAB78614fED57bB451b70EE194fC4043CADCC39eF) |
| ArcInvoice | [`0x8d533a6DF78ef01F6E4E998588D3Ccb21F668486`](https://explorer.testnet.arc.io/address/0x8d533a6DF78ef01F6E4E998588D3Ccb21F668486) |
| ArcPaywall | [`0xC805Da7670ae48CD14Bf50434f919C2Efe3Ed6BD`](https://explorer.testnet.arc.io/address/0xC805Da7670ae48CD14Bf50434f919C2Efe3Ed6BD) |

- **Network:** Arc Testnet
- **Chain ID:** 5042002
- **Explorer:** [explorer.testnet.arc.io](https://explorer.testnet.arc.io)

Mainnet contracts are deployed separately and configured through environment variables. Testnet addresses and state are never reused on Mainnet.

---

## How It Works

### Stream

Create a USDC stream to any address with a monthly rate. The contract converts this to a per-second rate and begins accruing immediately. The recipient can withdraw at any time — they don't wait for a payment cycle. Senders see their active outgoing streams; recipients see incoming streams — the UI auto-detects your role.

> **Note:** Rate precision is limited by integer division (`monthlyUsdc / 2_592_000`). Small monthly amounts may truncate slightly — the frontend warns you when this happens.

### Invoice

Generate a USDC invoice and share the numeric ID with your client. The client pays directly on-chain; both parties can track status in real time. No email, no bank transfer, no intermediary — the payment and the receipt are the same transaction.

### Paywall

FlowPay's Paywall is a two-sided onchain marketplace for pay-per-request APIs and AI-powered services.

**For clients:**
Deposit USDC credits once. Browse available services in the marketplace, select one, and start sending requests. Each request is signed off-chain (no gas) and queued. Credits are deducted per call using that service's onchain price — no subscriptions, no API keys, no billing surprises.

**For service providers:**
Register your API or AI-powered service endpoint on the Paywall page. Service ownership, pricing, activation state, and provider earnings live onchain. Public metadata such as the service name and description are stored in the marketplace registry. Your real backend endpoint stays private — FlowPay issues a proxy URL that you share publicly. Clients call the proxy; FlowPay verifies their on-chain balance, forwards the request to your private endpoint, and queues the micropayment. Payments are batched and settled on-chain, then providers withdraw accumulated claimable earnings directly from the contract.

The frontend includes a live demo (FlowPay Assistant) so you can see the signing flow and credits deducted in real time.

**Security model:**
- **Domain separation:** every signature commits to `address(this)` + `chainId`, preventing replay across contracts or chains
- **Monotonic nonce:** signatures are strictly ordered per user, preventing replay within the same contract
- **Deadline:** each signature expires after 24 hours, reducing dropped requests in serverless environments while still bounding replay risk
- **Max deposit cap:** limits custody exposure per user
- **Normal withdraw:** users can withdraw their unused deposit at any time, no conditions
- **Escape path:** if the owner is inactive for 7 days, users can emergency-withdraw their full deposit directly from the contract — even if the frontend is down

---

## Tech Stack

**Smart Contracts**
- Solidity + [Foundry](https://book.getfoundry.sh/)
- Arc Mainnet (Chain ID 5042) and Arc Testnet staging (Chain ID 5042002)

**Frontend**
- Next.js 16
- wagmi v3 + viem
- Tailwind CSS + Framer Motion

**Backend**
- Next.js API Routes (serverless)
- Upstash Redis — atomic nonce reservation, idempotency keys, ordered settlement queue, public marketplace metadata, and private endpoint mapping
- GitHub Actions — free five-minute settlement trigger for this public repository
- Upstash QStash — optional signed scheduler if stricter delivery/retry guarantees are needed

---

## Local Development

### Contracts

```shell
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash && foundryup

# Import the deployer into Foundry's encrypted keystore (interactive)
cast wallet import flowpay-deployer

# Build
forge build

# Test
forge test

# Deploy stream contract
forge script script/Deploy.s.sol \
  --rpc-url arc_mainnet \
  --account flowpay-deployer \
  --broadcast

# Deploy invoice contract
forge script script/DeployInvoice.s.sol \
  --rpc-url arc_mainnet \
  --account flowpay-deployer \
  --broadcast

# Deploy paywall contract
forge script script/DeployPaywallV2.s.sol \
  --rpc-url arc_mainnet \
  --account flowpay-deployer \
  --broadcast
```

### Frontend

```shell
cd frontend
npm install
npm run dev
```

Create a `.env.local`:

```env
NEXT_PUBLIC_ARC_NETWORK=mainnet
NEXT_PUBLIC_ARC_FLOW_ADDRESS=0x...
NEXT_PUBLIC_ARC_INVOICE_ADDRESS=0x...
NEXT_PUBLIC_ARC_PAYWALL_V2_ADDRESS=0x...
ARC_PAYWALL_V2_ADDRESS=0x...

UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
OWNER_PRIVATE_KEY=0x...
CRON_SECRET=your-random-secret

QSTASH_TOKEN=...
QSTASH_CURRENT_SIGNING_KEY=...
QSTASH_NEXT_SIGNING_KEY=...
QSTASH_DESTINATION_URL=https://flowonarc.net/api/settle
```

The repository's GitHub Actions workflow calls the protected settlement endpoint every five minutes. Set the same random value as `CRON_SECRET` in Vercel and as the `FLOWPAY_CRON_SECRET` GitHub Actions secret.

QStash remains available as an optional scheduler. To create its five-minute schedule after a production deployment:

```shell
cd frontend
npm run setup:qstash
```

### Tests

```shell
cd frontend
npm test
```

Tests cover serialized nonce reservation, duplicate request idempotency, expired reservation recovery, ordered batch settlement, and crash recovery.

---

## License

MIT
