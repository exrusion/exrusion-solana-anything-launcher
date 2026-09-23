"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "./launch-workspace";

export function Header() {
  const pathname = usePathname();
  return <header className="site-header">
    <Link href="/" className="brand" aria-label="Anything Solana home"><Image src="/anything-header-logo.png" alt="" width={62} height={62} sizes="62px" priority unoptimized/><span>anything<span>.solana</span></span></Link>
    <nav><Link className={pathname === "/" ? "active" : ""} href="/#launch">Launch</Link><Link href="/#launched">Launched</Link><Link href="/#how-it-works">How it works</Link><Link className={pathname === "/walkthrough" ? "active" : ""} href="/walkthrough">Walkthrough</Link><Link className={pathname === "/docs" ? "active" : ""} href="/docs" target="_blank">Docs</Link></nav>
    <div className="route-status"><i/>Solana only</div>
    <a className="social-x" href="https://x.com/launchsolx" target="_blank" rel="noreferrer"><span>𝕏</span><b>@launchsolx</b></a>
    <WalletButton/>
  </header>;
}
