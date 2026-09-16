import { createPublicClient, http } from "viem";
import { defineChain } from "viem";
import { ARC_NATIVE_USDC_DECIMALS } from "@/lib/nativeUsdc";

const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: ARC_NATIVE_USDC_DECIMALS },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.network"] },
  },
});

const PAYWALL_ADDRESS = "0xb1f95F4d86C743cbe1797C931A9680dF5766633A" as `0x${string}`;

const ABI = [
  {
    name: "requestsRemaining",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "client", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const DEMO_RESPONSES: Record<string, string> = {
  default: "FlowPay enables usage-based payments onchain.",
  stream: "Streaming payments on FlowPay accrue every second. Recipients can withdraw anytime without waiting for a payment cycle.",
  invoice: "FlowPay invoices are settled on-chain. Create one, share the ID, and the payer sends USDC directly to you.",
  paywall: "The paywall model lets you deposit USDC upfront and consume credits per API call — no subscription, no overpaying.",
  usdc: "FlowPay uses native USDC on Arc Testnet. Sub-cent transactions make micropayments viable for the first time.",
  arc: "Arc is a high-throughput EVM chain with native USDC support. FlowPay is built on Arc to make payments instant and cheap.",
  how: "FlowPay has three payment primitives: Stream (continuous), Invoice (one-time), and Paywall (per-request). Each maps to a real-world payment need.",
};

function getDemoResponse(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (lower.includes("stream") || lower.includes("salary") || lower.includes("continu")) return DEMO_RESPONSES.stream;
  if (lower.includes("invoice") || lower.includes("bill") || lower.includes("pay ")) return DEMO_RESPONSES.invoice;
  if (lower.includes("paywall") || lower.includes("credit") || lower.includes("api")) return DEMO_RESPONSES.paywall;
  if (lower.includes("usdc") || lower.includes("token") || lower.includes("stablecoin")) return DEMO_RESPONSES.usdc;
  if (lower.includes("arc") || lower.includes("chain") || lower.includes("network")) return DEMO_RESPONSES.arc;
  if (lower.includes("how") || lower.includes("work") || lower.includes("what")) return DEMO_RESPONSES.how;
  return DEMO_RESPONSES.default;
}

export async function POST(req: Request) {
  const { address, prompt } = await req.json();

  if (!address) {
    return Response.json({ error: "Wallet address required." }, { status: 400 });
  }

  const client = createPublicClient({
    chain: arcTestnet,
    transport: http(),
  });

  const remaining = await client.readContract({
    address: PAYWALL_ADDRESS,
    abi: ABI,
    functionName: "requestsRemaining",
    args: [address as `0x${string}`],
  });

  if (remaining === 0n) {
    return Response.json(
      { error: "No credits remaining. Deposit USDC to continue." },
      { status: 402 }
    );
  }

  return Response.json({
    success: true,
    response: {
      message: getDemoResponse(prompt ?? ""),
      model: "flowpay-demo-v1",
      timestamp: new Date().toISOString(),
    },
    creditsUsed: 1,
    creditsRemaining: (remaining - 1n).toString(),
  });
}
