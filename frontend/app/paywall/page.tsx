"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract, useSignMessage } from "wagmi";
import { useAutoHide } from "@/lib/useAutoHide";
import { keccak256, encodePacked, toBytes } from "viem";
import { ArrowUpRight, Sparkles, Wallet, Gauge, Coins, Zap, Code2, LayoutGrid, CheckCircle2 } from "lucide-react";
import { CONTRACTS } from "@/lib/wagmi";
import {
  IS_PAYWALL_V2,
  PAYWALL_ADDRESS,
  PAYWALL_V1_ABI,
  PAYWALL_V2_ABI,
  publicClient,
} from "@/lib/arcChain";
import { formatNativeUsdc, parseNativeUsdc } from "@/lib/nativeUsdc";
import { ARC_CHAIN_ID, arcTxUrl, HAS_PUBLIC_ARC_EXPLORER } from "@/lib/arcNetwork";

const ABI = IS_PAYWALL_V2 ? PAYWALL_V2_ABI : PAYWALL_V1_ABI;

type ServiceEntry = {
  serviceId: string;
  name: string;
  desc: string;
  price?: string;
  active?: boolean;
  proxyUrl: string;
  ownerAddress?: string;
  demo?: boolean;
};

const DEMO_SERVICES_V1: ServiceEntry[] = [
  {
    serviceId: "svc_demo_ai",
    name: "Arc Docs Assistant",
    desc: "Ask questions about Arc docs, network setup, gas, native USDC, and EVM compatibility.",
    proxyUrl: "/api/request",
    demo: true,
  },
];

const reveal = {
  hidden: { opacity: 0, y: 36 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  },
};

function Reveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      variants={reveal}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.18 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function GlassCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-[2rem] border border-white/12 bg-white/8 backdrop-blur-xl shadow-[0_20px_80px_rgba(0,0,0,0.22)] ${className}`}
    >
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-2 block text-sm uppercase tracking-[0.22em] text-white/55">{children}</label>;
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-2xl border border-white/12 bg-black/20 px-4 py-3.5 text-white outline-none transition focus:border-white/30"
    />
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-[1.6rem] border border-white/10 bg-black/20 p-5">
      <div className="flex items-center gap-3">
        <div className="text-[#ffd7c7]">{icon}</div>
        <p className="text-xs uppercase tracking-[0.22em] text-white/45">{label}</p>
      </div>
      <div className="mt-5 text-2xl font-semibold tracking-[-0.04em] text-white">{value}</div>
    </div>
  );
}

export default function PaywallPage() {
  const { address, isConnected } = useAccount();

  const { writeContract: writeDeposit, data: depositHash, isPending: isDepositPending } = useWriteContract();
  const { writeContract: writeWithdraw, data: withdrawHash, isPending: isWithdrawPending } = useWriteContract();
  const { writeContractAsync: writeProviderAction, isPending: isProviderActionPending } = useWriteContract();
  const { signMessageAsync } = useSignMessage();
  const [svcSigning, setSvcSigning] = useState(false);
  const [claimHash, setClaimHash] = useState<`0x${string}` | undefined>();

  const { isLoading: isDepositMining, isSuccess: isDepositSuccess } = useWaitForTransactionReceipt({ hash: depositHash });
  const { isLoading: isWithdrawMining, isSuccess: isWithdrawSuccess } = useWaitForTransactionReceipt({ hash: withdrawHash });
  const { isLoading: isClaimMining, isSuccess: isClaimSuccess } = useWaitForTransactionReceipt({ hash: claimHash });

  const [depositAmt, setDepositAmt] = useState("");
  const [withdrawAmt, setWithdrawAmt] = useState("");
  const [prompt, setPrompt] = useState("");
  const [apiResult, setApiResult] = useState<null | { success?: boolean; response?: { message: string; model: string; timestamp: string }; creditsUsed?: number; creditsRemaining?: string; pendingCredits?: number; error?: string }>(null);
  const [apiLoading, setApiLoading] = useState(false);

  // Service browse & selection
  const [services, setServices] = useState<ServiceEntry[]>(IS_PAYWALL_V2 ? [] : DEMO_SERVICES_V1);
  const [selectedServiceId, setSelectedServiceId] = useState<string>(IS_PAYWALL_V2 ? "" : "svc_demo_ai");

  useEffect(() => {
    let cancelled = false;

    async function loadServices() {
      try {
        const res = await fetch("/api/services", { cache: "no-store" });
        const data = await res.json();
        if (!cancelled && Array.isArray(data.services)) {
          const nextServices = IS_PAYWALL_V2 ? (data.services as ServiceEntry[]) : [...DEMO_SERVICES_V1, ...(data.services as ServiceEntry[])];
          setServices(nextServices);
          setSelectedServiceId((current) => current || nextServices[0]?.serviceId || "");
        }
      } catch {
        if (!cancelled) setServices(IS_PAYWALL_V2 ? [] : DEMO_SERVICES_V1);
      }
    }

    loadServices();
    return () => { cancelled = true; };
  }, []);

  const selectedService = services.find((s) => s.serviceId === selectedServiceId) ?? services[0];

  // Service registration state
  const [svcName, setSvcName] = useState("");
  const [svcEndpoint, setSvcEndpoint] = useState("");
  const [svcPrice, setSvcPrice] = useState("0.001");
  const [svcDesc, setSvcDesc] = useState("");
  const [svcResult, setSvcResult] = useState<null | ServiceEntry>(null);

  const handleRegisterService = useCallback(async () => {
    if (!svcName.trim() || !svcEndpoint.trim() || !address) return;
    setSvcSigning(true);
    try {
      let serviceId: string | undefined;

      if (IS_PAYWALL_V2) {
        serviceId = keccak256(toBytes(`${address}:${svcName}:${svcEndpoint}:${Date.now()}:${crypto.randomUUID()}`));
        const registerHash = await writeProviderAction({
          address: CONTRACTS.arcPaywall,
          abi: PAYWALL_V2_ABI,
          functionName: "registerService",
          args: [serviceId as `0x${string}`, parseNativeUsdc(svcPrice)],
        });
        await publicClient.waitForTransactionReceipt({ hash: registerHash });
      }

      const message = `FlowPay service publish\nOwner: ${address}\nService ID: ${serviceId ?? "v1"}\nName: ${svcName}\nEndpoint: ${svcEndpoint}\nDescription: ${svcDesc || "-"}`;
      const signature = await signMessageAsync({ message });
      const res = await fetch("/api/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId,
          ownerAddress: address,
          name: svcName,
          desc: svcDesc,
          endpoint: svcEndpoint,
          signature,
          message,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.service) {
        throw new Error(data.error || "Failed to publish service.");
      }
      const entry = data.service as ServiceEntry;
      setServices((prev) => [...prev.filter((item) => item.serviceId !== entry.serviceId), entry]);
      setSelectedServiceId(entry.serviceId);
      setSvcResult(entry);
    } catch (err) {
      console.error(err);
    } finally {
      setSvcSigning(false);
    }
  }, [svcName, svcEndpoint, svcPrice, svcDesc, address, signMessageAsync, writeProviderAction]);

  const { data: balance } = useReadContract({
    address: CONTRACTS.arcPaywall,
    abi: ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 5000 },
  });

  const { data: remaining } = useReadContract({
    address: CONTRACTS.arcPaywall,
    abi: ABI,
    functionName: "requestsRemaining",
    args: address
      ? (IS_PAYWALL_V2
        ? selectedServiceId && /^0x[0-9a-fA-F]{64}$/.test(selectedServiceId)
          ? [address, selectedServiceId as `0x${string}`]
          : undefined
        : [address])
      : undefined,
    query: { enabled: !!address && (!IS_PAYWALL_V2 || !!selectedServiceId), refetchInterval: 5000 },
  });

  const { data: price } = useReadContract({
    address: CONTRACTS.arcPaywall,
    abi: PAYWALL_V1_ABI,
    functionName: "pricePerRequest",
    query: { enabled: !IS_PAYWALL_V2, refetchInterval: 60000 },
  });

  const { data: ownerServices } = useReadContract({
    address: CONTRACTS.arcPaywall,
    abi: PAYWALL_V2_ABI,
    functionName: "getOwnerServices",
    args: address ? [address] : undefined,
    query: { enabled: IS_PAYWALL_V2 && !!address, refetchInterval: 5000 },
  });

  const { data: claimable } = useReadContract({
    address: CONTRACTS.arcPaywall,
    abi: PAYWALL_V2_ABI,
    functionName: "claimable",
    args: address ? [address] : undefined,
    query: { enabled: IS_PAYWALL_V2 && !!address, refetchInterval: 5000 },
  });

  const depositBusy = isDepositPending || isDepositMining;
  const withdrawBusy = isWithdrawPending || isWithdrawMining;

  const showDepositSuccess = useAutoHide(isDepositSuccess);
  const showWithdrawSuccess = useAutoHide(isWithdrawSuccess);

  // Publish panel auto-hides after 30s so the proxy URL is still easy to copy.
  const svcResultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [svcResultVisible, setSvcResultVisible] = useState(false);
  useEffect(() => {
    if (svcResult) {
      setSvcResultVisible(true);
      svcResultTimerRef.current = setTimeout(() => setSvcResultVisible(false), 30000);
    }
    return () => { if (svcResultTimerRef.current) clearTimeout(svcResultTimerRef.current); };
  }, [svcResult]);

  function handleDeposit() {
    if (!depositAmt) return;
    writeDeposit({
      address: CONTRACTS.arcPaywall,
      abi: ABI,
      functionName: "deposit",
      value: parseNativeUsdc(depositAmt),
    });
  }

  async function handleTryRequest() {
    if (!address || !prompt.trim() || (IS_PAYWALL_V2 && !selectedServiceId)) return;
    setApiLoading(true);
    setApiResult(null);
    try {
      const nonceRes = await fetch("/api/get-nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientAddress: address, serviceId: IS_PAYWALL_V2 ? selectedServiceId : undefined }),
      });
      const { nonce, reservationId, deadline, pricePerRequest, error: nonceErr } = await nonceRes.json();
      if (nonceErr) { setApiResult({ error: nonceErr }); return; }

      const msgHash = IS_PAYWALL_V2
        ? keccak256(
            encodePacked(
              ["address", "uint256", "bytes32", "address", "uint256", "uint256", "uint256"],
              [
                PAYWALL_ADDRESS,
                BigInt(ARC_CHAIN_ID),
                selectedServiceId as `0x${string}`,
                address,
                BigInt(nonce),
                BigInt(deadline),
                BigInt(pricePerRequest),
              ]
            )
          )
        : keccak256(
            encodePacked(
              ["address", "uint256", "address", "uint256", "uint256", "uint256"],
              [
                PAYWALL_ADDRESS,
                BigInt(ARC_CHAIN_ID),
                address,
                BigInt(nonce),
                BigInt(deadline),
                BigInt(pricePerRequest),
              ]
            )
          );

      const signature = await signMessageAsync({ message: { raw: toBytes(msgHash) } });

      const idempotencyKey = crypto.randomUUID();
      const reqRes = await fetch(selectedService?.proxyUrl || "/api/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationId,
          idempotencyKey,
          signature,
          prompt: prompt.trim(),
          clientAddress: address,
          serviceId: selectedServiceId,
        }),
      });
      const data = await reqRes.json();
      setApiResult(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Request failed. Try again.";
      setApiResult({ error: msg });
    } finally {
      setApiLoading(false);
    }
  }

  function handleWithdraw() {
    if (!withdrawAmt) return;
    writeWithdraw({
      address: CONTRACTS.arcPaywall,
      abi: ABI,
      functionName: "withdraw",
      args: [parseNativeUsdc(withdrawAmt)],
    });
  }

  const requestEstimate = useMemo(() => {
    const selectedPrice = IS_PAYWALL_V2 && selectedService?.price ? BigInt(selectedService.price) : price;
    if (!depositAmt || selectedPrice === undefined) return null;
    const numericPrice = Number(formatNativeUsdc(selectedPrice as bigint));
    if (!numericPrice) return null;
    return Math.floor(Number(depositAmt) / numericPrice);
  }, [depositAmt, price, selectedService]);

  const globalPriceLabel = IS_PAYWALL_V2
    ? selectedService?.price
      ? formatNativeUsdc(BigInt(selectedService.price))
      : "—"
    : price !== undefined
      ? formatNativeUsdc(price as bigint)
      : "0.001";
  const providerOwnsServices = IS_PAYWALL_V2 && Array.isArray(ownerServices) && ownerServices.length > 0;
  const showClaimSuccess = useAutoHide(isClaimSuccess);

  return (
    <div className="min-h-screen overflow-hidden bg-[#120f1d] text-white">
      <div className="fixed inset-0 -z-20 bg-[linear-gradient(180deg,#120f1d_0%,#1d1530_42%,#0f1722_100%)]" />
      <div className="fixed inset-0 -z-10 opacity-90 bg-[radial-gradient(circle_at_14%_18%,rgba(255,179,138,0.18),transparent_24%),radial-gradient(circle_at_82%_14%,rgba(255,215,199,0.12),transparent_22%),radial-gradient(circle_at_68%_55%,rgba(255,140,80,0.10),transparent_28%),radial-gradient(circle_at_18%_78%,rgba(255,179,138,0.08),transparent_22%)]" />

      <main className="mx-auto max-w-7xl px-6 pb-24 pt-10 md:px-10 lg:px-12">
        <Reveal className="flex min-h-[72vh] items-center justify-center">
          <div className="max-w-4xl text-center">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-[11px] uppercase tracking-[0.28em] text-[#ffd7c7] backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5" /> Paywall · micro access
            </div>

            <h1 className="mt-8 text-5xl font-semibold leading-[0.9] tracking-[-0.06em] text-white md:text-7xl lg:text-[86px]">
              Turn access
              <span className="block text-[#ffb38a]">into micropayments</span>
              <span className="block text-white/85">with one deposit.</span>
            </h1>

            <p className="mx-auto mt-8 max-w-2xl text-lg leading-8 text-white/68 md:text-[21px]">
              Deposit once, consume request credits over time, and pay only for actual usage instead of bloated subscriptions.
            </p>
            <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-white/40">
              Building an API or AI-powered service? Publish your service below — clients discover it in the marketplace, while your real endpoint stays hidden behind the FlowPay proxy.
            </p>
          </div>
        </Reveal>

        {isConnected && (
          <Reveal>
            <div className="mb-6 grid gap-4 md:grid-cols-3">
              <Stat
                label="Balance"
                value={balance !== undefined ? `${formatNativeUsdc(balance)} USDC` : "—"}
                icon={<Wallet className="h-4 w-4" />}
              />
              <Stat
                label="Requests remaining"
                value={remaining !== undefined ? remaining.toString() : "—"}
                icon={<Gauge className="h-4 w-4" />}
              />
              <Stat
                label={IS_PAYWALL_V2 ? "Selected price" : "Price / request"}
                value={globalPriceLabel !== "—" ? `${globalPriceLabel} USDC` : "—"}
                icon={<Coins className="h-4 w-4" />}
              />
            </div>
          </Reveal>
        )}

        <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
          <Reveal className="h-full">
            <GlassCard className="h-full overflow-hidden flex flex-col">
              <div className="border-b border-white/10 p-7 md:p-8">
                <p className="text-sm uppercase tracking-[0.24em] text-white/50">Deposit credits</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Fund your request balance</h2>
              </div>

              <div className="flex flex-col justify-between flex-1 space-y-5 p-7 md:p-8">
                <div className="space-y-5">
                  <div>
                    <Label>Amount (USDC)</Label>
                    <Input
                      type="number"
                      placeholder="1.00"
                      step="0.001"
                      value={depositAmt}
                      onChange={(e) => setDepositAmt(e.target.value)}
                    />
                    {requestEstimate !== null && (
                      <p className="mt-2 text-sm text-white/45">≈ {requestEstimate} requests</p>
                    )}
                  </div>

                  <button
                    onClick={handleDeposit}
                    disabled={!isConnected || depositBusy || !depositAmt}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#fff4ec] px-6 py-4 text-sm font-semibold text-[#291c28] transition disabled:opacity-40"
                  >
                    {depositBusy ? "Processing..." : "Deposit credits"}
                    <ArrowUpRight className="h-4 w-4" />
                  </button>

                  {showDepositSuccess && depositHash && (
                    <div className="rounded-2xl border border-[#ffb38a]/20 bg-[#ffb38a]/10 p-4 text-sm text-[#ffd7c7] space-y-2">
                      <p>Deposit confirmed. Your request credits have been added.</p>
                      {HAS_PUBLIC_ARC_EXPLORER && (
                        <a
                          href={arcTxUrl(depositHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 font-medium text-[#ffb38a] underline underline-offset-2"
                        >
                          View transaction
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  )}

                  {!isConnected && <p className="text-sm text-white/45">Connect wallet to continue.</p>}
                </div>
              </div>
            </GlassCard>
          </Reveal>

          <Reveal className="h-full">
            <GlassCard className="h-full overflow-hidden flex flex-col">
              <div className="border-b border-white/10 p-7 md:p-8">
                <p className="text-sm uppercase tracking-[0.24em] text-white/50">Withdraw credits</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Recover unused balance</h2>
              </div>

              <div className="flex flex-col justify-between flex-1 space-y-5 p-7 md:p-8">
                <div className="space-y-5">
                  <div>
                    <Label>Amount (USDC)</Label>
                    <Input
                      type="number"
                      placeholder="1.00"
                      step="0.001"
                      value={withdrawAmt}
                      onChange={(e) => setWithdrawAmt(e.target.value)}
                    />
                    {balance !== undefined && (
                      <p className="mt-2 text-sm text-white/45">Available: {formatNativeUsdc(balance)} USDC</p>
                    )}
                  </div>

                  <button
                    onClick={handleWithdraw}
                    disabled={!isConnected || withdrawBusy || !withdrawAmt}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/14 bg-white/8 px-6 py-4 text-sm font-semibold text-white transition disabled:opacity-40"
                  >
                    {withdrawBusy ? "Processing..." : "Withdraw"}
                    <ArrowUpRight className="h-4 w-4" />
                  </button>

                  {showWithdrawSuccess && withdrawHash && (
                    <div className="rounded-2xl border border-[#ffb38a]/20 bg-[#ffb38a]/10 p-4 text-sm text-[#ffd7c7] space-y-2">
                      <p>Withdrawal confirmed. Funds have been returned to your wallet.</p>
                      {HAS_PUBLIC_ARC_EXPLORER && (
                        <a
                          href={arcTxUrl(withdrawHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 font-medium text-[#ffb38a] underline underline-offset-2"
                        >
                          View transaction
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  )}

                  {!isConnected && <p className="text-sm text-white/45">Connect wallet to continue.</p>}
                </div>
              </div>
            </GlassCard>
          </Reveal>
        </div>

        {/* Live demo + Available services — side by side */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2 lg:items-stretch">
        <Reveal className="h-full">
          <GlassCard className="h-full overflow-hidden flex flex-col">
            <div className="border-b border-white/10 p-7 md:p-8">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl border border-white/12 bg-black/20 p-3">
                    <Zap className="h-5 w-5 text-[#ffb38a]" />
                  </div>
                  <div>
                    <p className="text-sm uppercase tracking-[0.24em] text-white/50">Live demo</p>
                    <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em]">Try a paid API request</h2>
                  </div>
                </div>
                {selectedService && (
                  <div className="flex items-center gap-2 rounded-full border border-[#ffb38a]/20 bg-[#ffb38a]/10 px-4 py-1.5 text-xs text-[#ffd7c7]">
                    <CheckCircle2 className="h-3.5 w-3.5 text-[#ffb38a]" />
                    {selectedService.name}
                  </div>
                )}
              </div>
            </div>

            <div className="p-7 md:p-8">
              <p className="max-w-xl text-sm leading-7 text-white/60">
                Make a request and pay per call using your on-chain balance. Each request deducts one credit for the selected service.
              </p>

              <div className="mt-6 space-y-3 max-w-xl">
                <textarea
                  rows={3}
                  placeholder="Ask about Arc docs — RPC, chain ID, gas, native USDC, EVM compatibility..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleTryRequest();
                    }
                  }}
                  className="w-full rounded-2xl border border-white/12 bg-black/20 px-4 py-3.5 text-white outline-none transition focus:border-white/30 resize-none text-sm leading-7"
                />
                <button
                  onClick={handleTryRequest}
                  disabled={!isConnected || apiLoading || !prompt.trim() || (IS_PAYWALL_V2 && !selectedServiceId)}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#fff4ec] px-6 py-4 text-sm font-semibold text-[#291c28] transition disabled:opacity-40"
                >
                  {apiLoading ? "Sending request..." : "Send request"}
                  <ArrowUpRight className="h-4 w-4" />
                </button>
                {!isConnected && <p className="text-sm text-white/45">Connect wallet to continue.</p>}
              </div>

              {apiResult && (
                <div className="mt-6 max-w-xl space-y-4">
                  {apiResult.error ? (
                    <div className="rounded-2xl border border-red-400/20 bg-red-400/8 p-5 text-sm text-red-300">
                      {apiResult.error}
                    </div>
                  ) : (
                    <>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                        <p className="text-xs uppercase tracking-[0.22em] text-white/40 mb-3">Response</p>
                        <p className="text-base leading-7 text-white">{apiResult.response?.message}</p>
                      </div>
                      <div className="flex gap-3">
                        <div className="flex-1 rounded-2xl border border-white/10 bg-black/20 p-4 text-center">
                          <div className="text-xs uppercase tracking-[0.2em] text-white/40 mb-2">Credits used</div>
                          <div className="text-xl font-semibold text-white">{apiResult.creditsUsed}</div>
                        </div>
                        <div className="flex-1 rounded-2xl border border-white/10 bg-black/20 p-4 text-center">
                          <div className="text-xs uppercase tracking-[0.2em] text-white/40 mb-2">Credits remaining</div>
                          <div className="text-xl font-semibold text-white">{apiResult.creditsRemaining}</div>
                        </div>
                        {typeof apiResult.pendingCredits === "number" && (
                          <div className="flex-1 rounded-2xl border border-white/10 bg-black/20 p-4 text-center">
                            <div className="text-xs uppercase tracking-[0.2em] text-white/40 mb-2">Pending queue</div>
                            <div className="text-xl font-semibold text-white">{apiResult.pendingCredits}</div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </GlassCard>
        </Reveal>

        {/* Available services — right column */}
        <Reveal className="h-full">
          <GlassCard className="h-full overflow-hidden flex flex-col">
            <div className="border-b border-white/10 p-7 md:p-8">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-white/12 bg-black/20 p-3">
                  <LayoutGrid className="h-5 w-5 text-[#ffb38a]" />
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.24em] text-white/50">Marketplace</p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em]">Available services</h2>
                </div>
              </div>
            </div>

            <div className="flex flex-col flex-1 p-7 md:p-8">
              <p className="mb-5 text-sm leading-7 text-white/60">
                Pick a service below. Names and descriptions are public marketplace metadata; the real upstream endpoint stays private.
              </p>

              <div className="flex flex-col gap-3 flex-1">
                {services.length === 0 && (
                  <div className="rounded-[1.4rem] border border-white/10 bg-black/20 p-4 text-sm text-white/45">
                    No services registered yet.
                  </div>
                )}
                {services.map((svc) => {
                  const isSelected = svc.serviceId === selectedServiceId;
                  return (
                    <button
                      key={svc.serviceId}
                      onClick={() => setSelectedServiceId(svc.serviceId)}
                      className={`relative flex items-start gap-4 rounded-[1.4rem] border p-4 text-left transition ${
                        isSelected
                          ? "border-[#ffb38a]/50 bg-[#ffb38a]/10"
                          : "border-white/10 bg-black/20 hover:border-white/20 hover:bg-black/30"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold tracking-[-0.02em] text-white">{svc.name}</p>
                          {svc.demo && (
                            <span className="rounded-full border border-white/12 bg-white/8 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-white/35">Demo</span>
                          )}
                        </div>
                        <p className="mt-1 text-xs leading-5 text-white/45 line-clamp-2">{svc.desc}</p>
                        <div className="mt-2 inline-flex items-center rounded-full border border-[#ffb38a]/20 bg-[#ffb38a]/10 px-2.5 py-0.5 text-[11px] font-medium text-[#ffd7c7]">
                          {(svc.price ? formatNativeUsdc(BigInt(svc.price)) : globalPriceLabel)} USDC / req
                        </div>
                      </div>
                      {isSelected && (
                        <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-[#ffb38a]" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </GlassCard>
        </Reveal>
        </div>{/* end Live demo + Available services grid */}

        {/* Publish your service */}
        <Reveal>
          <GlassCard className="mt-6 overflow-hidden">
            <div className="border-b border-white/10 p-7 md:p-8">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-white/12 bg-black/20 p-3">
                  <Code2 className="h-5 w-5 text-[#ffb38a]" />
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.24em] text-white/50">For service providers</p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em]">Publish your API or agent</h2>
                </div>
              </div>
            </div>

            <div className="p-7 md:p-8">
              <p className="max-w-xl text-sm leading-7 text-white/60">
                Register your API or AI-powered service here. Ownership, pricing, activation state, and earnings live onchain. Your service name and description are public, but the real backend endpoint stays private behind the FlowPay proxy.
              </p>

              {!svcResult || !svcResultVisible ? (
                <div className="mt-6 grid gap-4 max-w-xl">
                  <div>
                    <Label>Service name</Label>
                    <Input
                      placeholder="My AI Image API"
                      value={svcName}
                      onChange={(e) => setSvcName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Endpoint URL</Label>
                    <Input
                      placeholder="https://api.yourservice.com/v1/generate"
                      value={svcEndpoint}
                      onChange={(e) => setSvcEndpoint(e.target.value)}
                    />
                    <p className="mt-2 text-xs text-white/35">Private — only FlowPay sees this. Clients receive a proxy URL instead.</p>
                  </div>
                  {IS_PAYWALL_V2 ? (
                    <div>
                      <Label>Price per request (USDC)</Label>
                      <Input
                        type="number"
                        placeholder="0.001"
                        step="0.0001"
                        value={svcPrice}
                        onChange={(e) => setSvcPrice(e.target.value)}
                      />
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3.5 text-sm text-white/70">
                      Global price per request: <span className="font-semibold text-white">{globalPriceLabel} USDC</span>
                    </div>
                  )}
                  <div>
                    <Label>Description (optional)</Label>
                    <Input
                      placeholder="One-line description shown in the marketplace"
                      value={svcDesc}
                      onChange={(e) => setSvcDesc(e.target.value)}
                    />
                  </div>
                  {!isConnected && <p className="text-sm text-white/45">Connect wallet to publish.</p>}
                  <button
                    onClick={handleRegisterService}
                    disabled={!isConnected || !svcName.trim() || !svcEndpoint.trim() || svcSigning}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[#fff4ec] px-6 py-4 text-sm font-semibold text-[#291c28] transition disabled:opacity-40"
                  >
                    {svcSigning ? "Sign in wallet…" : "Publish service"}
                    <ArrowUpRight className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="mt-6 max-w-xl space-y-4">
                  <div className="rounded-2xl border border-[#ffb38a]/20 bg-[#ffb38a]/10 p-5 text-sm text-[#ffd7c7] space-y-3">
                    <p className="font-semibold text-white">Your service is live in the marketplace.</p>
                    <p className="text-white/60">Clients can now discover and select it above. Every request is metered using the service&apos;s onchain price and settled on-chain — your backend endpoint stays private.</p>
                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-[0.2em] text-white/40">Service ID</p>
                      <code className="block rounded-xl bg-black/30 px-4 py-2.5 text-sm text-white font-mono">{svcResult.serviceId}</code>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-[0.2em] text-white/40">Proxy URL</p>
                      <div className="flex items-start gap-2">
                        <code className="flex-1 block rounded-xl bg-black/30 px-4 py-2.5 text-sm text-[#ffb38a] font-mono break-all">{svcResult.proxyUrl}</code>
                        <button
                          onClick={() => navigator.clipboard.writeText(`${window.location.origin}${svcResult.proxyUrl}`)}
                          className="shrink-0 rounded-xl border border-white/12 bg-white/8 px-3 py-2.5 text-xs text-white/60 hover:text-white transition"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-white/30">This panel disappears in 30 seconds — copy your proxy URL now.</p>
                  </div>
                  <button
                    onClick={() => { setSvcResult(null); setSvcName(""); setSvcEndpoint(""); setSvcPrice("0.001"); setSvcDesc(""); }}
                    className="text-sm text-white/40 underline underline-offset-2 hover:text-white/60 transition"
                  >
                    Register another service
                  </button>
                </div>
              )}
            </div>
          </GlassCard>
        </Reveal>

        {providerOwnsServices && (
          <Reveal>
            <GlassCard className="mt-6 overflow-hidden">
              <div className="border-b border-white/10 p-7 md:p-8">
                <p className="text-sm uppercase tracking-[0.24em] text-white/50">Provider earnings</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Claim settled revenue</h2>
              </div>
              <div className="p-7 md:p-8 space-y-5">
                <p className="text-sm leading-7 text-white/60">
                  This panel only appears for wallets that own at least one onchain service.
                </p>
                <div className="rounded-[1.6rem] border border-white/10 bg-black/20 p-5">
                  <div className="text-xs uppercase tracking-[0.22em] text-white/45">Claimable earnings</div>
                  <div className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">
                    {claimable !== undefined ? `${formatNativeUsdc(claimable)} USDC` : "—"}
                  </div>
                </div>
                <button
                  onClick={async () => {
                    const hash = await writeProviderAction({
                      address: CONTRACTS.arcPaywall,
                      abi: PAYWALL_V2_ABI,
                      functionName: "withdrawProviderEarnings",
                    });
                    setClaimHash(hash);
                  }}
                  disabled={isProviderActionPending || isClaimMining || !claimable || claimable === 0n}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#fff4ec] px-6 py-4 text-sm font-semibold text-[#291c28] transition disabled:opacity-40"
                >
                  {isProviderActionPending || isClaimMining ? "Claiming..." : "Claim earnings"}
                  <ArrowUpRight className="h-4 w-4" />
                </button>
                {showClaimSuccess && claimHash && (
                  <div className="rounded-2xl border border-[#ffb38a]/20 bg-[#ffb38a]/10 p-4 text-sm text-[#ffd7c7] space-y-2">
                    <p>Provider withdrawal confirmed.</p>
                    {HAS_PUBLIC_ARC_EXPLORER && (
                      <a
                        href={arcTxUrl(claimHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 font-medium text-[#ffb38a] underline underline-offset-2"
                      >
                        View transaction
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            </GlassCard>
          </Reveal>
        )}
      </main>
    </div>
  );
}
