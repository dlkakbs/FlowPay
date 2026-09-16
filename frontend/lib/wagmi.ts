import { createConfig, http, injected } from "wagmi";
import { arcChain, IS_ARC_MAINNET } from "./arcNetwork";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

export const CONTRACTS = {
  arcFlow: ((process.env.NEXT_PUBLIC_ARC_FLOW_ADDRESS as `0x${string}` | undefined) ??
    (IS_ARC_MAINNET ? ZERO_ADDRESS : "0xAB78614fED57bB451b70EE194fC4043CADCC39eF")) as `0x${string}`,
  arcInvoice: ((process.env.NEXT_PUBLIC_ARC_INVOICE_ADDRESS as `0x${string}` | undefined) ??
    (IS_ARC_MAINNET ? ZERO_ADDRESS : "0x8d533a6DF78ef01F6E4E998588D3Ccb21F668486")) as `0x${string}`,
  arcPaywall: ((process.env.NEXT_PUBLIC_ARC_PAYWALL_V2_ADDRESS as `0x${string}` | undefined) ??
    (IS_ARC_MAINNET ? ZERO_ADDRESS : "0xb1f95F4d86C743cbe1797C931A9680dF5766633A")) as `0x${string}`,
};

export const wagmiConfig = createConfig({
  chains: [arcChain],
  connectors: [injected()],
  transports: {
    [arcChain.id]: http(),
  },
});
