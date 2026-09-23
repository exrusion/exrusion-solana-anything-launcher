"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Check, CheckCircle2, ExternalLink, Pause, Play, RotateCcw, ShieldCheck, WalletCards, Zap } from "lucide-react";
import styles from "@/app/walkthrough/walkthrough.module.css";

const stages = [
  { number: "01", label: "Token details", short: "Enter once", title: "Start with one token identity", copy: "Add the name, ticker, artwork and socials once. Anything reuses them across every route you choose." },
  { number: "02", label: "Choose rails", short: "Select routes", title: "Pick any Solana launchpad", copy: "Select one route or all eight. Native provider settings stay independent while the shared details remain in sync." },
  { number: "03", label: "Wallet approvals", short: "Sign safely", title: "Approve every route yourself", copy: "Anything prepares each launch separately. Your wallet shows each transaction before anything reaches Solana." },
  { number: "04", label: "Live results", short: "Track launches", title: "See every launch land", copy: "Confirmed routes get their own mint, signature and explorer link. A failed route can be retried without repeating the others." },
] as const;

const launchpads = [
  { id: "pump", name: "Pump.fun", method: "Official create transaction", mark: "P", logo: "https://pump.fun/pump-logomark.svg", color: "#4de58a", dark: "#082b18" },
  { id: "stonk", name: "StonkFun", method: "Public launch API", mark: "S", logo: "https://www.stonkfun.xyz/stonk-mark.svg", color: "#69b8d8", dark: "#15313c" },
  { id: "ember", name: "Ember", method: "Meteora curve + fees", mark: "🔥", logo: "https://embercurve.fun/apple-touch-icon.png", color: "#ff825c", dark: "#351b14" },
  { id: "bonk", name: "BONK.fun", method: "Raydium LaunchLab", mark: "B!", logo: "https://www.bonk.fun/logos/bonk_fun.png", color: "#ffd83d", dark: "#211a00" },
  { id: "bags", name: "Bags", method: "Official Bags handoff", mark: "B", logo: "https://bags.fm/icon.png?e952db43040dbe33", color: "#ef77bc", dark: "#291020" },
  { id: "otc", name: "OTC", method: "Pump V2 adapter", mark: "OTC", logo: "https://otcdesks.cash/otc-icon.svg", color: "#d7ff67", dark: "#112015" },
  { id: "raydium", name: "Raydium", method: "LaunchLab SDK", mark: "R", logo: "https://raydium.io/favicon.ico", color: "#978cff", dark: "#17102e" },
  { id: "meteora", name: "Meteora", method: "DBC SDK", mark: "M", logo: "https://launch.meteora.ag/favicon.ico", color: "#ffad56", dark: "#2b1606" },
] as const;

const resultMints = ["4nyTh...x8Qp", "8Ra1L...kT2m", "B0nkF...9sVm", "Mete0...dBc7"] as const;

function ProviderMark({ provider, compact = false }: { provider: (typeof launchpads)[number]; compact?: boolean }) {
  return <span className={`${styles.providerMark} ${compact ? styles.compactMark : ""}`} style={{ "--mark-color": provider.color, color: provider.dark } as React.CSSProperties} aria-hidden="true"><span className={styles.providerFallback}>{provider.mark}</span><Image src={provider.logo} alt="" width={38} height={38} unoptimized onError={(event) => { event.currentTarget.style.display = "none"; }}/></span>;
}

function TokenArtwork() {
  return <div className={styles.tokenArtwork} aria-hidden="true">
    <span className={styles.orbit}/><span className={styles.orbitDot}/>
    <span className={styles.tokenCenter}><Image src="/anything-logo.png" alt="" width={48} height={48}/></span>
    <span className={`${styles.tokenNode} ${styles.nodeOne}`}><Image src={launchpads[0].logo} alt="" width={38} height={38} unoptimized/></span>
    <span className={`${styles.tokenNode} ${styles.nodeTwo}`}><Image src={launchpads[3].logo} alt="" width={38} height={38} unoptimized/></span>
    <span className={`${styles.tokenNode} ${styles.nodeThree}`}><Image src={launchpads[6].logo} alt="" width={38} height={38} unoptimized/></span>
  </div>;
}

function DetailsPanel() {
  return <div className={styles.detailsPanel}>
    <div className={styles.artworkUpload}><TokenArtwork/><span>Token artwork</span><small>Square PNG · ready</small></div>
    <div className={styles.demoFields}>
      <div><span>Token name</span><div>Anything Demo</div></div>
      <div><span>Ticker</span><div>ANY</div></div>
      <div className={styles.wideField}><span>Description</span><div>One idea, launched across Solana.</div></div>
      <div className={styles.wideField}><span>Website</span><div>anything.family</div></div>
    </div>
  </div>;
}

function SelectionPanel() {
  return <div className={styles.providerGrid}>
    {launchpads.map((provider, index) => <div key={provider.id} className={styles.providerCard} style={{ animationDelay: `${index * 70}ms` }}>
      <ProviderMark provider={provider}/><span><strong>{provider.name}</strong><small>{provider.method}</small></span><Check className={styles.selectedCheck} size={15}/>
    </div>)}
  </div>;
}

function ApprovalPanel() {
  return <div className={styles.approvalList}>
    {launchpads.slice(0, 5).map((provider, index) => <div key={provider.id} className={styles.approvalRow}>
      <ProviderMark provider={provider} compact/><span><strong>{provider.name}</strong><small>{provider.id === "bags" ? "Official handoff prepared" : index < 3 ? "Wallet approved" : "Waiting for approval"}</small></span>
      {provider.id === "bags" ? <ExternalLink className={styles.handoffIcon} size={17}/> : index < 3 ? <CheckCircle2 className={styles.successIcon} size={18}/> : <span className={styles.waitingPulse}/>} 
    </div>)}
    <div className={styles.walletNotice}><WalletCards size={18}/><span><strong>3 of 7 approvals complete</strong><small>Bags opens its official launch form separately.</small></span></div>
  </div>;
}

function ResultsPanel() {
  return <div className={styles.resultsList}>
    {launchpads.slice(0, 4).map((provider, index) => <div key={provider.id} className={styles.resultRow}>
      <ProviderMark provider={provider} compact/><span><strong>{provider.name}</strong><small>Live on Solana · ${index === 0 ? "ANY" : `ANY${index + 1}`}</small><code>{resultMints[index]}</code></span><CheckCircle2 className={styles.successIcon} size={18}/><ExternalLink size={15}/>
    </div>)}
    <div className={styles.resultSummary}><span><Check size={16}/> 4 confirmed</span><span>3 processing</span><span>1 provider handoff</span></div>
  </div>;
}

function StagePanel({ stage }: { stage: number }) {
  if (stage === 0) return <DetailsPanel/>;
  if (stage === 1) return <SelectionPanel/>;
  if (stage === 2) return <ApprovalPanel/>;
  return <ResultsPanel/>;
}

export function WalkthroughDemo() {
  const [activeStage, setActiveStage] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => setActiveStage((current) => (current + 1) % stages.length), 4300);
    return () => window.clearTimeout(timer);
  }, [activeStage, playing]);

  const selectStage = (index: number) => {
    setActiveStage(index);
    setPlaying(false);
  };

  const restart = () => {
    setActiveStage(0);
    setPlaying(true);
  };

  const active = stages[activeStage];

  return <main className={styles.page}>
    <section className={styles.hero}>
      <div><span className="eyebrow">PRODUCT WALKTHROUGH</span><h1>See Anything<br/><span>in action.</span></h1></div>
      <div className={styles.heroCopy}><p>Enter your token once. Choose where it launches. Approve each route from your own wallet.</p><div><Link href="/#launch" className={styles.primaryCta}>Open launcher <ArrowRight size={16}/></Link><Link href="/docs" className={styles.secondaryCta}>Read the docs</Link></div></div>
    </section>

    <section className={styles.demoShell} aria-label="Interactive Anything Solana product walkthrough">
      <div className={styles.demoHeader}>
        <div><span className={styles.liveDot}/><strong>Interactive demo</strong><small>No wallet or transaction required</small></div>
        <div className={styles.demoControls}>
          <span>{activeStage + 1} / {stages.length}</span>
          <button type="button" onClick={() => setPlaying((current) => !current)} aria-label={playing ? "Pause walkthrough" : "Play walkthrough"}>{playing ? <Pause size={16}/> : <Play size={16}/>}</button>
          <button type="button" onClick={restart} aria-label="Restart walkthrough"><RotateCcw size={16}/></button>
        </div>
      </div>

      <div className={styles.demoWindow}>
        <aside className={styles.miniRail} aria-hidden="true"><span className={styles.miniLogo}><Image src="/anything-logo.png" alt="" width={35} height={35}/></span><i className={styles.railActive}/><i/><i/><i/></aside>
        <div className={styles.launchFeed}>
          <div className={styles.feedHead}><div><strong>Launch feed</strong><small>Anything workspace</small></div><span>Demo</span></div>
          <article className={styles.feedPost}>
            <span className={styles.avatar}><Image src="/anything-logo.png" alt="" width={39} height={39}/></span><div><strong>Anything <small>@FamAnything · now</small></strong><p>@FamAnything launch Anything Demo across Solana</p><TokenArtwork/></div>
          </article>
          <div className={styles.feedStatus} key={activeStage}><span className={styles.feedStatusIcon}>{activeStage === 3 ? <Check size={16}/> : <Zap size={15}/>}</span><div><strong>{active.title}</strong><small>{active.copy}</small></div></div>
          <div className={styles.feedAssurance}><ShieldCheck size={17}/><span><strong>Non-custodial by design</strong><small>Anything never asks for a private key and takes 0%.</small></span></div>
        </div>

        <div className={styles.actionPanel}>
          <div className={styles.actionHead} key={`head-${activeStage}`}><span>{active.number} · {active.label}</span><h2>{active.short}</h2><p>{active.copy}</p></div>
          <div className={styles.stageBody} key={`body-${activeStage}`}><StagePanel stage={activeStage}/></div>
        </div>
      </div>

      <div className={styles.stepNav} aria-label="Walkthrough steps">
        {stages.map((stage, index) => <button key={stage.number} type="button" aria-pressed={activeStage === index} className={activeStage === index ? styles.activeStep : ""} onClick={() => selectStage(index)}>
          <span>{stage.number}</span><div><strong>{stage.label}</strong><small>{stage.short}</small></div><i/>
        </button>)}
      </div>
    </section>

    <section className={styles.ctaBand}>
      <div><span className="eyebrow">READY WHEN YOU ARE</span><h2>Take it from demo<br/>to Solana mainnet.</h2></div>
      <div><p>The real launcher keeps every provider transaction separate, visible and retryable.</p><Link href="/#launch">Launch something <ArrowRight size={18}/></Link></div>
    </section>
  </main>;
}
