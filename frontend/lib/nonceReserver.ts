import { Redis } from '@upstash/redis'
import { paymentRedisKey } from './storageKeys'

export const RESERVATION_TTL = 300 // 5 dakika

export type SlotState = 'reserved' | 'submitted' | 'settled' | 'expired'

export interface Reservation {
  addr: string
  nonce: number
  serviceId?: string
  state: SlotState
  createdAt: number
  usedAt: number | null
}

type ZItem = { score: number; member: string }

interface RedisLike {
  incr(key: string): Promise<number>
  set(key: string, value: string, opts?: { ex?: number; nx?: boolean; xx?: boolean; keepTtl?: boolean }): Promise<unknown>
  setex(key: string, seconds: number, value: string): Promise<unknown>
  get<T = string>(key: string): Promise<T | null>
  del(key: string): Promise<number>
  zadd(key: string, item: ZItem): Promise<number>
  zcard(key: string): Promise<number>
  sadd(key: string, member: string): Promise<number>
  smembers(key: string): Promise<string[]>
  srem(key: string, member: string): Promise<number>
  zrange(key: string, min: number, max: number | '+inf', opts?: { byScore?: boolean }): Promise<string[]>
  zremrangebyscore(key: string, min: number, max: number | '+inf'): Promise<number>
}

class LocalRedis implements RedisLike {
  private values = new Map<string, string>()
  private expiries = new Map<string, number>()
  private sets = new Map<string, Set<string>>()
  private zsets = new Map<string, ZItem[]>()

  private purge(key: string) {
    const expiry = this.expiries.get(key)
    if (expiry && Date.now() > expiry) {
      this.values.delete(key)
      this.expiries.delete(key)
    }
  }

  async incr(key: string) {
    this.purge(key)
    const current = Number(this.values.get(key) ?? '0') + 1
    this.values.set(key, String(current))
    return current
  }

  async set(key: string, value: string, opts?: { ex?: number; nx?: boolean; xx?: boolean; keepTtl?: boolean }) {
    this.purge(key)
    if (opts?.nx && this.values.has(key)) return null
    if (opts?.xx && !this.values.has(key)) return null
    this.values.set(key, value)
    if (opts?.ex) this.expiries.set(key, Date.now() + opts.ex * 1000)
    if (!opts?.keepTtl && !opts?.ex) this.expiries.delete(key)
    return 'OK'
  }

  async setex(key: string, seconds: number, value: string) {
    this.values.set(key, value)
    this.expiries.set(key, Date.now() + seconds * 1000)
    return 'OK'
  }

  async get<T = string>(key: string) {
    this.purge(key)
    return (this.values.get(key) as T | undefined) ?? null
  }

  async del(key: string) {
    const existed = this.values.delete(key)
    this.expiries.delete(key)
    this.sets.delete(key)
    this.zsets.delete(key)
    return existed ? 1 : 0
  }

  async zadd(key: string, item: ZItem) {
    const items = this.zsets.get(key) ?? []
    items.push(item)
    items.sort((a, b) => a.score - b.score)
    this.zsets.set(key, items)
    return 1
  }

  async zcard(key: string) {
    return (this.zsets.get(key) ?? []).length
  }

  async sadd(key: string, member: string) {
    const set = this.sets.get(key) ?? new Set<string>()
    const before = set.size
    set.add(member)
    this.sets.set(key, set)
    return set.size > before ? 1 : 0
  }

  async smembers(key: string) {
    return [...(this.sets.get(key) ?? new Set<string>())]
  }

  async srem(key: string, member: string) {
    const set = this.sets.get(key)
    if (!set) return 0
    const existed = set.delete(member)
    return existed ? 1 : 0
  }

  async zrange(key: string, min: number, max: number | '+inf', opts?: { byScore?: boolean }) {
    const items = this.zsets.get(key) ?? []
    if (opts?.byScore) {
      const maxScore = max === '+inf' ? Number.POSITIVE_INFINITY : max
      return items.filter((item) => item.score >= min && item.score <= maxScore).map((item) => item.member)
    }
    return items.slice(min, max === '+inf' ? undefined : max + 1).map((item) => item.member)
  }

  async zremrangebyscore(key: string, min: number, max: number | '+inf') {
    const items = this.zsets.get(key) ?? []
    const maxScore = max === '+inf' ? Number.POSITIVE_INFINITY : max
    const filtered = items.filter((item) => item.score < min || item.score > maxScore)
    this.zsets.set(key, filtered)
    return items.length - filtered.length
  }
}

let _redis: (RedisLike | Redis) | null = null

export function getRedis(): RedisLike | Redis {
  if (!_redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN

    if (url && token) {
      _redis = new Redis({ url, token }) as unknown as RedisLike
    } else if (process.env.NODE_ENV === 'production') {
      throw new Error('Persistent Redis is required in production. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.')
    } else {
      _redis = new LocalRedis()
    }
  }
  return _redis
}

// Test'te inject için
export function setRedisClient(client: RedisLike | Redis) {
  _redis = client
}

// Atomic nonce rezervasyonu
export async function reserveNonce(
  clientAddress: string,
  readContract: (addr: string) => Promise<number>,
  serviceId?: string
): Promise<{ nonce: number; reservationId: string }> {
  const redis = getRedis()
  const addr = clientAddress.toLowerCase()
  const reservationId = crypto.randomUUID()
  const slotKey = paymentRedisKey(`reservation-slot:${addr}`)

  const acquired = await redis.set(slotKey, reservationId, { ex: RESERVATION_TTL, nx: true })
  if (!acquired) {
    throw new Error('Another payment authorization is pending for this wallet. Retry in a moment.')
  }

  try {
    const onChainNonce = await readContract(addr)
    const queueKey = paymentRedisKey(`queue:${addr}`)

    if (onChainNonce > 0) {
      await redis.zremrangebyscore(queueKey, 0, onChainNonce - 1)
    }

    const queued = await redis.zrange(queueKey, onChainNonce, '+inf', { byScore: true })
    const nonce = onChainNonce + queued.length

    const reservation: Reservation = {
      addr,
      nonce,
      serviceId,
      state: 'reserved',
      createdAt: Date.now(),
      usedAt: null,
    }

    await redis.set(paymentRedisKey(`reservation:${reservationId}`), JSON.stringify(reservation), { ex: RESERVATION_TTL })

    return { nonce, reservationId }
  } catch (error) {
    await redis.del(slotKey)
    throw error
  }
}

export async function markSubmitted(reservationId: string): Promise<Reservation | null> {
  const redis = getRedis()
  const key = paymentRedisKey(`reservation:${reservationId}`)
  const claimKey = paymentRedisKey(`reservation-claim:${reservationId}`)

  const claimed = await redis.set(claimKey, '1', { ex: RESERVATION_TTL, nx: true })
  if (!claimed) return null

  const raw = await redis.get<string>(key)
  if (!raw) {
    await redis.del(claimKey)
    return null
  }

  const reservation: Reservation = typeof raw === 'string' ? JSON.parse(raw) : raw
  if (reservation.state !== 'reserved') {
    await redis.del(claimKey)
    return null
  }

  const updated: Reservation = { ...reservation, state: 'submitted', usedAt: Date.now() }
  const ok = await redis.set(key, JSON.stringify(updated), { xx: true, keepTtl: true })
  if (!ok) {
    await redis.del(claimKey)
    return null
  }

  return updated
}

export async function getReservation(reservationId: string): Promise<Reservation | null> {
  const redis = getRedis()
  const raw = await redis.get<string>(paymentRedisKey(`reservation:${reservationId}`))
  if (!raw) return null
  return typeof raw === 'string' ? JSON.parse(raw) : raw
}

export async function releaseSubmitted(reservationId: string): Promise<void> {
  const redis = getRedis()
  const key = paymentRedisKey(`reservation:${reservationId}`)
  const reservation = await getReservation(reservationId)
  if (!reservation || reservation.state !== 'submitted') return

  await redis.set(
    key,
    JSON.stringify({ ...reservation, state: 'reserved', usedAt: null }),
    { xx: true, keepTtl: true }
  )
  await redis.del(paymentRedisKey(`reservation-claim:${reservationId}`))
}

export async function enqueueItem(
  clientAddress: string,
  nonce: number,
  deadline: number,
  signature: string,
  serviceId?: string,
  pricePerRequest: bigint = 0n,
  reservationId?: string
): Promise<void> {
  const redis = getRedis()
  const addr = clientAddress.toLowerCase()
  await redis.zadd(paymentRedisKey(`queue:${addr}`), {
    score: nonce,
    member: JSON.stringify({ nonce, deadline, signature, serviceId, pricePerRequest: pricePerRequest.toString() }),
  })
  await redis.sadd(paymentRedisKey('active-clients'), addr)

  if (reservationId) {
    await redis.del(paymentRedisKey(`reservation-slot:${addr}`))
    await redis.del(paymentRedisKey(`reservation:${reservationId}`))
    await redis.del(paymentRedisKey(`reservation-claim:${reservationId}`))
  }
}

export async function getQueueSize(clientAddress: string): Promise<number> {
  const redis = getRedis()
  return Number(await redis.zcard(paymentRedisKey(`queue:${clientAddress.toLowerCase()}`)))
}

export async function getPendingAmount(clientAddress: string): Promise<bigint> {
  const items = await getQueueItems(clientAddress)
  return items.reduce((sum, item) => sum + BigInt(item.pricePerRequest), 0n)
}

export async function getActiveClients(): Promise<string[]> {
  const redis = getRedis()
  return await redis.smembers(paymentRedisKey('active-clients'))
}

export async function removeActiveClient(clientAddress: string): Promise<void> {
  const redis = getRedis()
  await redis.srem(paymentRedisKey('active-clients'), clientAddress.toLowerCase())
}

export async function getQueueItems(
  clientAddress: string,
  minNonce = 0,
  maxNonce = Infinity
): Promise<Array<{ nonce: number; deadline: number; signature: string; serviceId?: string; pricePerRequest: string }>> {
  const redis = getRedis()
  const addr = clientAddress.toLowerCase()
  const max: number | '+inf' = maxNonce === Infinity ? '+inf' : maxNonce
  const raw = await redis.zrange(paymentRedisKey(`queue:${addr}`), minNonce, max, { byScore: true })
  return raw.map((item) => {
    const parsed = typeof item === 'string' ? JSON.parse(item) : item
    return { ...parsed, pricePerRequest: parsed.pricePerRequest ?? '0' }
  })
}

export async function removeSettled(clientAddress: string, upToNonce: number): Promise<void> {
  const redis = getRedis()
  await redis.zremrangebyscore(paymentRedisKey(`queue:${clientAddress.toLowerCase()}`), 0, upToNonce)
}

export async function removeQueuedFrom(clientAddress: string, fromNonce: number): Promise<number> {
  const redis = getRedis()
  return await redis.zremrangebyscore(
    paymentRedisKey(`queue:${clientAddress.toLowerCase()}`),
    fromNonce,
    '+inf'
  )
}

export async function syncPendingCounter(clientAddress: string): Promise<void> {
  const redis = getRedis()
  const addr = clientAddress.toLowerCase()
  const size = Number(await redis.zcard(paymentRedisKey(`queue:${addr}`)))

  if (size === 0) {
    await removeActiveClient(addr)
    return
  }
}
