import { ARC_CHAIN_ID } from './arcNetwork'

function paywallScope() {
  const address =
    process.env.NEXT_PUBLIC_ARC_PAYWALL_V2_ADDRESS ??
    process.env.ARC_PAYWALL_V2_ADDRESS ??
    'paywall-v1'

  return `flowpay:${ARC_CHAIN_ID}:${address.toLowerCase()}`
}

export function paymentRedisKey(suffix: string) {
  return `${paywallScope()}:${suffix}`
}

