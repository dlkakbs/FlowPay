"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { injected, useAccount, useConnect, useDisconnect } from "wagmi";
import { useSyncExternalStore } from "react";

const NAV = [
  { href: "/stream", label: "Stream" },
  { href: "/invoice", label: "Invoice" },
  { href: "/paywall", label: "Paywall" },
];

function shortAddr(addr: string) {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

export function Navbar() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  return (
    <nav className="sticky top-0 z-50 px-4 pt-4 md:px-8 lg:px-10">
      <div className="mx-auto flex max-w-7xl items-center justify-between rounded-[1.6rem] border border-white/12 bg-white/8 px-4 py-3 backdrop-blur-xl shadow-[0_10px_40px_rgba(0,0,0,0.18)] md:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-[22px] font-extrabold tracking-[-0.05em] text-white md:text-[24px]">
            Flow
          </span>
          <span className="text-[22px] font-extrabold tracking-[-0.05em] text-[#ffb38a] md:text-[24px]">
            Pay
          </span>
        </Link>

        <div className="hidden items-center gap-2 md:flex">
          {NAV.map((n) => {
            const active = pathname.startsWith(n.href);

            return (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                  active
                    ? "border border-white/14 bg-white/12 text-white"
                    : "text-white/62 hover:bg-white/8 hover:text-white"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </div>

        {mounted && isConnected ? (
          <button
            onClick={() => disconnect()}
            className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-black/20 px-4 py-2 text-sm font-medium text-white/85 transition hover:bg-white/10"
          >
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="font-mono">{shortAddr(address!)}</span>
          </button>
        ) : (
          <button
            onClick={() => connect({ connector: injected() })}
            className="rounded-full bg-[#fff4ec] px-4 py-2 text-sm font-semibold text-[#291c28] transition hover:-translate-y-0.5"
          >
            Connect Wallet
          </button>
        )}
      </div>
    </nav>
  );
}
