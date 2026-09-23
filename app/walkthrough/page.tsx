import type { Metadata } from "next";
import { Header } from "@/components/header";
import { WalkthroughDemo } from "@/components/walkthrough-demo";

export const metadata: Metadata = {
  title: "Product walkthrough — Anything Solana",
  description: "See how Anything Solana takes one token from details to independent launches across eight Solana launchpads.",
};

export default function WalkthroughPage() {
  return <>
    <Header/>
    <WalkthroughDemo/>
    <footer><span>Solana mainnet</span><span>Interactive product demo · No transaction is submitted</span></footer>
  </>;
}
