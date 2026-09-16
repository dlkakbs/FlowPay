import { keccak256, encodePacked, recoverMessageAddress } from 'viem'
import { getPendingAmount, getQueueSize, getRedis, getReservation, markSubmitted } from './nonceReserver'
import {
  arcChain,
  IS_PAYWALL_V2,
  PAYWALL_ADDRESS,
  PAYWALL_V1_ABI,
  PAYWALL_V2_ABI,
  publicClient,
} from './arcChain'
import { paymentRedisKey } from './storageKeys'

export const SIGNATURE_WINDOW_SECONDS = 24 * 60 * 60

export interface VerifiedPaymentRequest {
  reservation: {
    reservationId: string
    addr: string
    nonce: number
    serviceId?: string
    createdAt: number
  }
  pricePerRequest: bigint
  deadline: number
}

export function getSignatureDeadline(createdAtMs: number): number {
  return Math.floor(createdAtMs / 1000) + SIGNATURE_WINDOW_SECONDS
}

export async function getOnChainNonce(clientAddress: string): Promise<number> {
  const nextNonce = await publicClient.readContract({
    address: PAYWALL_ADDRESS,
    abi: IS_PAYWALL_V2 ? PAYWALL_V2_ABI : PAYWALL_V1_ABI,
    functionName: 'nextNonce',
    args: [clientAddress as `0x${string}`],
  })

  return Number(nextNonce)
}

export async function getCreditsSnapshot(clientAddress: string, serviceId?: string) {
  const [balance, pricePerRequest, queueSize, pendingAmount] = await Promise.all([
    publicClient.readContract({
      address: PAYWALL_ADDRESS,
      abi: IS_PAYWALL_V2 ? PAYWALL_V2_ABI : PAYWALL_V1_ABI,
      functionName: 'balanceOf',
      args: [clientAddress as `0x${string}`],
    }),
    IS_PAYWALL_V2 && serviceId
      ? publicClient.readContract({
          address: PAYWALL_ADDRESS,
          abi: PAYWALL_V2_ABI,
          functionName: 'getService',
          args: [serviceId as `0x${string}`],
        }).then((service) => service.pricePerRequest)
      : publicClient.readContract({
          address: PAYWALL_ADDRESS,
          abi: PAYWALL_V1_ABI,
          functionName: 'pricePerRequest',
        }),
    getQueueSize(clientAddress),
    getPendingAmount(clientAddress),
  ])

  const availableBalance = balance > pendingAmount ? balance - pendingAmount : 0n
  const available = pricePerRequest > 0n ? availableBalance / pricePerRequest : 0n
  const remaining = pricePerRequest > 0n ? balance / pricePerRequest : 0n

  return { onChainRemaining: remaining, pendingQueued: queueSize, availableCredits: available }
}

export async function verifyPaidRequest({
  reservationId,
  signature,
  clientAddress,
  serviceId,
}: {
  reservationId: string
  signature: string
  clientAddress: string
  serviceId?: string
}): Promise<VerifiedPaymentRequest> {
  const reservation = await getReservation(reservationId)
  if (!reservation || reservation.state !== 'reserved') {
    throw new Error('Reservation expired or already used.')
  }

  if (reservation.addr !== clientAddress.toLowerCase()) {
    throw new Error('Reservation wallet does not match the signer.')
  }

  if (IS_PAYWALL_V2 && (!serviceId || reservation.serviceId !== serviceId)) {
    throw new Error('Reservation service does not match the requested service.')
  }

  const deadline = getSignatureDeadline(reservation.createdAt)
  const now = Math.floor(Date.now() / 1000)
  if (now > deadline) {
    throw new Error('Signature deadline expired.')
  }

  const targetServiceId = reservation.serviceId ?? serviceId
  const pricePerRequest =
    IS_PAYWALL_V2 && targetServiceId
      ? (await publicClient.readContract({
          address: PAYWALL_ADDRESS,
          abi: PAYWALL_V2_ABI,
          functionName: 'getService',
          args: [targetServiceId as `0x${string}`],
        }))
      : await publicClient.readContract({
          address: PAYWALL_ADDRESS,
          abi: PAYWALL_V1_ABI,
          functionName: 'pricePerRequest',
        })

  if (IS_PAYWALL_V2 && typeof pricePerRequest !== 'bigint') {
    if (!pricePerRequest.active) throw new Error('Service is inactive.')
  }

  const paymentPrice = typeof pricePerRequest === 'bigint' ? pricePerRequest : pricePerRequest.pricePerRequest

  const msgHash =
    IS_PAYWALL_V2 && targetServiceId
      ? keccak256(
          encodePacked(
            ['address', 'uint256', 'bytes32', 'address', 'uint256', 'uint256', 'uint256'],
            [
              PAYWALL_ADDRESS,
              BigInt(arcChain.id),
              targetServiceId as `0x${string}`,
              clientAddress as `0x${string}`,
              BigInt(reservation.nonce),
              BigInt(deadline),
              paymentPrice,
            ]
          )
        )
      : keccak256(
          encodePacked(
            ['address', 'uint256', 'address', 'uint256', 'uint256', 'uint256'],
            [
              PAYWALL_ADDRESS,
              BigInt(arcChain.id),
              clientAddress as `0x${string}`,
              BigInt(reservation.nonce),
              BigInt(deadline),
              paymentPrice,
            ]
          )
        )

  const recovered = await recoverMessageAddress({
    message: { raw: msgHash },
    signature: signature as `0x${string}`,
  })

  if (recovered.toLowerCase() !== clientAddress.toLowerCase()) {
    throw new Error('Invalid signature.')
  }

  const submitted = await markSubmitted(reservationId)
  if (!submitted) throw new Error('Reservation expired or already used.')

  return {
    reservation: {
      reservationId,
      addr: reservation.addr,
      nonce: reservation.nonce,
      serviceId: targetServiceId,
      createdAt: reservation.createdAt,
    },
    pricePerRequest: paymentPrice,
    deadline,
  }
}

export async function readCachedResponse(idempotencyKey: string) {
  const redis = getRedis()
  const cached = await redis.get<string>(paymentRedisKey(`idem:${idempotencyKey}`))
  if (!cached) return null
  return typeof cached === 'string' ? JSON.parse(cached) : cached
}

export async function cacheResponse(idempotencyKey: string, result: unknown) {
  const redis = getRedis()
  await redis.setex(paymentRedisKey(`idem:${idempotencyKey}`), 3600, JSON.stringify(result))
}
