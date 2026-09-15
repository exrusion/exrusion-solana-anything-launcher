"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "./launch-workspace";

export function Header() {
  const pathname = usePathname();
  return <header className="site-header">
    <Link href="/" className="brand" aria-label="Solana Anything home"><span className="brand-icon"><i/><i/><i/></span><span>solana<span>.anything</span></span></Link>
    <nav><Link className={pathname === "/" ? "active" : ""} href="/">Launch</Link><Link className={pathname === "/docs" ? "active" : ""} href="/docs" target="_blank">Docs</Link></nav>
    <WalletButton/>
  </header>;
}
