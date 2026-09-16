"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  ChevronRight,
  LockKeyhole,
  Orbit,
  Sparkles,
  Stars,
  Receipt,
  Wallet,
  Waves,
} from "lucide-react";
import { ARC_MAINNET_EXPLORER_URL } from "@/lib/arcNetwork";

const FEATURES = [
  {
    href: "/stream",
    title: "Stream",
    desc: "Money that moves every second. Send USDC as a live flow — recipients can withdraw anytime as it accrues in real time.",
    tag: "Continuous flow",
    icon: Waves,
    gradient: "from-[#8bf3ff]/30 via-white/8 to-transparent",
  },
  {
    href: "/invoice",
    title: "Invoice",
    desc: "One request. One settlement. Create a fixed payment and settle it instantly onchain with full clarity.",
    tag: "Exact payment",
    icon: Receipt,
    gradient: "from-[#ffcfb8]/45 via-white/10 to-transparent",
  },
  {
    href: "/paywall",
    title: "Paywall",
    desc: "Pay only for what you use. Deposit once and unlock per-request payments for APIs, agents, and services.",
    tag: "Usage-based",
    icon: LockKeyhole,
    gradient: "from-[#c58cff]/35 via-[#7ef2ff]/15 to-transparent",
  },
];

const reveal = {
  hidden: { opacity: 0, y: 48 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.75, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  },
};

const stagger = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.14,
    },
  },
};

function Section({
  children,
  className = "",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <motion.section
      id={id}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.18 }}
      variants={stagger}
      className={className}
    >
      {children}
    </motion.section>
  );
}

function Reveal({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={reveal} className={className}>
      {children}
    </motion.div>
  );
}

function Orb({ className = "" }: { className?: string }) {
  return (
    <div
      className={`absolute rounded-full blur-3xl ${className}`}
      style={{
        background:
          "radial-gradient(circle, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.18) 26%, rgba(255,255,255,0) 70%)",
      }}
    />
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen overflow-hidden bg-[#120f1d] text-white">
      <div className="absolute inset-0 -z-20 bg-[linear-gradient(180deg,#120f1d_0%,#1d1530_42%,#0f1722_100%)]" />
      <div className="absolute inset-0 -z-10 opacity-90 bg-[radial-gradient(circle_at_12%_18%,rgba(255,160,122,0.22),transparent_22%),radial-gradient(circle_at_82%_14%,rgba(255,99,132,0.18),transparent_20%),radial-gradient(circle_at_72%_42%,rgba(140,82,255,0.22),transparent_28%),radial-gradient(circle_at_18%_78%,rgba(0,240,255,0.16),transparent_22%)]" />

      <Orb className="left-[5%] top-16 h-44 w-44 opacity-30" />
      <Orb className="right-[8%] top-[18%] h-56 w-56 opacity-20" />
      <Orb className="bottom-12 left-[30%] h-64 w-64 opacity-10" />

      <main className="mx-auto max-w-7xl px-6 pb-28 pt-8 md:px-10 lg:px-12">
        <Section className="relative flex min-h-[94vh] items-center justify-center">
          <div className="mx-auto max-w-4xl text-center">
            <Reveal>
              <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-[11px] uppercase tracking-[0.28em] text-[#ffd7c7] backdrop-blur-md">
                <Sparkles className="h-3.5 w-3.5" />
                Native USDC · Arc
              </div>
            </Reveal>

            <Reveal>
              <h1 className="mt-8 text-5xl font-semibold leading-[0.9] tracking-[-0.06em] text-white md:text-7xl lg:text-[92px]">
                Payments,
                <span className="block text-[#ffb38a]">reimagined</span>
                <span className="block text-white/85">as a living system.</span>
              </h1>
            </Reveal>

            <Reveal>
              <p className="mx-auto mt-8 max-w-2xl text-lg leading-8 text-white/68 md:text-[21px]">
                FlowPay brings stream, invoice, and paywall flows into a more expressive,
                modern onchain payment experience built around native USDC. Built on Arc.
              </p>
            </Reveal>

            <Reveal>
              <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
                <Link
                  href="/how-to-work"
                  className="group inline-flex items-center justify-center gap-2 rounded-full bg-[#fff4ec] px-7 py-3.5 text-sm font-semibold text-[#291c28] transition-transform hover:-translate-y-0.5"
                >
                  Explore Flow
                  <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>

                <a
                  href="https://www.arc.network/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/14 bg-white/8 px-7 py-3.5 text-sm font-medium text-white/90 backdrop-blur-md hover:bg-white/12"
                >
                  Explore Arc
                  <ArrowUpRight className="h-4 w-4" />
                </a>

              </div>
            </Reveal>

            <Reveal>
              <div className="mt-12 flex flex-wrap justify-center gap-3">
                {["Real-time USDC streaming", "Onchain invoice settlement", "Usage-based API payments"].map((item) => (
                  <div
                    key={item}
                    className="rounded-full border border-white/10 bg-white/8 px-4 py-2 text-sm text-white/70 backdrop-blur-md"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </Section>

        <Section id="flows" className="mt-10">
          <Reveal>
            <div className="mb-8 max-w-2xl">
              <div className="text-sm uppercase tracking-[0.28em] text-[#ffb38a]">Payment models</div>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-white md:text-5xl">
                One system,
                <span className="block text-white/65">three payment flows.</span>
              </h2>
            </div>
          </Reveal>

          <div className="grid gap-5 lg:grid-cols-3">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <Reveal key={feature.href}>
                  <Link
                    href={feature.href}
                    className="group relative block h-full overflow-hidden rounded-[2rem] border border-white/12 bg-white/8 p-6 backdrop-blur-xl transition duration-500 hover:-translate-y-1.5"
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-80`} />

                    <div className="relative">
                      <div className="flex items-center justify-between">
                        <div className="rounded-2xl border border-white/12 bg-black/20 p-3 text-white">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="rounded-full border border-white/12 bg-white/10 px-3 py-1 text-xs text-white/78">
                          {feature.tag}
                        </div>
                      </div>

                      <h3 className="mt-10 text-3xl font-semibold tracking-[-0.04em] text-white">
                        {feature.title}
                      </h3>
                      <p className="mt-4 text-[15px] leading-7 text-white/72">{feature.desc}</p>

                      <div className="mt-10 inline-flex items-center gap-2 text-sm font-medium text-[#ffb38a]">
                        Try it
                        <ArrowUpRight className="h-4 w-4" />
                      </div>
                    </div>
                  </Link>
                </Reveal>
              );
            })}
          </div>
        </Section>

        <Section className="mt-24 grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-stretch">
          <Reveal className="h-full">
            <div className="h-full rounded-[2.2rem] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.05))] p-8 backdrop-blur-xl md:p-10">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-white/70">
                <Stars className="h-3.5 w-3.5" />
                Why FlowPay exists
              </div>

              <h2 className="mt-5 text-3xl font-semibold leading-tight tracking-[-0.05em] text-white md:text-5xl">
                Payments today
                <span className="block text-[#ffb38a]">are fragmented.</span>
              </h2>

              <p className="mt-5 max-w-xl text-base leading-8 text-white/68">
                Subscriptions, invoices, and usage-based pricing all live in separate systems,
                creating friction for both builders and users.
                <br /><br />
                FlowPay brings them together. A single onchain system where money can flow
                over time, settle instantly, or move per usage — without switching tools
                or contexts.
              </p>
            </div>
          </Reveal>

          <Reveal className="h-full">
            <div className="grid h-full gap-4 sm:grid-cols-2">
              {[
                [Sparkles, "No fragmentation", "Everything runs in one place."],
                [Orbit, "No intermediaries", "Payments settle directly onchain."],
                [Wallet, "No rigid models", "Time, event, or usage — choose what fits."],
                [Waves, "No extra complexity", "Runs natively on Arc."],
              ].map(([Icon, title, desc]) => {
                const Cmp = Icon as React.ElementType;
                return (
                  <div
                    key={String(title)}
                    className="rounded-[1.6rem] border border-white/12 bg-black/20 p-6 backdrop-blur-xl flex flex-col"
                  >
                    <Cmp className="h-5 w-5 text-[#ffd7c7]" />
                    <div className="mt-5 text-lg font-semibold text-white">{title as string}</div>
                    <div className="mt-2 text-sm leading-6 text-white/62 whitespace-pre-line">{desc as string}</div>
                  </div>
                );
              })}
            </div>
          </Reveal>
        </Section>
      </main>

      <div className="flex justify-end px-6 pb-8 md:px-10 lg:px-12">
        <div className="flex items-center gap-3">
          <a
            href={ARC_MAINNET_EXPLORER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/6 px-4 py-2 text-xs font-medium text-white/55 backdrop-blur-md hover:text-white/80 transition"
          >
            Arc Explorer
            <ArrowUpRight className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
