import { type NextRequest, NextResponse } from 'next/server'
import { enqueueItem } from '@/lib/nonceReserver'
import { settleBatch, BATCH_SIZE } from '@/lib/batchSettler'
import {
  IS_PAYWALL_V2,
  PAYWALL_ADDRESS,
  PAYWALL_V1_ABI,
  PAYWALL_V2_ABI,
  PAYWALL_V2_LEGACY_REDEEM_ABI,
  PAYWALL_V2_PRICE_SNAPSHOTS,
  arcChain,
} from '@/lib/arcChain'
import { getArcDocsAnswer } from '@/lib/arcDocs'
import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  cacheResponse,
  getCreditsSnapshot,
  getOnChainNonce,
  readCachedResponse,
  verifyPaidRequest,
} from '@/lib/paywallPayment'

function getArcAiResponse(prompt: string): string {
  const q = prompt.toLowerCase()

  // FlowPay / Arc specific
  if (q.includes('flowpay') || q.includes('arcflow')) return 'FlowPay is payment infrastructure built on Arc. It has three primitives: Stream for continuous payments, Invoice for one-time requests, and Paywall for per-request micropayments — all settled in native USDC.'
  if (q.includes('stream') && (q.includes('payment') || q.includes('salary') || q.includes('retainer'))) return 'Payment streams on FlowPay accrue every second. The payer deposits USDC upfront and sets a monthly rate; the recipient can withdraw their earned balance at any time without asking the payer.'
  if (q.includes('invoice'))      return 'FlowPay invoices are settled on-chain. The creator sets an amount and description, shares the invoice ID, and the payer sends USDC directly to the contract. No intermediary, no chargebacks.'
  if (q.includes('paywall'))      return 'The Paywall model lets users deposit USDC once and consume request credits over time. Each API call deducts one credit off-chain using a signed message — no gas per request. A batch settler rolls up signatures on-chain periodically.'
  if (q.includes('arc testnet') || q.includes('arc chain') || q.includes('arc network')) return 'Arc is a high-throughput EVM-compatible chain with native USDC support. It enables sub-cent transactions, making micropayments and streaming payments practical for the first time.'
  if (q.includes('usdc'))         return "FlowPay uses Circle's native USDC on Arc. Because Arc has very low fees, even 0.001 USDC per-request payments are economically viable."
  if (q.includes('batch') || q.includes('settle')) return 'FlowPay\'s batch settlement collects off-chain signed payment authorizations and submits them in a single transaction. This reduces gas costs dramatically — 50 payments cost the same as 1 on-chain transfer.'

  // Crypto / Web3
  if (q.includes('defi'))         return 'DeFi (Decentralized Finance) refers to financial services built on blockchains — lending, trading, payments — without traditional intermediaries like banks. Smart contracts automate the rules, and anyone with a wallet can participate.'
  if (q.includes('smart contract')) return 'A smart contract is self-executing code deployed on a blockchain. Once deployed, it runs exactly as written with no possibility of downtime, censorship, or third-party interference. FlowPay\'s payment logic lives in smart contracts on Arc.'
  if (q.includes('wallet'))       return 'A crypto wallet stores your private keys and lets you sign transactions. You never "store" tokens in a wallet — they live on-chain. The wallet just proves ownership. MetaMask, Coinbase Wallet, and Rainbow are popular options.'
  if (q.includes('gas'))          return 'Gas is the fee paid to validators for processing transactions on EVM chains. High gas on Ethereum mainnet makes micropayments impractical. Chains like Arc solve this with lower fees, enabling new payment models.'
  if (q.includes('evm'))          return 'EVM (Ethereum Virtual Machine) is the runtime environment for smart contracts. EVM-compatible chains like Arc, Polygon, and Base let you deploy the same Solidity code across networks.'
  if (q.includes('nft'))          return 'NFTs (Non-Fungible Tokens) are unique digital assets on a blockchain. Unlike USDC (fungible — every unit is identical), each NFT has distinct properties. They\'re used for digital art, gaming items, and on-chain credentials.'
  if (q.includes('layer 2') || q.includes('l2')) return 'Layer 2s are networks built on top of Ethereum to handle transactions more efficiently. They batch transactions and post proofs back to Ethereum. Examples include Arbitrum, Optimism, and Base.'

  // Coding / Tech
  if (q.includes('solidity'))     return 'Solidity is the primary language for writing Ethereum smart contracts. It\'s statically typed and compiles to EVM bytecode. Key concepts: state variables, functions, events, modifiers, and mappings.'
  if (q.includes('react'))        return 'React is a JavaScript library for building user interfaces. It uses a component model where UI is broken into reusable pieces, each managing its own state. FlowPay\'s frontend is built with Next.js, which extends React with server rendering and routing.'
  if (q.includes('typescript'))   return 'TypeScript adds static types to JavaScript, catching errors at compile time rather than runtime. It\'s especially valuable in large codebases — you get autocomplete, refactoring safety, and clearer contracts between components.'
  if (q.includes('api'))          return 'An API (Application Programming Interface) defines how software components communicate. REST APIs use HTTP methods (GET, POST, etc.) over URLs. FlowPay\'s paywall is essentially an on-chain API billing system — users pay per call.'
  if (q.includes('database') || q.includes('redis')) return 'Redis is an in-memory data store used for caching, queues, and real-time data. FlowPay uses Upstash Redis to store payment signature queues and idempotency keys before batch settlement.'
  if (q.includes('next.js') || q.includes('nextjs')) return 'Next.js is a React framework that adds server-side rendering, API routes, and file-based routing. FlowPay\'s frontend and backend API both run in a single Next.js app deployed on Vercel.'

  // Finance / Business
  if (q.includes('subscription'))  return 'Subscriptions charge a flat fee regardless of usage. Pay-per-use models like FlowPay\'s Paywall only charge for what\'s actually consumed — better for users with variable usage and easier for providers to price fairly.'
  if (q.includes('micropayment'))  return 'Micropayments are very small transactions — fractions of a cent to a few cents. They\'ve been theorized since the early web but were impractical due to high transaction fees. Blockchains with low fees and native stablecoins finally make them viable.'
  if (q.includes('revenue') || q.includes('monetize') || q.includes('monetisation')) return 'For API providers, per-request billing aligns revenue directly with value delivered. No free-tier abuse, no churn from billing surprises — users deposit upfront and credits drain as they use the service.'

  // General knowledge
  if (q.includes('explain') || q.includes('what is') || q.includes('what are')) {
    const topic = prompt.replace(/explain|what is|what are/gi, '').trim()
    if (topic.length > 2) return `${topic.charAt(0).toUpperCase() + topic.slice(1)} is a concept worth exploring in depth. To give you a precise answer, could you provide more context? For example, are you asking from a technical, financial, or general perspective?`
  }
  if (q.includes('how does') || q.includes('how do'))  return 'Great question. The short answer depends on the specifics — could you narrow it down a bit? I can go deep on blockchain infrastructure, payment systems, smart contracts, or general software architecture.'
  if (q.includes('best practice') || q.includes('best way')) return 'Best practices vary by context, but a few universals: keep it simple, test edge cases, handle failures gracefully, and don\'t optimize prematurely. In Web3 specifically: audit your contracts, use established patterns, and minimize on-chain storage.'
  if (q.includes('hello') || q.includes('hi ') || q.startsWith('hi') || q.includes('hey')) return 'Hey! I\'m the FlowPay Assistant, powered by FlowPay\'s per-request payment system. Ask me anything about crypto, payments, smart contracts, or software engineering.'
  if (q.includes('thank'))        return 'You\'re welcome! Each of these responses costs exactly 0.001 USDC, deducted from your on-chain balance. That\'s FlowPay in action — pay only for what you use.'
  if (q.includes('joke') || q.includes('funny')) return 'Why did the smart contract break up with the oracle? It couldn\'t trust anything that came from outside the chain. 🔗'
  if (q.includes('price') || q.includes('cost') || q.includes('expensive')) return 'This request cost you 0.001 USDC — about a tenth of a cent. Traditional payment APIs charge monthly fees regardless of usage. FlowPay\'s model means you only pay for actual calls, settled on-chain with no intermediary.'

  // Fallback — still useful
  return `You asked: "${prompt.length > 80 ? prompt.slice(0, 80) + '…' : prompt}". I'm the FlowPay Assistant — a general-purpose agent running on FlowPay's per-request payment infrastructure. I can help with crypto, smart contracts, coding, payments, and more. Try asking something specific!`
}

export async function POST(req: NextRequest) {
  try {
  const { reservationId, idempotencyKey, signature, prompt, clientAddress, serviceId } = await req.json()

  if (!reservationId || !idempotencyKey || !signature || !clientAddress) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // ── Idempotency: aynı key ile gelen tekrar istek → cache'den dön ──────
  const cached = await readCachedResponse(idempotencyKey)
  if (cached) return NextResponse.json(cached)

  const { reservation, pricePerRequest, deadline } = await verifyPaidRequest({
    reservationId,
    signature,
    clientAddress,
    serviceId,
  })

  // ── Queue'ya ekle ─────────────────────────────────────────────────────
  await enqueueItem(
    clientAddress,
    reservation.nonce,
    deadline,
    signature,
    reservation.serviceId,
    pricePerRequest,
    reservation.reservationId
  )

  // ── Batch threshold kontrolü → settle ─────────────────────────────────
  const { pendingQueued } = await getCreditsSnapshot(clientAddress, reservation.serviceId)
  const queueSize = pendingQueued
  if (queueSize >= BATCH_SIZE && process.env.OWNER_PRIVATE_KEY) {
    triggerBatchSettle(clientAddress, pricePerRequest).catch(console.error)
  }

  // ── Response ──────────────────────────────────────────────────────────
  const { onChainRemaining, pendingQueued: pendingAfterEnqueue, availableCredits } = await getCreditsSnapshot(clientAddress, reservation.serviceId)

  const docsAnswer = getArcDocsAnswer(prompt ?? '')

  const result = {
    success: true,
    response: {
      message:   docsAnswer?.message ?? getArcAiResponse(prompt ?? ''),
      model:     docsAnswer?.model ?? 'flowpay-assistant-v1',
      timestamp: new Date().toISOString(),
    },
    creditsUsed:      1,
    creditsRemaining: availableCredits.toString(),
    pendingCredits: pendingAfterEnqueue,
    onChainCredits: onChainRemaining.toString(),
    serviceId: serviceId ?? 'svc_demo_ai',
  }

  // Idempotency cache — 1 saat
  await cacheResponse(idempotencyKey, result)

  return NextResponse.json(result)
  } catch (err) {
    console.error('[request]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}

// Fire-and-forget batch settle — owner private key env'den
async function triggerBatchSettle(clientAddress: string, pricePerRequest: bigint) {
  const account = privateKeyToAccount(process.env.OWNER_PRIVATE_KEY as `0x${string}`)
  const walletClient = createWalletClient({
    account,
    chain: arcChain,
    transport: http(),
  })

  const onChainNonce = await getOnChainNonce(clientAddress)

  await settleBatch(
    clientAddress,
    onChainNonce,
    pricePerRequest,
    async ({ serviceIds, clients, nonces, deadlines, paymentAmounts, signatures }) => {
      if (IS_PAYWALL_V2 && PAYWALL_V2_PRICE_SNAPSHOTS) {
        return walletClient.writeContract({
          address: PAYWALL_ADDRESS,
          abi: PAYWALL_V2_ABI,
          functionName: 'redeemBatch',
          args: [serviceIds as `0x${string}`[], clients as `0x${string}`[], nonces, deadlines, paymentAmounts, signatures as `0x${string}`[]],
        })
      }

      if (IS_PAYWALL_V2) {
        return walletClient.writeContract({
          address: PAYWALL_ADDRESS,
          abi: PAYWALL_V2_LEGACY_REDEEM_ABI,
          functionName: 'redeemBatch',
          args: [serviceIds as `0x${string}`[], clients as `0x${string}`[], nonces, deadlines, signatures as `0x${string}`[]],
        })
      }

      const hash = await walletClient.writeContract({
        address: PAYWALL_ADDRESS,
        abi: PAYWALL_V1_ABI,
        functionName: 'redeemBatch',
        args: [clients as `0x${string}`[], nonces, deadlines, signatures as `0x${string}`[]],
      })
      return hash
    },
    getOnChainNonce
  )
}
