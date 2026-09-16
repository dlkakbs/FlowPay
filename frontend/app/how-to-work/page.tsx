import Link from "next/link";
import { Sparkles, Waves, Receipt, LockKeyhole, ArrowUpRight, Code2, Send, Download } from "lucide-react";

const MODULES = [
  {
    href: "/stream",
    title: "Stream",
    subtitle: "Send USDC every second",
    what: "Start a continuous payment flow to any address. Balance accrues every second automatically, and the recipient can withdraw whenever they want.",
    useCases: [
      "Salary payments that feel continuous instead of monthly",
      "Freelancer retainers during a project",
      "Subscription-style service payments",
    ],
    icon: Waves,
    accent: "text-[#ffb38a]",
    glow: "from-[#ffb38a]/25 via-white/5 to-transparent",
    roles: [
      {
        icon: Send,
        label: "Sender (payer)",
        steps: [
          "Enter recipient wallet address and monthly USDC amount",
          "Set an initial deposit to define how long the stream runs",
          "Create the stream — funds begin accruing per second immediately",
          "Cancel anytime via the active streams panel; unspent deposit is returned to your wallet",
        ],
      },
      {
        icon: Download,
        label: "Recipient",
        steps: [
          "Receive the stream ID from the sender",
          "Enter the ID in the Stream lookup to see your live balance",
          "Watch USDC accrue in real time every second",
          "Withdraw your earned balance whenever you want — no waiting",
        ],
      },
    ],
  },
  {
    href: "/invoice",
    title: "Invoice",
    subtitle: "Create and settle USDC invoices",
    what: "Create an invoice for a product or service and share the ID. The other party pays on-chain and funds arrive directly to your wallet.",
    useCases: [
      "Freelance design, development, or consulting work",
      "Supplier or vendor payment requests",
      "Deadline-based project payments",
    ],
    icon: Receipt,
    accent: "text-[#ffd7c7]",
    glow: "from-[#ffd7c7]/30 via-white/5 to-transparent",
    roles: [
      {
        icon: Receipt,
        label: "Invoice creator",
        steps: [
          "Set the USDC amount, description, and optional deadline",
          "Create the invoice — a unique numeric ID is generated on-chain",
          "Share the invoice ID with your client",
          "Funds arrive directly in your wallet once the client pays",
        ],
      },
      {
        icon: Download,
        label: "Payer (client)",
        steps: [
          "Receive the invoice ID from the creator",
          "Enter the ID and the amount in the Pay invoice form",
          "Confirm the transaction — payment settles on-chain instantly",
          "Both parties can verify the transaction on Arc Explorer",
        ],
      },
    ],
  },
  {
    href: "/paywall",
    title: "Paywall",
    subtitle: "An onchain marketplace for pay-per-request APIs and AI-powered services",
    what: "FlowPay's Paywall connects two sides: clients who pay per request and service providers who earn per call. Service ownership and pricing live onchain, while payments settle in batches with provider earnings claimable from the contract.",
    useCases: [
      "AI-powered APIs monetized per call",
      "Data feeds billed by actual usage",
      "Any service that shouldn't need a subscription",
    ],
    icon: LockKeyhole,
    accent: "text-[#ffb38a]",
    glow: "from-[#ffb38a]/20 via-white/5 to-transparent",
    roles: [
      {
        icon: Code2,
        label: "Service providers",
        steps: [
          "Register your API or AI-powered service endpoint",
          "Your backend URL stays private — clients get a proxy URL",
          "Public metadata appears in the marketplace automatically",
          "Earn USDC per request, then claim settled revenue onchain",
        ],
      },
      {
        icon: LockKeyhole,
        label: "Clients",
        steps: [
          "Browse available services in the marketplace",
          "Deposit USDC credits once",
          "Sign each request off-chain — zero gas",
          "Credits deduct per call; withdraw unused balance anytime",
        ],
      },
    ],
  },
] as const;

const REQUIREMENTS = [
  { label: "Wallet", value: "EVM-compatible" },
  { label: "Network", value: "Arc" },
  { label: "Token", value: "Native USDC" },
];

export default function HowToWorkPage() {
  return (
    <div className="min-h-screen overflow-hidden bg-[#120f1d] text-white">
      <div className="fixed inset-0 -z-20 bg-[linear-gradient(180deg,#120f1d_0%,#1d1530_42%,#0f1722_100%)]" />
      <div className="fixed inset-0 -z-10 opacity-90 bg-[radial-gradient(circle_at_12%_18%,rgba(255,179,138,0.18),transparent_24%),radial-gradient(circle_at_82%_14%,rgba(255,215,199,0.12),transparent_22%),radial-gradient(circle_at_68%_55%,rgba(255,140,80,0.10),transparent_28%),radial-gradient(circle_at_18%_78%,rgba(255,179,138,0.08),transparent_22%)]" />

      <main className="mx-auto max-w-7xl px-6 pb-24 pt-10 md:px-10 lg:px-12">
        <section className="flex min-h-[72vh] items-center justify-center">
          <div className="max-w-4xl text-center">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-[11px] uppercase tracking-[0.28em] text-[#ffd7c7] backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5" /> Get started · FlowPay
            </div>

            <h1 className="mt-8 text-5xl font-semibold leading-[0.9] tracking-[-0.06em] text-white md:text-7xl lg:text-[86px]">
              How FlowPay
              <span className="block text-[#ffb38a]">works</span>
              <span className="block text-white/85">across every payment flow.</span>
            </h1>

            <p className="mx-auto mt-8 max-w-2xl text-lg leading-8 text-white/68 md:text-[21px]">
              FlowPay brings stream, invoice, and paywall logic into one on-chain payment system built around native USDC. Built on Arc.
            </p>
          </div>
        </section>

        <section className="mb-8">
          <div className="rounded-[2rem] border border-white/12 bg-white/8 p-7 backdrop-blur-xl md:p-8">
            <p className="text-sm uppercase tracking-[0.24em] text-white/50">What you need</p>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {REQUIREMENTS.map((item) => (
                <div key={item.label} className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5">
                  <div className="text-xs uppercase tracking-[0.22em] text-white/45">{item.label}</div>
                  <div className="mt-3 text-base leading-7 text-white/75">{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-6">
          {MODULES.map((m) => {
            const Icon = m.icon;
            return (
              <div
                key={m.title}
                className="relative overflow-hidden rounded-[2rem] border border-white/12 bg-white/8 p-7 backdrop-blur-xl md:p-8"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${m.glow} opacity-80`} />
                <div className="relative">
                  <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                    <div className="max-w-2xl">
                      <div className="rounded-2xl border border-white/12 bg-black/20 p-3 w-fit">
                        <Icon className={`h-5 w-5 ${m.accent}`} />
                      </div>

                      <h2 className="mt-6 text-3xl font-semibold tracking-[-0.04em] text-white md:text-4xl">
                        {m.title}
                      </h2>
                      <p className="mt-2 text-lg text-white/60">{m.subtitle}</p>
                      <p className="mt-5 max-w-2xl text-base leading-8 text-white/72">{m.what}</p>
                    </div>

                  </div>

                  <div className="mt-8">
                    <p className="text-sm uppercase tracking-[0.22em] text-white/45">Use cases</p>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      {m.useCases.map((u) => (
                        <div key={u} className="rounded-2xl border border-white/8 bg-black/15 p-4 text-sm leading-7 text-white/72">
                          {u}
                        </div>
                      ))}
                    </div>
                  </div>

                  {"roles" in m && m.roles && (
                    <div className="mt-6 grid gap-4 md:grid-cols-2">
                      {m.roles.map((role) => {
                        const RoleIcon = role.icon;
                        return (
                          <div key={role.label} className="rounded-[1.6rem] border border-white/10 bg-black/20 p-6">
                            <div className="flex items-center gap-3 mb-5">
                              <div className="rounded-xl border border-white/12 bg-white/8 p-2">
                                <RoleIcon className="h-4 w-4 text-[#ffb38a]" />
                              </div>
                              <p className="text-sm font-semibold tracking-[-0.01em] text-white">{role.label}</p>
                            </div>
                            <ol className="space-y-3">
                              {role.steps.map((step, i) => (
                                <li key={step} className="flex items-start gap-3 text-sm leading-6 text-white/60">
                                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/8 text-[10px] font-semibold text-white/50">{i + 1}</span>
                                  {step}
                                </li>
                              ))}
                            </ol>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </section>

        <section className="mt-8">
          <div className="flex flex-col gap-6 rounded-[2rem] border border-white/12 bg-white/8 p-7 backdrop-blur-xl md:flex-row md:items-center md:justify-between md:p-8">
            <div>
              <h3 className="text-2xl font-semibold tracking-[-0.03em]">Ready to try it?</h3>
              <p className="mt-2 text-base text-white/65">Start with stream, invoice, or paywall and test the flow on Arc.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/stream" className="inline-flex items-center gap-1.5 rounded-full border border-white/14 bg-white/8 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/12 transition">
                Stream <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
              <Link href="/invoice" className="inline-flex items-center gap-1.5 rounded-full border border-white/14 bg-white/8 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/12 transition">
                Invoice <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
              <Link href="/paywall" className="inline-flex items-center gap-1.5 rounded-full border border-white/14 bg-white/8 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/12 transition">
                Paywall <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
