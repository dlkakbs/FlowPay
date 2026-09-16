import { defineChain } from 'viem'
import { ARC_NATIVE_USDC_DECIMALS } from './nativeUsdc'

export type ArcNetworkName = 'mainnet' | 'testnet'

export const ARC_NETWORK: ArcNetworkName =
  process.env.NEXT_PUBLIC_ARC_NETWORK === 'mainnet' ? 'mainnet' : 'testnet'

export const IS_ARC_MAINNET = ARC_NETWORK === 'mainnet'

export const ARC_CHAIN_ID: number = IS_ARC_MAINNET ? 5042 : 5042002
export const ARC_RPC_URL = IS_ARC_MAINNET
  ? 'https://rpc.mainnet.arc.io'
  : 'https://rpc.testnet.arc.io'
export const ARC_EXPLORER_URL = IS_ARC_MAINNET
  ? 'https://explorer.arc.io'
  : 'https://explorer.testnet.arc.io'

export const arcChain = defineChain({
  id: ARC_CHAIN_ID,
  name: IS_ARC_MAINNET ? 'Arc' : 'Arc Testnet',
  nativeCurrency: {
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: ARC_NATIVE_USDC_DECIMALS,
  },
  rpcUrls: {
    default: { http: [ARC_RPC_URL] },
  },
  blockExplorers: {
    default: { name: 'Arc Explorer', url: ARC_EXPLORER_URL },
  },
  testnet: !IS_ARC_MAINNET,
})

export function arcTxUrl(hash: string) {
  return `${ARC_EXPLORER_URL}/tx/${hash}`
}
