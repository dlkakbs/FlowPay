import { describe, it, expect, beforeEach } from 'vitest'
import {
  reserveNonce,
  markSubmitted,
  enqueueItem,
  getPendingAmount,
} from '../lib/nonceReserver'
import { settleBatch } from '../lib/batchSettler'
import { paymentRedisKey } from '../lib/storageKeys'
import {
  createTestRedis,
  resetRedis,
  makeReadContract,
  makeWriteContract,
  futureDeadline,
  pastDeadline,
} from './helpers'

const CLIENT = '0xabcd1234abcd1234abcd1234abcd1234abcd1234'
const PRICE = BigInt(1e15) // 0.001 native USDC (18 decimals)

let redis: ReturnType<typeof createTestRedis>

beforeEach(async () => {
  redis = createTestRedis()
  await resetRedis(redis)
})

// ─── Senaryo 1: Cüzdan başına sıralı nonce rezervasyonu ──────────────────
describe('Senaryo 1: Serialized nonce reservations', () => {
  it('aynı cüzdan için yalnızca bir açık rezervasyona izin vermeli', async () => {
    const readContract = makeReadContract({ [CLIENT]: 0 })

    const first = await reserveNonce(CLIENT, readContract)
    expect(first.nonce).toBe(0)
    await expect(reserveNonce(CLIENT, readContract)).rejects.toThrow('pending')
  })

  it('enqueue sonrası bir sonraki nonce ardışık olmalı', async () => {
    const readContract = makeReadContract({ [CLIENT]: 0 })

    const first = await reserveNonce(CLIENT, readContract)
    const submitted = await markSubmitted(first.reservationId)
    expect(submitted).not.toBeNull()
    await enqueueItem(CLIENT, first.nonce, futureDeadline(), '0xsig', undefined, PRICE, first.reservationId)

    const second = await reserveNonce(CLIENT, readContract)
    expect(second.nonce).toBe(1)
  })

  it('queued ödemelerin gerçek USDC tutarını toplamalı', async () => {
    await enqueueItem(CLIENT, 0, futureDeadline(), '0xsig0', undefined, 2n * PRICE)
    await enqueueItem(CLIENT, 1, futureDeadline(), '0xsig1', undefined, 3n * PRICE)

    expect(await getPendingAmount(CLIENT)).toBe(5n * PRICE)
  })
})

// ─── Senaryo 2: Aynı request 2 kez gelirse ───────────────────────────────
describe('Senaryo 2: Duplicate request (idempotency)', () => {
  it('aynı reservationId ikinci kez kullanılırsa null dönmeli', async () => {
    const readContract = makeReadContract({ [CLIENT]: 0 })
    const { reservationId } = await reserveNonce(CLIENT, readContract)

    const first = await markSubmitted(reservationId)
    const second = await markSubmitted(reservationId) // tekrar

    expect(first).not.toBeNull()
    expect(first?.state).toBe('submitted')
    expect(second).toBeNull() // reddedildi
  })

  it('ilk rezervasyon enqueue edilince yeni reservationId kabul edilmeli', async () => {
    const readContract = makeReadContract({ [CLIENT]: 0 })

    const r1 = await reserveNonce(CLIENT, readContract)
    const s1 = await markSubmitted(r1.reservationId)
    await enqueueItem(CLIENT, r1.nonce, futureDeadline(), '0xsig', undefined, PRICE, r1.reservationId)

    const r2 = await reserveNonce(CLIENT, readContract)
    const s2 = await markSubmitted(r2.reservationId)

    expect(s1?.state).toBe('submitted')
    expect(s2?.state).toBe('submitted')
  })
})

// ─── Senaryo 3: TTL sonrası geç gelen imza ───────────────────────────────
describe('Senaryo 3: Late signature after reservation timeout', () => {
  it('TTL dolan (silinmiş) reservation null dönmeli', async () => {
    const readContract = makeReadContract({ [CLIENT]: 0 })
    const { reservationId } = await reserveNonce(CLIENT, readContract)

    // TTL expire simülasyonu — key'i manuel sil
    await redis.del(paymentRedisKey(`reservation:${reservationId}`))

    const result = await markSubmitted(reservationId)
    expect(result).toBeNull()
  })

  it('expired rezervasyon nonce gap oluşturmadan yeniden ayrılmalı', async () => {
    const readContract = makeReadContract({ [CLIENT]: 0 })

    // Nonce 0 rezerve et, expire et
    const { nonce: n0, reservationId: r0 } = await reserveNonce(CLIENT, readContract)
    expect(n0).toBe(0)
    await redis.del(paymentRedisKey(`reservation:${r0}`))
    await redis.del(paymentRedisKey(`reservation-slot:${CLIENT.toLowerCase()}`))

    // Yeni istek aynı on-chain nonce'u güvenle yeniden kullanır.
    const { nonce: n1 } = await reserveNonce(CLIENT, readContract)
    expect(n1).toBe(0)
  })

  it('süresi geçmiş deadline ile settle batch item skip etmeli', async () => {
    const settled: number[][] = []
    const write = makeWriteContract(settled)

    await enqueueItem(CLIENT, 0, pastDeadline(), '0xsig')

    const result = await settleBatch(CLIENT, 0, PRICE, write)

    expect(result.nonces).toHaveLength(0)
    expect(result.skipped).toContain(0)
    expect(settled).toHaveLength(0) // writeContract hiç çağrılmadı
  })
})

// ─── Senaryo 4: Out-of-order batch settlement ─────────────────────────────
describe('Senaryo 4: Out-of-order batch settlement', () => {
  it('out-of-order submit → settle nonce sırasına göre yapılmalı', async () => {
    const settled: number[][] = []
    const write = makeWriteContract(settled)
    const deadline = futureDeadline()

    // 3,1,2 sırasında enqueue
    await enqueueItem(CLIENT, 2, deadline, '0xsig2')
    await enqueueItem(CLIENT, 0, deadline, '0xsig0')
    await enqueueItem(CLIENT, 1, deadline, '0xsig1')

    const result = await settleBatch(CLIENT, 0, PRICE, write)

    // nonce sırasıyla settle edilmeli
    expect(result.nonces).toEqual([0, 1, 2])
    expect(settled[0]).toEqual([0, 1, 2])
  })

  it('on-chain nonce 2 ise sadece 2 settle edilmeli, 0 ve 1 fetch bile edilmemeli', async () => {
    const settled: number[][] = []
    const write = makeWriteContract(settled)
    const deadline = futureDeadline()

    // Stale item'lar queue'da kalmış (crash nedeniyle silinmemiş)
    await enqueueItem(CLIENT, 0, deadline, '0xsig0')
    await enqueueItem(CLIENT, 1, deadline, '0xsig1')
    // Pending item
    await enqueueItem(CLIENT, 2, deadline, '0xsig2')

    // On-chain nonce = 2 → getQueueItems range başlangıcı 2, 0 ve 1 fetch edilmez
    const result = await settleBatch(CLIENT, 2, PRICE, write)

    expect(result.nonces).toEqual([2])
    expect(settled[0]).toEqual([2]) // writeContract'a sadece nonce 2 gitti
    // 0 ve 1 range dışında → skipped listesine girmez, range filtresi yeterli
    expect(result.skipped).toHaveLength(0)
  })
})

// ─── Senaryo 5: Settler crash — yarım kalan queue ────────────────────────
describe('Senaryo 5: Settler crash recovery', () => {
  it('crash sonrası restart → on-chain nonce başlangıç noktası, queue devam eder', async () => {
    const deadline = futureDeadline()

    // Crash simülasyonu: 0,1 on-chain settle edildi ama queue'dan silinmedi
    // Settler restart: queue'da 0-4 var, on-chain nonce = 2
    for (let i = 0; i < 5; i++) {
      await enqueueItem(CLIENT, i, deadline, `0xsig${i}`)
    }

    // Restart: on-chain nonce = 2 ile devam → sadece 2,3,4 fetch edilir
    const settled: number[][] = []
    const result = await settleBatch(CLIENT, 2, PRICE, makeWriteContract(settled))

    expect(result.nonces).toEqual([2, 3, 4])
    expect(settled[0]).toEqual([2, 3, 4])
    // 0 ve 1 range dışında → atlanır, güvenli
  })

  it('boş queue ile settler çalışırsa writeContract çağrılmamalı', async () => {
    const settled: number[][] = []
    const write = makeWriteContract(settled)

    const result = await settleBatch(CLIENT, 0, PRICE, write)

    expect(result.nonces).toHaveLength(0)
    expect(settled).toHaveLength(0)
  })

  it('tüm item expired olursa writeContract çağrılmamalı', async () => {
    const settled: number[][] = []
    const write = makeWriteContract(settled)

    await enqueueItem(CLIENT, 0, pastDeadline(), '0xsig0')
    await enqueueItem(CLIENT, 1, pastDeadline(), '0xsig1')

    const result = await settleBatch(CLIENT, 0, PRICE, write)

    expect(result.nonces).toHaveLength(0)
    expect(result.skipped).toEqual([0])
    expect(settled).toHaveLength(0)
  })
})
