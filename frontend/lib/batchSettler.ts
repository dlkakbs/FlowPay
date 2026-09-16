import {
  getQueueItems,
  removeQueuedFrom,
  removeSettled,
  syncPendingCounter,
} from './nonceReserver'
import { keccak256, encodePacked } from 'viem'
import { IS_PAYWALL_V2, PAYWALL_ADDRESS } from './arcChain'
import { ARC_CHAIN_ID } from './arcNetwork'

export const BATCH_SIZE = 50
export const BATCH_INTERVAL_MS = 10 * 60 * 1000 // 10 dakika

export interface BatchResult {
  nonces: number[]
  skipped: number[]
  txHash?: string
}

// İmza doğrulama (contract'taki hash ile aynı)
export function buildMsgHash(
  serviceId: string | undefined,
  clientAddress: string,
  nonce: number,
  deadline: number,
  pricePerRequest: bigint
): `0x${string}` {
  if (IS_PAYWALL_V2 && serviceId) {
    return keccak256(
      encodePacked(
        ['address', 'uint256', 'bytes32', 'address', 'uint256', 'uint256', 'uint256'],
        [
          PAYWALL_ADDRESS,
          BigInt(ARC_CHAIN_ID),
          serviceId as `0x${string}`,
          clientAddress as `0x${string}`,
          BigInt(nonce),
          BigInt(deadline),
          pricePerRequest,
        ]
      )
    )
  }

  return keccak256(
    encodePacked(
      ['address', 'uint256', 'address', 'uint256', 'uint256', 'uint256'],
      [
        PAYWALL_ADDRESS,
        BigInt(ARC_CHAIN_ID),
        clientAddress as `0x${string}`,
        BigInt(nonce),
        BigInt(deadline),
        pricePerRequest,
      ]
    )
  )
}

// Batch settle — writeContract inject edilerek test edilebilir
export async function settleBatch(
  clientAddress: string,
  onChainNonce: number,
  pricePerRequest: bigint,
  writeContract: (args: {
    serviceIds?: string[]
    clients: string[]
    nonces: bigint[]
    deadlines: bigint[]
    paymentAmounts: bigint[]
    signatures: string[]
  }) => Promise<string>,
  readNonceAfterWrite?: (clientAddress: string) => Promise<number>
): Promise<BatchResult> {
  const now = Math.floor(Date.now() / 1000)

  const items = await getQueueItems(clientAddress, onChainNonce, onChainNonce + BATCH_SIZE - 1)

  const valid: typeof items = []
  const skipped: number[] = []
  let expectedNonce = onChainNonce

  for (const item of items) {
    if (item.nonce !== expectedNonce) break

    // Süresi geçmiş → skip
    if (item.deadline <= now) {
      skipped.push(item.nonce)
      await removeQueuedFrom(clientAddress, item.nonce)
      await syncPendingCounter(clientAddress)
      break
    }
    // On-chain nonce'dan küçük → zaten settled → skip
    if (item.nonce < onChainNonce) {
      skipped.push(item.nonce)
      continue
    }
    valid.push(item)
    expectedNonce++
  }

  if (valid.length === 0) return { nonces: [], skipped }

  const txHash = await writeContract({
    serviceIds: IS_PAYWALL_V2 ? valid.map((i) => i.serviceId ?? '0x0000000000000000000000000000000000000000000000000000000000000000') : undefined,
    clients: valid.map(() => clientAddress),
    nonces: valid.map(i => BigInt(i.nonce)),
    deadlines: valid.map(i => BigInt(i.deadline)),
    paymentAmounts: valid.map(i => BigInt(i.pricePerRequest)),
    signatures: valid.map(i => i.signature),
  })

  const settledThrough = readNonceAfterWrite
    ? await readNonceAfterWrite(clientAddress)
    : onChainNonce + valid.length

  const settledNonces = valid
    .filter((item) => item.nonce < settledThrough)
    .map((item) => item.nonce)

  if (settledNonces.length > 0) {
    await removeSettled(clientAddress, settledThrough - 1)
  }
  await syncPendingCounter(clientAddress)

  return { nonces: settledNonces, skipped, txHash }
}
