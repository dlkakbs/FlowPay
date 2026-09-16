import { testRedis } from './setup'
import { setRedisClient } from '../lib/nonceReserver'

export function createTestRedis() {
  setRedisClient(testRedis as never)
  return testRedis
}

export async function resetRedis(redis: typeof testRedis) {
  await redis.flushall()
}

export function makeReadContract(nonceMap: Record<string, number> = {}) {
  return async (addr: string): Promise<number> => nonceMap[addr.toLowerCase()] ?? 0
}

export function makeWriteContract(settled: number[][] = []) {
  return async (args: {
    clients: string[]
    nonces: bigint[]
    deadlines: bigint[]
    paymentAmounts: bigint[]
    signatures: string[]
  }): Promise<string> => {
    settled.push(args.nonces.map(Number))
    return `0xfaketxhash_${Date.now()}`
  }
}

export function futureDeadline(): number {
  return Math.floor(Date.now() / 1000) + 600
}

export function pastDeadline(): number {
  return Math.floor(Date.now() / 1000) - 1
}
