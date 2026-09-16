import { vi } from 'vitest'
import { setRedisClient } from '../lib/nonceReserver'

// @upstash/redis için in-memory mock
class InMemoryRedis {
  private store = new Map<string, { value: string; expiresAt?: number }>()
  private sortedSets = new Map<string, Map<string, number>>() // key → member → score

  private isExpired(key: string): boolean {
    const entry = this.store.get(key)
    if (!entry) return true
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return true
    }
    return false
  }

  async get<T = string>(key: string): Promise<T | null> {
    if (this.isExpired(key)) return null
    const entry = this.store.get(key)
    if (!entry) return null
    return entry.value as unknown as T
  }

  async set(key: string, value: unknown, opts?: { ex?: number; nx?: boolean; xx?: boolean; keepTtl?: boolean }): Promise<'OK' | null> {
    const existing = this.store.get(key)
    if (opts?.nx && existing && !this.isExpired(key)) return null
    if (opts?.xx && !existing) return null

    const expiresAt = opts?.ex
      ? Date.now() + opts.ex * 1000
      : opts?.keepTtl && existing?.expiresAt
      ? existing.expiresAt
      : undefined

    this.store.set(key, { value: String(value), expiresAt })
    return 'OK'
  }

  async setex(key: string, ttl: number, value: unknown): Promise<'OK'> {
    await this.set(key, value, { ex: ttl })
    return 'OK'
  }

  async get_raw(key: string) { return this.store.get(key) }

  async incr(key: string): Promise<number> {
    const entry = this.store.get(key)
    const current = entry ? parseInt(entry.value) : 0
    const next = current + 1
    this.store.set(key, { value: String(next) })
    return next
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0
    for (const key of keys) {
      if (this.store.delete(key)) count++
    }
    return count
  }

  async zadd(key: string, ...args: unknown[]): Promise<number> {
    if (!this.sortedSets.has(key)) this.sortedSets.set(key, new Map())
    const set = this.sortedSets.get(key)!
    // @upstash/redis format: { score, member }
    const item = args[0] as { score: number; member: string }
    const isNew = !set.has(item.member)
    set.set(item.member, item.score)
    return isNew ? 1 : 0
  }

  async zrangebyscore(key: string, min: number | string, max: number | string): Promise<string[]> {
    return this.zrange(key, min, max, { byScore: true })
  }

  async zrange(key: string, min: number | string, max: number | string, opts?: { byScore?: boolean }): Promise<string[]> {
    const set = this.sortedSets.get(key)
    if (!set) return []
    if (opts?.byScore) {
      const minN = min === '-inf' ? -Infinity : Number(min)
      const maxN = max === '+inf' ? Infinity : Number(max)
      return [...set.entries()]
        .filter(([, score]) => score >= minN && score <= maxN)
        .sort(([, a], [, b]) => a - b)
        .map(([member]) => member)
    }
    // index-based range
    const entries = [...set.entries()].sort(([, a], [, b]) => a - b)
    return entries.slice(Number(min), Number(max) + 1).map(([member]) => member)
  }

  async zremrangebyscore(key: string, min: number | string, max: number | string): Promise<number> {
    const set = this.sortedSets.get(key)
    if (!set) return 0
    const minN = min === '-inf' ? -Infinity : Number(min)
    const maxN = max === '+inf' ? Infinity : Number(max)
    let count = 0
    for (const [member, score] of set.entries()) {
      if (score >= minN && score <= maxN) { set.delete(member); count++ }
    }
    return count
  }

  async zcard(key: string): Promise<number> {
    return this.sortedSets.get(key)?.size ?? 0
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    if (!this.sortedSets.has(key)) this.sortedSets.set(key, new Map())
    const set = this.sortedSets.get(key)!
    let added = 0
    for (const m of members) { if (!set.has(m)) { set.set(m, 0); added++ } }
    return added
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    const set = this.sortedSets.get(key)
    if (!set) return 0
    let removed = 0
    for (const m of members) { if (set.delete(m)) removed++ }
    return removed
  }

  async smembers(key: string): Promise<string[]> {
    return [...(this.sortedSets.get(key)?.keys() ?? [])]
  }

  async flushall(): Promise<void> {
    this.store.clear()
    this.sortedSets.clear()
  }
}

vi.mock('@upstash/redis', () => ({
  Redis: class {
    constructor() { return testRedis }
  }
}))

export const testRedis = new InMemoryRedis()

setRedisClient(testRedis as unknown as import('@upstash/redis').Redis)
