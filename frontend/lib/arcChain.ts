import { createPublicClient, http } from 'viem'
import { arcChain, IS_ARC_MAINNET } from './arcNetwork'

export { arcChain }

export const PAYWALL_V1_ADDRESS = '0xb1f95F4d86C743cbe1797C931A9680dF5766633A' as `0x${string}`
export const PAYWALL_V2_ADDRESS =
  (process.env.NEXT_PUBLIC_ARC_PAYWALL_V2_ADDRESS ??
    process.env.ARC_PAYWALL_V2_ADDRESS ??
    '') as `0x${string}` | ''

export const PAYWALL_V1_ABI = [
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'payable',
    inputs: [],
    outputs: [],
  },
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'client', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'nextNonce',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'client', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'pricePerRequest',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'requestsRemaining',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'client', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'redeemBatch',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'clients', type: 'address[]' },
      { name: 'clientNonces', type: 'uint256[]' },
      { name: 'deadlines', type: 'uint256[]' },
      { name: 'signatures', type: 'bytes[]' },
    ],
    outputs: [],
  },
] as const

export const PAYWALL_V2_ABI = [
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'payable',
    inputs: [],
    outputs: [],
  },
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'client', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'nextNonce',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'client', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'registerService',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'serviceId', type: 'bytes32' },
      { name: 'pricePerRequest', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'updateServicePrice',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'serviceId', type: 'bytes32' },
      { name: 'newPrice', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'setServiceActive',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'serviceId', type: 'bytes32' },
      { name: 'active', type: 'bool' },
    ],
    outputs: [],
  },
  {
    name: 'getService',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'serviceId', type: 'bytes32' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'owner', type: 'address' },
          { name: 'pricePerRequest', type: 'uint256' },
          { name: 'active', type: 'bool' },
        ],
      },
    ],
  },
  {
    name: 'getOwnerServices',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'provider', type: 'address' }],
    outputs: [{ name: '', type: 'bytes32[]' }],
  },
  {
    name: 'requestsRemaining',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'client', type: 'address' },
      { name: 'serviceId', type: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'claimable',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'withdrawProviderEarnings',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    name: 'redeemBatch',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'serviceIds', type: 'bytes32[]' },
      { name: 'clients', type: 'address[]' },
      { name: 'clientNonces', type: 'uint256[]' },
      { name: 'deadlines', type: 'uint256[]' },
      { name: 'paymentAmounts', type: 'uint256[]' },
      { name: 'signatures', type: 'bytes[]' },
    ],
    outputs: [],
  },
] as const

export const PAYWALL_VERSION = PAYWALL_V2_ADDRESS ? 'v2' : 'v1'
export const IS_PAYWALL_V2 = PAYWALL_VERSION === 'v2'
export const PAYWALL_ADDRESS = (
  PAYWALL_V2_ADDRESS ||
  (IS_ARC_MAINNET ? '0x0000000000000000000000000000000000000000' : PAYWALL_V1_ADDRESS)
) as `0x${string}`

export const publicClient = createPublicClient({
  chain: arcChain,
  transport: http(),
})
