"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useAccount, useReadContract, useReadContracts, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { useAutoHide } from "@/lib/useAutoHide";
import { decodeEventLog } from "viem";
import { CONTRACTS } from "@/lib/wagmi";
import { formatNativeUsdc, parseNativeUsdc } from "@/lib/nativeUsdc";
import { arcTxUrl, HAS_PUBLIC_ARC_EXPLORER } from "@/lib/arcNetwork";
import { ArrowUpRight, Sparkles, Wallet, Activity, Radio } from "lucide-react";

const ABI = [
  {
    name: "createStream",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "rate", type: "uint256" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    name: "withdraw",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    name: "cancelStream",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    name: "monthlyToRate",
    type: "function",
    stateMutability: "pure",
    inputs: [{ name: "monthlyUsdc", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "streams",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      { name: "payer", type: "address" },
      { name: "recipient", type: "address" },
      { name: "rate", type: "uint256" },
      { name: "startTime", type: "uint256" },
      { name: "deposit", type: "uint256" },
      { name: "withdrawn", type: "uint256" },
      { name: "active", type: "bool" },
    ],
  },
  {
    name: "withdrawable",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "remainingTime",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "streamCount",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "StreamCreated",
    type: "event",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "payer", type: "address", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "rate", type: "uint256", indexed: false },
      { name: "deposit", type: "uint256", indexed: false },
    ],
  },
] as const;

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
    <div className={`rounded-[2rem] border border-white/12 bg-white/8 backdrop-blur-xl shadow-[0_20px_80px_rgba(0,0,0,0.22)] ${className}`}>
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

function shortAddr(addr: string) {
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

function timeAgo(startTime: bigint) {
  const seconds = Math.floor(Date.now() / 1000) - Number(startTime);
  if (seconds < 60) return `${seconds} seconds ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

export default function StreamPage() {
  const { isConnected } = useAccount();
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isMining, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash });

  const { writeContract: writeWithdraw, data: withdrawHash, isPending: isWithdrawPending } = useWriteContract();
  const { isLoading: isWithdrawMining, isSuccess: isWithdrawSuccess } = useWaitForTransactionReceipt({ hash: withdrawHash });

  const { writeContract: writeCancel, data: cancelHash, isPending: isCancelPending } = useWriteContract();
  const { isLoading: isCancelMining, isSuccess: isCancelSuccess } = useWaitForTransactionReceipt({ hash: cancelHash });
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const { writeContract: writeIncomingWithdraw, data: incomingWithdrawHash, isPending: isIncomingWithdrawPending } = useWriteContract();
  const { isLoading: isIncomingWithdrawMining, isSuccess: isIncomingWithdrawSuccess } = useWaitForTransactionReceipt({ hash: incomingWithdrawHash });
  const [withdrawingIncomingId, setWithdrawingIncomingId] = useState<number | null>(null);
  const showIncomingWithdrawSuccess = useAutoHide(isIncomingWithdrawSuccess);

  const showCreateSuccess = useAutoHide(isSuccess, 12000);
  const showWithdrawSuccess = useAutoHide(isWithdrawSuccess);
  // cancelledStreamIds: IDs added immediately on click (keeps row visible during mining)
  // cancelSuccessIds: IDs added on tx success (shows feedback message)
  const [cancelledStreamIds, setCancelledStreamIds] = useState<Set<number>>(new Set());
  const [cancelSuccessIds, setCancelSuccessIds] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (isCancelSuccess && cancellingId !== null) {
      const id = cancellingId;
      setCancelSuccessIds(prev => new Set(prev).add(id));
      const t = setTimeout(() => {
        setCancelledStreamIds(prev => { const n = new Set(prev); n.delete(id); return n; });
        setCancelSuccessIds(prev => { const n = new Set(prev); n.delete(id); return n; });
      }, 6000);
      return () => clearTimeout(t);
    }
  }, [isCancelSuccess, cancellingId]);

  const [recipient, setRecipient] = useState("");
  const [monthly, setMonthly] = useState("");
  const [deposit, setDeposit] = useState("");
  const [streamId, setStreamId] = useState<bigint | null>(null);
  const [lookupId, setLookupId] = useState("");
  const [confirmedLookupId, setConfirmedLookupId] = useState("");
  const [tick, setTick] = useState(0);

  // Tick every second for live withdrawable display
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const { data: rate } = useReadContract({
    address: CONTRACTS.arcFlow,
    abi: ABI,
    functionName: "monthlyToRate",
    args: monthly ? [parseNativeUsdc(monthly)] : undefined,
    query: { enabled: !!monthly },
  });

  // Active stream ID (from creation or manual lookup)
  const activeId = confirmedLookupId ? BigInt(confirmedLookupId) : null;

  const { data: streamData } = useReadContract({
    address: CONTRACTS.arcFlow,
    abi: ABI,
    functionName: "streams",
    args: activeId !== null ? [activeId] : undefined,
    query: { enabled: activeId !== null, refetchInterval: 10000 },
  });

  const { data: withdrawableRaw } = useReadContract({
    address: CONTRACTS.arcFlow,
    abi: ABI,
    functionName: "withdrawable",
    args: activeId !== null ? [activeId] : undefined,
    query: { enabled: activeId !== null, refetchInterval: 5000 },
  });

  const { data: remainingTimeSec } = useReadContract({
    address: CONTRACTS.arcFlow,
    abi: ABI,
    functionName: "remainingTime",
    args: activeId !== null ? [activeId] : undefined,
    query: { enabled: activeId !== null, refetchInterval: 10000 },
  });

  // ── Active streams ──────────────────────────────────────────────────────
  const { address } = useAccount();

  const { data: streamCount, refetch: refetchStreamCount } = useReadContract({
    address: CONTRACTS.arcFlow,
    abi: ABI,
    functionName: "streamCount",
    query: { refetchInterval: 15000 },
  });

  const totalStreams = streamCount !== undefined ? Number(streamCount) : 0;

  const streamCalls = useMemo(() =>
    Array.from({ length: totalStreams }, (_, i) => ({
      address: CONTRACTS.arcFlow as `0x${string}`,
      abi: ABI,
      functionName: "streams" as const,
      args: [BigInt(i)] as [bigint],
    })),
  [totalStreams]);

  const withdrawableCalls = useMemo(() =>
    Array.from({ length: totalStreams }, (_, i) => ({
      address: CONTRACTS.arcFlow as `0x${string}`,
      abi: ABI,
      functionName: "withdrawable" as const,
      args: [BigInt(i)] as [bigint],
    })),
  [totalStreams]);

  const remainingTimeCalls = useMemo(() =>
    Array.from({ length: totalStreams }, (_, i) => ({
      address: CONTRACTS.arcFlow as `0x${string}`,
      abi: ABI,
      functionName: "remainingTime" as const,
      args: [BigInt(i)] as [bigint],
    })),
  [totalStreams]);

  const { data: allStreamsRaw } = useReadContracts({
    contracts: streamCalls,
    query: { enabled: totalStreams > 0, refetchInterval: 10000 },
  });

  const { data: allWithdrawableRaw } = useReadContracts({
    contracts: withdrawableCalls,
    query: { enabled: totalStreams > 0, refetchInterval: 8000 },
  });

  const { data: allRemainingTimeRaw } = useReadContracts({
    contracts: remainingTimeCalls,
    query: { enabled: totalStreams > 0, refetchInterval: 10000 },
  });

  const myStreams = useMemo(() => {
    if (!allStreamsRaw || !address) return [];
    return allStreamsRaw
      .map((res, i) => {
        if (res.status !== "success") return null;
        const s = res.result as readonly [string, string, bigint, bigint, bigint, bigint, boolean];
        if (s[0].toLowerCase() !== address.toLowerCase()) return null;
        const withdrawableVal = allWithdrawableRaw?.[i]?.status === "success"
          ? (allWithdrawableRaw[i].result as bigint)
          : 0n;
        return { id: i, payer: s[0], recipient: s[1], rate: s[2], startTime: s[3], deposit: s[4], withdrawn: s[5], active: s[6], withdrawable: withdrawableVal };
      })
      .filter(Boolean) as Array<{ id: number; payer: string; recipient: string; rate: bigint; startTime: bigint; deposit: bigint; withdrawn: bigint; active: boolean; withdrawable: bigint }>;
  }, [allStreamsRaw, allWithdrawableRaw, address]);

  const incomingStreams = useMemo(() => {
    if (!allStreamsRaw || !address) return [];
    return allStreamsRaw
      .map((res, i) => {
        if (res.status !== "success") return null;
        const s = res.result as readonly [string, string, bigint, bigint, bigint, bigint, boolean];
        if (!s[6]) return null;
        if (s[1].toLowerCase() !== address.toLowerCase()) return null;
        const withdrawableVal = allWithdrawableRaw?.[i]?.status === "success"
          ? (allWithdrawableRaw[i].result as bigint)
          : 0n;
        const remainingTimeSecs = allRemainingTimeRaw?.[i]?.status === "success"
          ? Number(allRemainingTimeRaw[i].result as bigint)
          : null;
        return { id: i, payer: s[0], recipient: s[1], rate: s[2], startTime: s[3], deposit: s[4], withdrawn: s[5], active: s[6], withdrawable: withdrawableVal, remainingTime: remainingTimeSecs };
      })
      .filter(Boolean) as Array<{ id: number; payer: string; recipient: string; rate: bigint; startTime: bigint; deposit: bigint; withdrawn: bigint; active: boolean; withdrawable: bigint; remainingTime: number | null }>;
  }, [allStreamsRaw, allWithdrawableRaw, allRemainingTimeRaw, address]);

  const activeMyStreams = myStreams.filter((s) => s.active);
  // visibleStreams: active streams + any stream in cancelledStreamIds (kept visible until timer expires)
  const visibleStreams = useMemo(() => {
    const cancelledVisible = myStreams.filter(s => cancelledStreamIds.has(s.id));
    const activeNotCancelled = activeMyStreams.filter(s => !cancelledStreamIds.has(s.id));
    return [...activeNotCancelled, ...cancelledVisible];
  }, [activeMyStreams, myStreams, cancelledStreamIds]);
  const totalMonthlyOut = activeMyStreams.reduce((acc, s) => acc + Number(formatNativeUsdc(s.rate)) * 2_592_000, 0);
  const totalDeposited = activeMyStreams.reduce((acc, s) => acc + Number(formatNativeUsdc(s.deposit)), 0);

  // ── End active streams ───────────────────────────────────────────────────

  // Extract stream ID from receipt logs after creation
  useEffect(() => {
    if (!receipt) return;
    let found = false;
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({ abi: ABI, eventName: "StreamCreated", data: log.data, topics: log.topics });
        setStreamId((decoded.args as { id: bigint }).id);
        found = true;
        break;
      } catch {
        continue;
      }
    }
    // Fallback: if StreamCreated event not decoded, refetch streamCount and use count-1
    if (!found) {
      refetchStreamCount().then(({ data }) => {
        if (data !== undefined && data > 0n) {
          setStreamId(data - 1n);
        }
      });
    }
  }, [receipt, refetchStreamCount]);

  // payer[0], recipient[1], rate[2], startTime[3], deposit[4], withdrawn[5], active[6]
  const streamArr = streamData as readonly [string, string, bigint, bigint, bigint, bigint, boolean] | undefined;

  // Client-side accrual between refetches — adds rate*tick for smooth display
  const withdrawableDisplay = useMemo(() => {
    if (withdrawableRaw === undefined || !streamArr) return null;
    const ratePerSec = streamArr[2];
    const extra = ratePerSec * BigInt(tick % 5);
    const total = withdrawableRaw + extra;
    return formatNativeUsdc(total);
  }, [withdrawableRaw, streamArr, tick]);

  function handleCreate() {
    if (!recipient || !monthly || !deposit) return;
    setStreamId(null);
    writeContract({
      address: CONTRACTS.arcFlow,
      abi: ABI,
      functionName: "createStream",
      args: [recipient as `0x${string}`, rate ?? 0n],
      value: parseNativeUsdc(deposit),
    });
  }

  const busy = isPending || isMining;

  const runwayDays = useMemo(() => {
    if (!deposit || !monthly || Number(monthly) <= 0) return null;
    return Math.floor((Number(deposit) / Number(monthly)) * 30);
  }, [deposit, monthly]);

  const streamMonthly = streamArr ? Number(formatNativeUsdc(streamArr[2])) * 2_592_000 : null;
  const streamRunwayDays = remainingTimeSec !== undefined
    ? Math.floor(Number(remainingTimeSec) / 86400)
    : null;

  return (
    <div className="min-h-screen overflow-hidden bg-[#120f1d] text-white">
      <div className="fixed inset-0 -z-20 bg-[linear-gradient(180deg,#120f1d_0%,#1d1530_42%,#0f1722_100%)]" />
      <div className="fixed inset-0 -z-10 opacity-90 bg-[radial-gradient(circle_at_12%_18%,rgba(255,179,138,0.18),transparent_24%),radial-gradient(circle_at_82%_14%,rgba(255,215,199,0.12),transparent_22%),radial-gradient(circle_at_68%_55%,rgba(255,140,80,0.10),transparent_28%),radial-gradient(circle_at_18%_78%,rgba(255,179,138,0.08),transparent_22%)]" />

      <main className="mx-auto max-w-7xl px-6 pb-24 pt-10 md:px-10 lg:px-12">
        <Reveal className="flex min-h-[72vh] items-center justify-center">
          <div className="max-w-4xl text-center">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-[11px] uppercase tracking-[0.28em] text-[#ffd7c7] backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5" /> Stream · continuous payments
            </div>
            <h1 className="mt-8 text-5xl font-semibold leading-[0.9] tracking-[-0.06em] text-white md:text-7xl lg:text-[86px]">
              Pay people
              <span className="block text-[#ffb38a]">continuously</span>
              <span className="block text-white/85">with native USDC.</span>
            </h1>
            <p className="mx-auto mt-8 max-w-2xl text-lg leading-8 text-white/68 md:text-[21px]">
              Stream salaries, retainers, or subscriptions in real time. Funds accrue every second and recipients
              withdraw whenever they want.
            </p>
          </div>
        </Reveal>

        <div className="grid gap-6">
          {/* Create stream card */}
          <Reveal>
            <GlassCard className="overflow-hidden">
              <div className="border-b border-white/10 p-7 md:p-8">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm uppercase tracking-[0.24em] text-white/50">New stream</p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Create a live payment flow</h2>
                  </div>
                  <div className="rounded-full border border-white/12 bg-white/10 px-3 py-1 text-xs text-white/70">FlowPay</div>
                </div>
              </div>

              <div className="p-7 md:p-8">
                <div className="grid gap-6 lg:grid-cols-[1fr_240px]">
                  <div className="space-y-5">
                    <div>
                      <Label>Recipient address</Label>
                      <Input placeholder="0x..." value={recipient} onChange={(e) => setRecipient(e.target.value)} />
                    </div>
                    <div>
                      <Label>Monthly amount (USDC)</Label>
                      <Input type="number" placeholder="1000" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
                      {rate !== undefined && (() => {
                        const actualMonthly = Number(rate) * 2_592_000 / 1_000_000;
                        const inputMonthly = Number(monthly);
                        const loss = inputMonthly > 0 ? Math.abs(inputMonthly - actualMonthly) / inputMonthly : 0;
                        return (
                          <>
                            <p className="mt-2 text-sm text-white/45">
                              On-chain: {actualMonthly.toFixed(4)} USDC/month ({rate.toString()} wei/sec)
                            </p>
                            {loss > 0.01 && (
                              <p className="mt-1 text-sm text-yellow-400/75">
                                Note: contract will stream {actualMonthly.toFixed(4)} USDC/month due to integer precision.
                              </p>
                            )}
                          </>
                        );
                      })()}
                    </div>
                    <div>
                      <Label>Initial deposit (USDC)</Label>
                      <Input type="number" placeholder="3000" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
                      {runwayDays !== null && <p className="mt-2 text-sm text-white/45">≈ {runwayDays} days of runway</p>}
                    </div>
                    <button
                      onClick={handleCreate}
                      disabled={!isConnected || busy || !recipient || !monthly || !deposit || !rate}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#fff4ec] px-6 py-4 text-sm font-semibold text-[#291c28] transition disabled:opacity-40"
                    >
                      {busy ? "Processing..." : (monthly && !rate) ? "Calculating rate…" : "Create stream"}
                      <ArrowUpRight className="h-4 w-4" />
                    </button>
                    {showCreateSuccess && (
                      <div className="rounded-2xl border border-[#ffb38a]/20 bg-[#ffb38a]/10 p-4 text-sm text-[#ffd7c7] space-y-2">
                        {streamId !== null ? (
                          <p>Stream created. Share ID <span className="font-bold text-white text-base">#{streamId.toString()}</span> with your recipient so they can track and withdraw their balance.</p>
                        ) : (
                          <p>Stream created. Share the stream ID with your recipient so they can track and withdraw their balance.</p>
                        )}
                        {hash && HAS_PUBLIC_ARC_EXPLORER && (
                          <a
                            href={arcTxUrl(hash)}
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

                  <div className="space-y-4">
                    <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5">
                      <div className="flex items-center gap-3">
                        <Wallet className="h-4 w-4 text-[#ffd7c7]" />
                        <p className="text-xs uppercase tracking-[0.22em] text-white/45">Preview</p>
                      </div>
                      <div className="mt-5 text-3xl font-semibold tracking-[-0.05em] text-white">{monthly || "0"} USDC</div>
                      <div className="mt-2 text-sm text-white/50">monthly flow amount</div>
                    </div>
                    <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5">
                      <div className="flex items-center gap-3">
                        <Activity className="h-4 w-4 text-[#ffb38a]" />
                        <p className="text-xs uppercase tracking-[0.22em] text-white/45">Runway</p>
                      </div>
                      <div className="mt-5 text-3xl font-semibold tracking-[-0.05em] text-white">{runwayDays ?? "—"}</div>
                      <div className="mt-2 text-sm text-white/50">estimated days funded</div>
                    </div>
                  </div>
                </div>
              </div>
            </GlassCard>
          </Reveal>

          {/* Stream lookup */}
          <Reveal>
            <GlassCard className="overflow-hidden">
              <div className="border-b border-white/10 p-7 md:p-8">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl border border-white/12 bg-black/20 p-3">
                      <Radio className="h-5 w-5 text-[#ffb38a]" />
                    </div>
                    <div>
                      <p className="text-sm uppercase tracking-[0.24em] text-white/50">Stream lookup</p>
                      <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em]">Check any stream by ID</h2>
                    </div>
                  </div>
                  {streamArr?.[6] && (
                    <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Live
                    </div>
                  )}
                </div>
              </div>

              <div className="p-7 md:p-8">
                <div className="mb-6 flex gap-3 max-w-sm">
                  <Input
                    type="number"
                    placeholder="Stream ID (e.g. 1)"
                    value={lookupId}
                    onChange={(e) => setLookupId(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && lookupId) {
                        setStreamId(null);
                        setConfirmedLookupId(lookupId);
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      if (!lookupId) return;
                      setStreamId(null);
                      setConfirmedLookupId(lookupId);
                    }}
                    className="rounded-2xl border border-white/12 bg-white/8 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/12 whitespace-nowrap"
                  >
                    Check
                  </button>
                </div>

                {!activeId && (
                  <p className="text-sm text-white/40">Enter a stream ID to inspect its status. If you are the recipient, you can withdraw the accrued balance here.</p>
                )}

                {activeId !== null && !streamArr && (
                  <p className="text-sm text-white/40">Loading stream data...</p>
                )}

                {streamArr && streamArr[6] && (
                  <div className="mb-4 flex items-center gap-4 flex-wrap">
                    <button
                      onClick={() => {
                        if (activeId === null) return;
                        writeWithdraw({
                          address: CONTRACTS.arcFlow,
                          abi: ABI,
                          functionName: "withdraw",
                          args: [activeId],
                        });
                      }}
                      disabled={!isConnected || isWithdrawPending || isWithdrawMining || withdrawableRaw === 0n}
                      className="inline-flex items-center gap-2 rounded-full bg-[#fff4ec] px-5 py-3 text-sm font-semibold text-[#291c28] transition disabled:opacity-40"
                    >
                      {isWithdrawPending || isWithdrawMining ? "Withdrawing..." : "Withdraw now"}
                      <ArrowUpRight className="h-4 w-4" />
                    </button>
                    {showWithdrawSuccess && withdrawHash && HAS_PUBLIC_ARC_EXPLORER && (
                      <a
                        href={arcTxUrl(withdrawHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-[#ffb38a] underline underline-offset-2"
                      >
                        Withdrawn. View transaction
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                )}

                {streamArr && (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {/* Withdrawable now — most critical */}
                    <div className="sm:col-span-2 lg:col-span-1 rounded-[1.6rem] border border-[#ffb38a]/20 bg-[#ffb38a]/8 p-6">
                      <p className="text-xs uppercase tracking-[0.22em] text-white/45">Withdrawable now</p>
                      <div className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-white tabular-nums">
                        {withdrawableDisplay !== null ? Number(withdrawableDisplay).toFixed(6) : "—"}
                      </div>
                      <div className="mt-1 text-sm text-white/50">USDC · updates every second</div>
                    </div>

                    <div className="rounded-[1.6rem] border border-white/10 bg-black/20 p-6">
                      <p className="text-xs uppercase tracking-[0.22em] text-white/45">Monthly amount</p>
                      <div className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-white">
                        {streamMonthly !== null ? streamMonthly.toFixed(2) : "—"} USDC
                      </div>
                      <div className="mt-1 text-sm text-white/50">per month</div>
                    </div>

                    <div className="rounded-[1.6rem] border border-white/10 bg-black/20 p-6">
                      <p className="text-xs uppercase tracking-[0.22em] text-white/45">Runway</p>
                      <div className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-white">
                        {streamRunwayDays !== null ? `${streamRunwayDays} days` : "—"}
                      </div>
                      <div className="mt-1 text-sm text-white/50">remaining</div>
                    </div>

                    <div className="rounded-[1.6rem] border border-white/10 bg-black/20 p-6">
                      <p className="text-xs uppercase tracking-[0.22em] text-white/45">Recipient</p>
                      <div className="mt-4 text-lg font-semibold tracking-[-0.02em] text-white font-mono">
                        {shortAddr(streamArr[1]as string)}
                      </div>
                      <div className="mt-1 text-sm text-white/50">receiving address</div>
                    </div>

                    <div className="rounded-[1.6rem] border border-white/10 bg-black/20 p-6">
                      <p className="text-xs uppercase tracking-[0.22em] text-white/45">Started</p>
                      <div className="mt-4 text-lg font-semibold tracking-[-0.02em] text-white">
                        {timeAgo(streamArr[3] as bigint)}
                      </div>
                      <div className="mt-1 text-sm text-white/50">stream age</div>
                    </div>
                  </div>
                )}
              </div>
            </GlassCard>
          </Reveal>

          {/* Ongoing incoming streams */}
          {isConnected && incomingStreams.length > 0 && (
            <Reveal>
              <GlassCard className="overflow-hidden">
                <div className="border-b border-white/10 p-7 md:p-8">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm uppercase tracking-[0.24em] text-white/50">Incoming</p>
                      <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em]">Ongoing streams</h2>
                    </div>
                    <div className="rounded-[1.2rem] border border-white/10 bg-black/20 px-5 py-3 text-center">
                      <div className="text-xl font-semibold text-white">{incomingStreams.length}</div>
                      <div className="mt-0.5 text-xs text-white/45 uppercase tracking-[0.18em]">Active</div>
                    </div>
                  </div>
                </div>

                <div className="p-7 md:p-8">
                  <div className="mb-3 hidden grid-cols-[2fr_1.5fr_1.5fr_1.5fr_120px] gap-4 px-4 text-xs uppercase tracking-[0.2em] text-white/35 md:grid">
                    <span>From</span>
                    <span>Withdrawable</span>
                    <span>Monthly</span>
                    <span>Runway</span>
                    <span></span>
                  </div>

                  <div className="space-y-3">
                    {incomingStreams.map((s) => {
                      const isThisWithdrawing = withdrawingIncomingId === s.id && (isIncomingWithdrawPending || isIncomingWithdrawMining);
                      const liveWithdrawable = (() => {
                        const extra = s.rate * BigInt(tick % 5);
                        return s.withdrawable + extra;
                      })();
                      const runwayDaysIncoming = s.remainingTime !== null ? Math.floor(s.remainingTime / 86400) : null;
                      const monthlyIncoming = Number(formatNativeUsdc(s.rate)) * 2_592_000;
                      return (
                        <div key={s.id} className="space-y-2">
                          <div className="grid grid-cols-1 gap-3 rounded-2xl border border-white/8 bg-black/15 p-4 md:grid-cols-[2fr_1.5fr_1.5fr_1.5fr_120px] md:items-center md:gap-4">
                            <div>
                              <p className="text-xs text-white/40 md:hidden uppercase tracking-[0.18em] mb-1">From</p>
                              <span className="font-mono text-sm text-white">{shortAddr(s.payer)}</span>
                              <span className="ml-2 text-xs text-white/35">#{s.id}</span>
                            </div>
                            <div>
                              <p className="text-xs text-white/40 md:hidden uppercase tracking-[0.18em] mb-1">Withdrawable</p>
                              <span className="text-sm font-medium text-[#ffb38a] tabular-nums">
                                {Number(formatNativeUsdc(liveWithdrawable)).toFixed(6)} USDC
                              </span>
                            </div>
                            <div>
                              <p className="text-xs text-white/40 md:hidden uppercase tracking-[0.18em] mb-1">Monthly</p>
                              <span className="text-sm text-white">{monthlyIncoming.toFixed(2)} USDC</span>
                            </div>
                            <div>
                              <p className="text-xs text-white/40 md:hidden uppercase tracking-[0.18em] mb-1">Runway</p>
                              <span className="text-sm text-white">{runwayDaysIncoming !== null ? `${runwayDaysIncoming} days` : "—"}</span>
                            </div>
                            <div>
                              <button
                                onClick={() => {
                                  setWithdrawingIncomingId(s.id);
                                  writeIncomingWithdraw({
                                    address: CONTRACTS.arcFlow,
                                    abi: ABI,
                                    functionName: "withdraw",
                                    args: [BigInt(s.id)],
                                  });
                                }}
                                disabled={!isConnected || isThisWithdrawing || s.withdrawable === 0n}
                                className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#fff4ec] px-4 py-2 text-xs font-semibold text-[#291c28] transition disabled:opacity-40"
                              >
                                {isThisWithdrawing ? "Withdrawing…" : "Withdraw"}
                                <ArrowUpRight className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          {showIncomingWithdrawSuccess && withdrawingIncomingId === s.id && incomingWithdrawHash && HAS_PUBLIC_ARC_EXPLORER && (
                            <div className="rounded-2xl border border-[#ffb38a]/20 bg-[#ffb38a]/10 px-4 py-3 text-sm text-[#ffd7c7] flex items-center gap-3">
                              <span>Withdrawn successfully.</span>
                              <a
                                href={arcTxUrl(incomingWithdrawHash)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 font-medium text-[#ffb38a] underline underline-offset-2"
                              >
                                View tx <ArrowUpRight className="h-3 w-3" />
                              </a>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </GlassCard>
            </Reveal>
          )}

          {/* Active streams */}
          {isConnected && visibleStreams.length > 0 && (
            <Reveal>
              <GlassCard className="overflow-hidden">
                <div className="border-b border-white/10 p-7 md:p-8">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm uppercase tracking-[0.24em] text-white/50">Your streams</p>
                      <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em]">Active streams</h2>
                    </div>
                    <div className="flex flex-wrap gap-4">
                      <div className="rounded-[1.2rem] border border-white/10 bg-black/20 px-5 py-3 text-center">
                        <div className="text-xl font-semibold text-white">{activeMyStreams.length}</div>
                        <div className="mt-0.5 text-xs text-white/45 uppercase tracking-[0.18em]">Active</div>
                      </div>
                      <div className="rounded-[1.2rem] border border-white/10 bg-black/20 px-5 py-3 text-center">
                        <div className="text-xl font-semibold text-white">{totalMonthlyOut.toFixed(2)} USDC</div>
                        <div className="mt-0.5 text-xs text-white/45 uppercase tracking-[0.18em]">Monthly outflow</div>
                      </div>
                      <div className="rounded-[1.2rem] border border-white/10 bg-black/20 px-5 py-3 text-center">
                        <div className="text-xl font-semibold text-white">{totalDeposited.toFixed(2)} USDC</div>
                        <div className="mt-0.5 text-xs text-white/45 uppercase tracking-[0.18em]">Total deposited</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-7 md:p-8">
                  {/* Header row */}
                  <div className="mb-3 hidden grid-cols-[2fr_1.5fr_1.5fr_80px_100px] gap-4 px-4 text-xs uppercase tracking-[0.2em] text-white/35 md:grid">
                    <span>Recipient</span>
                    <span>Monthly</span>
                    <span>Withdrawable</span>
                    <span>Status</span>
                    <span></span>
                  </div>

                  <div className="space-y-3">
                    {visibleStreams.map((s) => {
                      const isCancelling = cancellingId === s.id && (isCancelPending || isCancelMining);
                      const isCancelled = cancelledStreamIds.has(s.id);
                      const showCancelFeedback = cancelSuccessIds.has(s.id);
                      return (
                        <div key={s.id} className="space-y-2">
                          <div
                            className="grid grid-cols-1 gap-3 rounded-2xl border border-white/8 bg-black/15 p-4 md:grid-cols-[2fr_1.5fr_1.5fr_80px_100px] md:items-center md:gap-4"
                          >
                            <div>
                              <p className="text-xs text-white/40 md:hidden uppercase tracking-[0.18em] mb-1">Recipient</p>
                              <span className="font-mono text-sm text-white">{shortAddr(s.recipient)}</span>
                            </div>
                            <div>
                              <p className="text-xs text-white/40 md:hidden uppercase tracking-[0.18em] mb-1">Monthly</p>
                              <span className="text-sm text-white">
                                {(Number(formatNativeUsdc(s.rate)) * 2_592_000).toFixed(2)} USDC
                              </span>
                            </div>
                            <div>
                              <p className="text-xs text-white/40 md:hidden uppercase tracking-[0.18em] mb-1">Withdrawable</p>
                              <span className="text-sm font-medium text-[#ffb38a]">
                                {Number(formatNativeUsdc(s.withdrawable)).toFixed(4)} USDC
                              </span>
                            </div>
                            <div>
                              {isCancelled ? (
                                <div className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-3 py-1 text-xs text-white/45">
                                  Cancelled
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                  Live
                                </div>
                              )}
                            </div>
                            <div>
                              {!isCancelled && (
                                <button
                                  onClick={() => {
                                    setCancellingId(s.id);
                                    setCancelledStreamIds(prev => new Set(prev).add(s.id));
                                    writeCancel({
                                      address: CONTRACTS.arcFlow,
                                      abi: ABI,
                                      functionName: "cancelStream",
                                      args: [BigInt(s.id)],
                                    });
                                  }}
                                  disabled={isCancelling}
                                  className="inline-flex items-center justify-center rounded-full border border-red-400/20 bg-red-400/8 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-400/15 disabled:opacity-40"
                                >
                                  {isCancelling ? "Cancelling…" : "Cancel"}
                                </button>
                              )}
                            </div>
                          </div>
                          {showCancelFeedback && (
                            <div className="rounded-2xl border border-[#ffb38a]/20 bg-[#ffb38a]/10 px-4 py-3 text-sm text-[#ffd7c7]">
                              Stream #{s.id} cancelled. Unspent deposit returned to your wallet.
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </GlassCard>
            </Reveal>
          )}
        </div>
      </main>
    </div>
  );
}
