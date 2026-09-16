import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatUnits,
  getContractAddress,
  http,
  keccak256,
  parseGwei,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const ARC_MAINNET_CHAIN_ID = 5042
const ARC_MAINNET_RPC_URL = 'https://rpc.mainnet.arc.io'
const EXPECTED_DEPLOYER = '0xe7E598D278F5ee26D27743f66C34D74DB1f45bD7'
const BROADCAST_CONFIRMATION = 'DEPLOY_FLOWPAY_TO_ARC_MAINNET_5042'
const MIN_MAX_FEE_PER_GAS = parseGwei('60')
const MIN_PRIORITY_FEE_PER_GAS = parseGwei('1')
const GAS_BUFFER_NUMERATOR = 12n
const GAS_BUFFER_DENOMINATOR = 10n

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const frontendDirectory = resolve(scriptDirectory, '..')
const repositoryDirectory = resolve(frontendDirectory, '..')
const envPath = resolve(frontendDirectory, '.env.local')
const deploymentPath = resolve(repositoryDirectory, 'deployments', 'arc-mainnet.json')

if (!existsSync(envPath)) {
  throw new Error(`Missing local environment file: ${envPath}`)
}

process.loadEnvFile(envPath)

const privateKey = process.env.OWNER_PRIVATE_KEY
if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
  throw new Error('OWNER_PRIVATE_KEY is missing or invalid')
}

const account = privateKeyToAccount(privateKey)
if (account.address.toLowerCase() !== EXPECTED_DEPLOYER.toLowerCase()) {
  throw new Error(`Unexpected deployer address: ${account.address}`)
}

const arcMainnet = defineChain({
  id: ARC_MAINNET_CHAIN_ID,
  name: 'Arc',
  nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [ARC_MAINNET_RPC_URL] } },
})

const transport = http(ARC_MAINNET_RPC_URL)
const publicClient = createPublicClient({ chain: arcMainnet, transport })
const walletClient = createWalletClient({ account, chain: arcMainnet, transport })

function loadArtifact(relativePath) {
  const artifactPath = resolve(repositoryDirectory, relativePath)
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'))
  const bytecode = artifact.bytecode?.object
  const deployedBytecode = artifact.deployedBytecode?.object

  if (!bytecode?.startsWith('0x') || !deployedBytecode?.startsWith('0x')) {
    throw new Error(`Missing bytecode in ${relativePath}`)
  }

  return {
    abi: artifact.abi,
    artifactPath: relativePath,
    bytecode,
    deployedBytecode,
  }
}

const contracts = [
  { name: 'ArcFlow', ...loadArtifact('out/ArcFlow.sol/ArcFlow.json') },
  { name: 'ArcInvoice', ...loadArtifact('out/ArcInvoice.sol/ArcInvoice.json') },
  { name: 'ArcPaywallV2', ...loadArtifact('out/ArcPaywallV2.sol/ArcPaywallV2.json') },
]

function saveDeployment(record) {
  mkdirSync(dirname(deploymentPath), { recursive: true })
  const temporaryPath = `${deploymentPath}.tmp`
  writeFileSync(temporaryPath, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 })
  renameSync(temporaryPath, deploymentPath)
}

function loadDeployment() {
  if (!existsSync(deploymentPath)) {
    return {
      network: 'arc-mainnet',
      chainId: ARC_MAINNET_CHAIN_ID,
      rpcUrl: ARC_MAINNET_RPC_URL,
      deployer: account.address,
      contracts: {},
    }
  }

  const record = JSON.parse(readFileSync(deploymentPath, 'utf8'))
  if (
    record.chainId !== ARC_MAINNET_CHAIN_ID ||
    record.deployer?.toLowerCase() !== account.address.toLowerCase()
  ) {
    throw new Error('Existing deployment record does not match Arc Mainnet or the deployer')
  }
  return record
}

function bufferedGas(estimate) {
  return (estimate * GAS_BUFFER_NUMERATOR + GAS_BUFFER_DENOMINATOR - 1n) /
    GAS_BUFFER_DENOMINATOR
}

async function verifyRuntime(contract, address) {
  const code = await publicClient.getCode({ address })
  if (!code || code === '0x') {
    throw new Error(`${contract.name} has no runtime bytecode at ${address}`)
  }
  if (code.toLowerCase() !== contract.deployedBytecode.toLowerCase()) {
    throw new Error(`${contract.name} runtime bytecode mismatch at ${address}`)
  }
  return code
}

async function main() {
  const shouldBroadcast = process.argv.includes('--broadcast')
  if (shouldBroadcast && process.env.CONFIRM_ARC_MAINNET_DEPLOY !== BROADCAST_CONFIRMATION) {
    throw new Error('Arc Mainnet broadcast confirmation is missing')
  }

  const chainId = await publicClient.getChainId()
  if (chainId !== ARC_MAINNET_CHAIN_ID) {
    throw new Error(`Wrong chain ID: expected ${ARC_MAINNET_CHAIN_ID}, received ${chainId}`)
  }

  const [balance, nonce, estimatedFees] = await Promise.all([
    publicClient.getBalance({ address: account.address }),
    publicClient.getTransactionCount({ address: account.address, blockTag: 'pending' }),
    publicClient.estimateFeesPerGas(),
  ])

  const estimatedMaxFee = estimatedFees.maxFeePerGas ?? 0n
  const estimatedPriorityFee = estimatedFees.maxPriorityFeePerGas ?? 0n
  const maxFeePerGas = estimatedMaxFee * 2n > MIN_MAX_FEE_PER_GAS
    ? estimatedMaxFee * 2n
    : MIN_MAX_FEE_PER_GAS
  const maxPriorityFeePerGas = estimatedPriorityFee > MIN_PRIORITY_FEE_PER_GAS
    ? estimatedPriorityFee
    : MIN_PRIORITY_FEE_PER_GAS

  console.log(`Mode: ${shouldBroadcast ? 'BROADCAST' : 'PREFLIGHT'}`)
  console.log(`Chain ID: ${chainId}`)
  console.log(`Deployer: ${account.address}`)
  console.log(`Pending nonce: ${nonce}`)
  console.log(`Balance: ${formatUnits(balance, 18)} USDC`)
  console.log(`Max fee cap: ${formatUnits(maxFeePerGas, 9)} gwei`)
  console.log(`Priority fee cap: ${formatUnits(maxPriorityFeePerGas, 9)} gwei`)

  const deployment = loadDeployment()
  let totalMaximumCost = 0n
  let simulatedNonce = nonce

  for (let index = 0; index < contracts.length; index++) {
    const contract = contracts[index]
    const existing = deployment.contracts[contract.name]

    if (existing?.address) {
      await verifyRuntime(contract, existing.address)
      console.log(`${contract.name}: already verified at ${existing.address}`)
      continue
    }

    const transactionNonce = shouldBroadcast
      ? await publicClient.getTransactionCount({
          address: account.address,
          blockTag: 'pending',
        })
      : simulatedNonce
    const predictedAddress = getContractAddress({
      from: account.address,
      nonce: BigInt(transactionNonce),
    })
    const existingCode = await publicClient.getCode({ address: predictedAddress })
    if (existingCode && existingCode !== '0x') {
      throw new Error(`Predicted address is not empty: ${predictedAddress}`)
    }

    const gasEstimate = await publicClient.estimateGas({
      account: account.address,
      data: contract.bytecode,
    })
    const gas = bufferedGas(gasEstimate)
    const maximumCost = gas * maxFeePerGas
    totalMaximumCost += maximumCost

    console.log(
      `${contract.name}: nonce=${transactionNonce}, predicted=${predictedAddress}, ` +
        `gas=${gasEstimate} (limit ${gas}), max=${formatUnits(maximumCost, 18)} USDC`,
    )

    if (!shouldBroadcast) {
      simulatedNonce++
      continue
    }

    const currentBalance = await publicClient.getBalance({ address: account.address })
    if (currentBalance < maximumCost) {
      throw new Error(`Insufficient balance before deploying ${contract.name}`)
    }

    const hash = await walletClient.deployContract({
      abi: contract.abi,
      bytecode: contract.bytecode,
      gas,
      maxFeePerGas,
      maxPriorityFeePerGas,
    })
    console.log(`${contract.name}: submitted ${hash}`)

    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      confirmations: 1,
      timeout: 120_000,
    })
    if (receipt.status !== 'success' || !receipt.contractAddress) {
      throw new Error(`${contract.name} deployment failed: ${hash}`)
    }
    if (receipt.contractAddress.toLowerCase() !== predictedAddress.toLowerCase()) {
      throw new Error(`${contract.name} deployed to an unexpected address`)
    }

    const runtimeCode = await verifyRuntime(contract, receipt.contractAddress)
    const deploymentCost = receipt.gasUsed * receipt.effectiveGasPrice

    deployment.contracts[contract.name] = {
      address: receipt.contractAddress,
      transactionHash: hash,
      blockNumber: receipt.blockNumber.toString(),
      gasUsed: receipt.gasUsed.toString(),
      effectiveGasPrice: receipt.effectiveGasPrice.toString(),
      costUsdc: formatUnits(deploymentCost, 18),
      artifact: contract.artifactPath,
      initCodeHash: keccak256(contract.bytecode),
      runtimeCodeHash: keccak256(runtimeCode),
    }
    saveDeployment(deployment)
    console.log(
      `${contract.name}: confirmed at ${receipt.contractAddress}; ` +
        `cost=${formatUnits(deploymentCost, 18)} USDC`,
    )
  }

  if (!shouldBroadcast) {
    if (balance < totalMaximumCost) {
      throw new Error(
        `Insufficient preflight balance: need at most ${formatUnits(totalMaximumCost, 18)} USDC`,
      )
    }
    console.log(`Preflight maximum total: ${formatUnits(totalMaximumCost, 18)} USDC`)
    console.log('PREFLIGHT PASSED')
    return
  }

  deployment.completedAt = new Date().toISOString()
  deployment.remainingBalanceUsdc = formatUnits(
    await publicClient.getBalance({ address: account.address }),
    18,
  )
  saveDeployment(deployment)
  console.log(`Remaining balance: ${deployment.remainingBalanceUsdc} USDC`)
  console.log('ARC MAINNET DEPLOYMENT COMPLETE')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
