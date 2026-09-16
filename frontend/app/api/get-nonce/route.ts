import { type NextRequest, NextResponse } from 'next/server'
import {
  IS_PAYWALL_V2,
  PAYWALL_ADDRESS,
  PAYWALL_V1_ABI,
  PAYWALL_V2_ABI,
  publicClient,
} from '@/lib/arcChain'
import { reserveNonce } from '@/lib/nonceReserver'
import { getCreditsSnapshot, getOnChainNonce, getSignatureDeadline } from '@/lib/paywallPayment'

export async function POST(req: NextRequest) {
  try {
    const { clientAddress, serviceId } = await req.json()

    if (!clientAddress || !/^0x[0-9a-fA-F]{40}$/.test(clientAddress)) {
      return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
    }

    if (IS_PAYWALL_V2 && (!serviceId || !/^0x[0-9a-fA-F]{64}$/.test(serviceId))) {
      return NextResponse.json({ error: 'Invalid service id' }, { status: 400 })
    }

    const service =
      IS_PAYWALL_V2 && serviceId
        ? (await publicClient.readContract({
            address: PAYWALL_ADDRESS,
            abi: PAYWALL_V2_ABI,
            functionName: 'getService',
            args: [serviceId as `0x${string}`],
          }))
        : await publicClient.readContract({
            address: PAYWALL_ADDRESS,
            abi: PAYWALL_V1_ABI,
            functionName: 'pricePerRequest',
          })

    if (IS_PAYWALL_V2 && typeof service !== 'bigint' && !service.active) {
      return NextResponse.json({ error: 'Service is inactive.' }, { status: 409 })
    }

    const pricePerRequest = typeof service === 'bigint' ? service : service.pricePerRequest
    const { availableCredits } = await getCreditsSnapshot(clientAddress, serviceId)

    if (availableCredits === 0n) {
      return NextResponse.json(
        { error: 'No credits remaining. Deposit USDC to continue.' },
        { status: 402 }
      )
    }

    const readContract = async (addr: string): Promise<number> => getOnChainNonce(addr)

    const { nonce, reservationId } = await reserveNonce(clientAddress, readContract, serviceId)

    const deadline = getSignatureDeadline(Date.now())

    return NextResponse.json({
      nonce,
      reservationId,
      deadline,
      pricePerRequest: pricePerRequest.toString(),
    })
  } catch (err) {
    console.error('[get-nonce]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}
