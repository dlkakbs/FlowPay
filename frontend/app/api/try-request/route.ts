import { IS_PAYWALL_V2, PAYWALL_ADDRESS, PAYWALL_V1_ABI, PAYWALL_V2_ABI, publicClient } from "@/lib/arcChain";

const DEMO_RESPONSES: Record<string, string> = {
  default: "FlowPay enables usage-based payments onchain.",
  stream: "Streaming payments on FlowPay accrue every second. Recipients can withdraw anytime without waiting for a payment cycle.",
  invoice: "FlowPay invoices are settled on-chain. Create one, share the ID, and the payer sends USDC directly to you.",
  paywall: "The paywall model lets you deposit USDC upfront and consume credits per API call — no subscription, no overpaying.",
  usdc: "FlowPay uses native USDC on Arc. Sub-cent transactions make micropayments viable for the first time.",
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
  const { address, prompt, serviceId } = await req.json();

  if (!address) {
    return Response.json({ error: "Wallet address required." }, { status: 400 });
  }

  if (IS_PAYWALL_V2 && (!serviceId || !/^0x[0-9a-fA-F]{64}$/.test(serviceId))) {
    return Response.json({ error: "Service ID required." }, { status: 400 });
  }

  const remaining = await publicClient.readContract({
    address: PAYWALL_ADDRESS,
    abi: IS_PAYWALL_V2 ? PAYWALL_V2_ABI : PAYWALL_V1_ABI,
    functionName: "requestsRemaining",
    args: IS_PAYWALL_V2
      ? [address as `0x${string}`, serviceId as `0x${string}`]
      : [address as `0x${string}`],
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
