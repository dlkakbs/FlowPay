"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { useAutoHide } from "@/lib/useAutoHide";
import { decodeEventLog } from "viem";
import { CONTRACTS } from "@/lib/wagmi";
import { formatNativeUsdc, parseNativeUsdc } from "@/lib/nativeUsdc";
import { arcTxUrl, HAS_PUBLIC_ARC_EXPLORER } from "@/lib/arcNetwork";
import { ArrowUpRight, Sparkles } from "lucide-react";

const ABI = [
  {
    name: "createInvoice",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "description", type: "string" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    name: "payInvoice",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    name: "invoices",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      { name: "creator", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "description", type: "string" },
      { name: "deadline", type: "uint256" },
      { name: "status", type: "uint8" },
    ],
  },
  {
    name: "InvoiceCreated",
    type: "event",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "description", type: "string", indexed: false },
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

export default function InvoicePage() {
  const { isConnected, address } = useAccount();

  // Separate hooks for create and pay
  const { writeContract: writeCreate, data: createHash, isPending: isCreatePending } = useWriteContract();
  const { writeContract: writePay, data: payHash, isPending: isPayPending } = useWriteContract();

  const { isLoading: isCreateMining, isSuccess: isCreateSuccess, data: createReceipt } =
    useWaitForTransactionReceipt({ hash: createHash });
  const { isLoading: isPayMining, isSuccess: isPaySuccess } =
    useWaitForTransactionReceipt({ hash: payHash });

  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [deadline, setDeadline] = useState("");
  const [payId, setPayId] = useState("");
  const [payAmount, setPayAmount] = useState("");

  const { data: invoiceData } = useReadContract({
    address: CONTRACTS.arcInvoice,
    abi: ABI,
    functionName: "invoices",
    args: payId ? [BigInt(payId)] : undefined,
    query: { enabled: !!payId, refetchInterval: 5000 },
  });

  const invoiceDetails = useMemo(() => {
    if (!invoiceData) return null;
    const [creator, amountRaw, description, deadlineRaw, statusRaw] =
      invoiceData as readonly [string, bigint, string, bigint, number];

    const exists = creator !== "0x0000000000000000000000000000000000000000" && amountRaw > 0n;
    const deadline = Number(deadlineRaw);
    const isExpired = deadline !== 0 && Date.now() / 1000 > deadline;

    return {
      creator,
      amountRaw,
      amountFormatted: formatNativeUsdc(amountRaw),
      description,
      deadline,
      status: Number(statusRaw),
      exists,
      isExpired,
    };
  }, [invoiceData]);

  useEffect(() => {
    if (invoiceDetails?.exists) {
      setPayAmount(invoiceDetails.amountFormatted);
    }
  }, [invoiceDetails?.exists, invoiceDetails?.amountFormatted]);

  const invoiceCreator = invoiceDetails?.creator ?? null;
  const isSelfPay = !!(address && invoiceCreator && address.toLowerCase() === invoiceCreator.toLowerCase());
  const isInvoiceInvalid = !!payId && invoiceDetails !== null && !invoiceDetails.exists;
  const isInvoicePaid = invoiceDetails?.status === 1;
  const isInvoiceCanceled = invoiceDetails?.status === 2;
  const isInvoiceExpired = !!invoiceDetails?.isExpired;
  const canPayInvoice =
    !!payId &&
    !!payAmount &&
    !isSelfPay &&
    !isInvoiceInvalid &&
    !isInvoicePaid &&
    !isInvoiceCanceled &&
    !isInvoiceExpired;

  const createBusy = isCreatePending || isCreateMining;
  const payBusy = isPayPending || isPayMining;

  const showCreateSuccess = useAutoHide(isCreateSuccess, 12000);
  const showPaySuccess = useAutoHide(isPaySuccess);

  // Extract invoice ID from receipt logs
  const invoiceId = (() => {
    if (!createReceipt) return null;
    for (const log of createReceipt.logs) {
      try {
        const decoded = decodeEventLog({ abi: ABI, eventName: "InvoiceCreated", data: log.data, topics: log.topics });
        return (decoded.args as { id: bigint }).id.toString();
      } catch {
        continue;
      }
    }
    return null;
  })();

  function handleCreate() {
    if (!amount || !desc) return;
    const deadlineTs = deadline ? Math.floor(new Date(deadline).getTime() / 1000) : 0;
    writeCreate({
      address: CONTRACTS.arcInvoice,
      abi: ABI,
      functionName: "createInvoice",
      args: [parseNativeUsdc(amount), desc, BigInt(deadlineTs)],
    });
  }

  function handlePay() {
    if (!payId || !payAmount) return;
    writePay({
      address: CONTRACTS.arcInvoice,
      abi: ABI,
      functionName: "payInvoice",
      args: [BigInt(payId)],
      value: parseNativeUsdc(payAmount),
    });
  }

  return (
    <div className="min-h-screen overflow-hidden bg-[#120f1d] text-white">
      <div className="fixed inset-0 -z-20 bg-[linear-gradient(180deg,#120f1d_0%,#1d1530_42%,#0f1722_100%)]" />
      <div className="fixed inset-0 -z-10 opacity-90 bg-[radial-gradient(circle_at_14%_18%,rgba(255,207,184,0.18),transparent_24%),radial-gradient(circle_at_82%_14%,rgba(255,179,138,0.12),transparent_22%),radial-gradient(circle_at_68%_55%,rgba(255,140,80,0.10),transparent_28%),radial-gradient(circle_at_18%_78%,rgba(255,215,199,0.08),transparent_22%)]" />

      <main className="mx-auto max-w-7xl px-6 pb-24 pt-10 md:px-10 lg:px-12">
        <Reveal className="flex min-h-[72vh] items-center justify-center">
          <div className="max-w-4xl text-center">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-[11px] uppercase tracking-[0.28em] text-[#ffd7c7] backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5" /> Invoice · exact payment requests
            </div>

            <h1 className="mt-8 text-5xl font-semibold leading-[0.9] tracking-[-0.06em] text-white md:text-7xl lg:text-[86px]">
              Request payment
              <span className="block text-[#ffb38a]">cleanly</span>
              <span className="block text-white/85">and get paid on-chain.</span>
            </h1>

            <p className="mx-auto mt-8 max-w-2xl text-lg leading-8 text-white/68 md:text-[21px]">
              Create a precise USDC invoice, share the ID, and let the other party settle it directly on Arc.
            </p>
          </div>
        </Reveal>

        <div className="grid gap-6">
          <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
            <Reveal className="h-full">
              <GlassCard className="h-full overflow-hidden flex flex-col">
                <div className="border-b border-white/10 p-7 md:p-8">
                  <p className="text-sm uppercase tracking-[0.24em] text-white/50">Create invoice</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Set amount, description, deadline</h2>
                </div>

                <div className="space-y-5 p-7 md:p-8">
                  <div>
                    <Label>Amount (USDC)</Label>
                    <Input type="number" placeholder="500" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  </div>

                  <div>
                    <Label>Description</Label>
                    <Input
                      placeholder="Logo design, monthly consulting..."
                      value={desc}
                      onChange={(e) => setDesc(e.target.value)}
                    />
                  </div>

                  <div>
                    <Label>Deadline (optional)</Label>
                    <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
                  </div>

                  <button
                    onClick={handleCreate}
                    disabled={!isConnected || createBusy || !amount || !desc}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#fff4ec] px-6 py-4 text-sm font-semibold text-[#291c28] transition disabled:opacity-40"
                  >
                    {createBusy ? "Processing..." : "Create invoice"}
                    <ArrowUpRight className="h-4 w-4" />
                  </button>

                  <p className="text-xs text-white/35">
                    Creating an invoice does not escrow funds. It only publishes a payable request on-chain.
                  </p>

                  {showCreateSuccess && createHash && (
                    <div className="rounded-2xl border border-[#ffb38a]/20 bg-[#ffb38a]/10 p-4 text-sm text-[#ffd7c7] space-y-2">
                      {invoiceId !== null ? (
                        <p>Invoice created. Your ID is <span className="font-bold text-white text-base">#{invoiceId}</span> — share it with your client to get paid.</p>
                      ) : HAS_PUBLIC_ARC_EXPLORER ? (
                        <p>Invoice created. Open the explorer to find your invoice ID.</p>
                      ) : (
                        <p>Invoice created and confirmed on Arc.</p>
                      )}
                      {HAS_PUBLIC_ARC_EXPLORER && (
                        <a
                          href={arcTxUrl(createHash)}
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

            <Reveal className="h-full">
              <GlassCard className="h-full overflow-hidden flex flex-col">
                <div className="border-b border-white/10 p-7 md:p-8">
                  <p className="text-sm uppercase tracking-[0.24em] text-white/50">Pay invoice</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Use the invoice ID to settle</h2>
                </div>

                <div className="space-y-5 p-7 md:p-8">
                  {!payId && (
                    <p className="text-sm text-white/40 leading-6">
                      If someone sent you an invoice, enter the invoice ID here to view and pay it. The creator receives the invoice ID right after creating it — ask them to share it with you.
                    </p>
                  )}
                  <div>
                    <Label>Invoice ID</Label>
                    <Input type="number" placeholder="0" value={payId} onChange={(e) => setPayId(e.target.value)} />
                  </div>

                  <div>
                    <Label>Amount (USDC)</Label>
                    <Input
                      type="number"
                      placeholder="500"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      readOnly={!!invoiceDetails?.exists}
                    />
                    {invoiceDetails?.exists && (
                      <p className="mt-2 text-sm text-white/45">Auto-filled from invoice #{payId}.</p>
                    )}
                  </div>

                  {invoiceDetails?.exists && (
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70 space-y-1.5">
                      <p><span className="text-white/40">Creator:</span> {invoiceDetails.creator}</p>
                      <p><span className="text-white/40">Description:</span> {invoiceDetails.description || "—"}</p>
                      <p><span className="text-white/40">Status:</span> {isInvoicePaid ? "Paid" : isInvoiceCanceled ? "Canceled" : "Pending"}</p>
                      <p><span className="text-white/40">Deadline:</span> {invoiceDetails.deadline === 0 ? "No deadline" : new Date(invoiceDetails.deadline * 1000).toLocaleString()}</p>
                    </div>
                  )}

                  {isInvoiceInvalid && (
                    <p className="rounded-2xl border border-red-400/20 bg-red-400/8 px-4 py-3 text-sm text-red-300">
                      No invoice found for this ID.
                    </p>
                  )}

                  {isSelfPay && (
                    <p className="rounded-2xl border border-yellow-400/20 bg-yellow-400/8 px-4 py-3 text-sm text-yellow-300">
                      This invoice was created by your wallet. You cannot pay your own invoice.
                    </p>
                  )}

                  {isInvoicePaid && (
                    <p className="rounded-2xl border border-yellow-400/20 bg-yellow-400/8 px-4 py-3 text-sm text-yellow-300">
                      This invoice has already been paid.
                    </p>
                  )}

                  {isInvoiceCanceled && (
                    <p className="rounded-2xl border border-yellow-400/20 bg-yellow-400/8 px-4 py-3 text-sm text-yellow-300">
                      This invoice was canceled and can no longer be paid.
                    </p>
                  )}

                  {isInvoiceExpired && (
                    <p className="rounded-2xl border border-yellow-400/20 bg-yellow-400/8 px-4 py-3 text-sm text-yellow-300">
                      This invoice has expired and can no longer be paid.
                    </p>
                  )}

                  <button
                    onClick={handlePay}
                    disabled={!isConnected || payBusy || !canPayInvoice}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/14 bg-white/8 px-6 py-4 text-sm font-semibold text-white transition disabled:opacity-40"
                  >
                    {payBusy ? "Processing..." : "Pay invoice"}
                    <ArrowUpRight className="h-4 w-4" />
                  </button>

                  {showPaySuccess && payHash && (
                    <div className="rounded-2xl border border-[#ffb38a]/20 bg-[#ffb38a]/10 p-4 text-sm text-[#ffd7c7] space-y-2">
                      <p>Payment confirmed. Funds have been sent to the invoice creator.</p>
                      {HAS_PUBLIC_ARC_EXPLORER && (
                        <a
                          href={arcTxUrl(payHash)}
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
          </div>
        </div>
      </main>
    </div>
  );
}
