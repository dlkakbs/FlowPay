import { type NextRequest, NextResponse } from 'next/server'
import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { Receiver } from '@upstash/qstash'
import { getActiveClients, removeActiveClient } from '@/lib/nonceReserver'
import { settleBatch } from '@/lib/batchSettler'
import {
  IS_PAYWALL_V2,
  PAYWALL_ADDRESS,
  PAYWALL_V1_ABI,
  PAYWALL_V2_ABI,
  PAYWALL_V2_LEGACY_REDEEM_ABI,
  PAYWALL_V2_PRICE_SNAPSHOTS,
  arcChain,
} from '@/lib/arcChain'
import { getOnChainNonce } from '@/lib/paywallPayment'

// Optional manual trigger protected with a separate bearer secret.
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  return Boolean(secret) && req.headers.get('authorization') === `Bearer ${secret}`
}

async function runSettlement() {
  if (!process.env.OWNER_PRIVATE_KEY) {
    return NextResponse.json({ error: 'OWNER_PRIVATE_KEY not set' }, { status: 500 })
  }

  if (PAYWALL_ADDRESS === '0x0000000000000000000000000000000000000000') {
    return NextResponse.json({ error: 'Mainnet paywall address is not configured' }, { status: 500 })
  }

  const account = privateKeyToAccount(process.env.OWNER_PRIVATE_KEY as `0x${string}`)
  const walletClient = createWalletClient({ account, chain: arcChain, transport: http() })

  const clients = await getActiveClients()

  const results: Record<string, { settled: number; skipped: number }> = {}
  let failed = false

  for (const clientAddress of clients) {
    try {
      const result = await settleBatch(
        clientAddress,
        await getOnChainNonce(clientAddress),
        0n,
        async ({ serviceIds, clients: c, nonces, deadlines, paymentAmounts, signatures }) => {
          if (IS_PAYWALL_V2 && PAYWALL_V2_PRICE_SNAPSHOTS) {
            return walletClient.writeContract({
              address: PAYWALL_ADDRESS,
              abi: PAYWALL_V2_ABI,
              functionName: 'redeemBatch',
              args: [serviceIds as `0x${string}`[], c as `0x${string}`[], nonces, deadlines, paymentAmounts, signatures as `0x${string}`[]],
            })
          }

          if (IS_PAYWALL_V2) {
            return walletClient.writeContract({
              address: PAYWALL_ADDRESS,
              abi: PAYWALL_V2_LEGACY_REDEEM_ABI,
              functionName: 'redeemBatch',
              args: [serviceIds as `0x${string}`[], c as `0x${string}`[], nonces, deadlines, signatures as `0x${string}`[]],
            })
          }

          const hash = await walletClient.writeContract({
            address: PAYWALL_ADDRESS,
            abi: PAYWALL_V1_ABI,
            functionName: 'redeemBatch',
            args: [c as `0x${string}`[], nonces, deadlines, signatures as `0x${string}`[]],
          })
          return hash
        },
        getOnChainNonce
      )

      results[clientAddress] = {
        settled: result.nonces.length,
        skipped: result.skipped.length,
      }

      // Queue boşaldıysa active listesinden çıkar
      if (result.nonces.length === 0 && result.skipped.length === 0) {
        await removeActiveClient(clientAddress)
      }
    } catch (err) {
      console.error(`[settle] ${clientAddress}:`, err)
      results[clientAddress] = { settled: -1, skipped: -1 }
      failed = true
    }
  }

  return NextResponse.json(
    { clients: clients.length, results },
    { status: failed ? 500 : 200 }
  )
}

// QStash sends a signed POST every five minutes. Constructing the receiver at
// request time keeps signing keys out of the build and lets Vercel inject them
// only in the runtime environment.
export async function POST(req: NextRequest) {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY
  const signature = req.headers.get('upstash-signature')

  if (!currentSigningKey || !nextSigningKey) {
    return NextResponse.json({ error: 'QStash signing keys are not configured' }, { status: 500 })
  }

  if (!signature) {
    return NextResponse.json({ error: 'Missing QStash signature' }, { status: 403 })
  }

  try {
    const receiver = new Receiver({ currentSigningKey, nextSigningKey })
    const valid = await receiver.verify({
      signature,
      body: await req.clone().text(),
      upstashRegion: req.headers.get('upstash-region') ?? undefined,
    })

    if (!valid) {
      return NextResponse.json({ error: 'Invalid QStash signature' }, { status: 403 })
    }
  } catch {
    return NextResponse.json({ error: 'Invalid QStash signature' }, { status: 403 })
  }

  return runSettlement()
}

// Optional manual/fallback trigger. This is not scheduled by Vercel Hobby.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return runSettlement()
}
