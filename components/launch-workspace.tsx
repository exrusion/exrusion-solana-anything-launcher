"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton, useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Transaction, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { ArrowUpRight, Check, ChevronDown, CircleAlert, ExternalLink, ImagePlus, LoaderCircle, RotateCcw, ShieldCheck, X } from "lucide-react";
import { ProviderId, providerById, providers } from "@/lib/providers";

type RouteState = "idle" | "preparing" | "approval" | "confirming" | "success" | "failed";
type Result = { provider: ProviderId; state: RouteState; message?: string; signatures?: string[]; mint?: string };
type Metadata = { metadataUri: string; imageUri: string };
type LaunchForm = { name: string; symbol: string; description: string; website: string; twitter: string; telegram: string; initialBuy: string; metadataUrl: string; bagsConfigKey: string; pumpPair: string; bonkTurbo: string; stonkQuote: string; stonkMode: string; stonkTax: string; stonkDevBuy: string; otcPair: string; otcPairSymbol: string; otcVenue: string };

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787";
const stonkPairs = [
  ["So11111111111111111111111111111111111111112", "SOL · Wrapped SOL"],
  ["Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh", "NVDAX · NVIDIA"],
  ["XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB", "TSLAX · Tesla"],
  ["XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W", "SPYX · S&P 500"],
  ["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "USDC · USD Coin"],
] as const;
const otcPairs = [
  ["XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp", "AAPLx", "Apple"],
  ["Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh", "NVDAx", "NVIDIA"],
  ["XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB", "TSLAx", "Tesla"],
  ["XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ", "MSTRx", "MicroStrategy"],
  ["pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn", "PUMP", "Pump"],
  ["DezXAZ8z7PnrnRJjz3wXBoRgixCa6Pc5fB1pPB263", "BONK", "Bonk"],
] as const;

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

async function fileDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the token image."));
    reader.readAsDataURL(file);
  });
}

export function LaunchWorkspace() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { setVisible: showWallet } = useWalletModal();
  const [mode, setMode] = useState<"single" | "multi">("single");
  const [selected, setSelected] = useState<ProviderId[]>(["pump"]);
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [optionsOpen, setOptionsOpen] = useState(true);
  const [results, setResults] = useState<Result[]>([]);
  const [form, setForm] = useState({
    name: "", symbol: "", description: "", website: "", twitter: "", telegram: "",
    initialBuy: "0", metadataUrl: "", bagsConfigKey: "", pumpPair: "SOL", bonkTurbo: "off",
    stonkQuote: stonkPairs[0][0], stonkMode: "standard", stonkTax: "0", stonkDevBuy: "0",
    otcPair: otcPairs[0][0], otcPairSymbol: otcPairs[0][1], otcVenue: "pump",
  });

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const chosen = useMemo(() => providers.filter((provider) => selected.includes(provider.id)), [selected]);
  const primary = chosen[0] || providers[0];
  const approvals = chosen.reduce((sum, provider) => sum + provider.confirmations, 0);
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  function choose(id: ProviderId) {
    setSelected((current) => mode === "single" ? [id] : current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setOptionsOpen(true);
  }

  function onImage(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] || null;
    if (preview) URL.revokeObjectURL(preview);
    setImage(next);
    setPreview(next ? URL.createObjectURL(next) : "");
  }

  function setRoute(provider: ProviderId, patch: Partial<Result>) {
    setResults((current) => {
      const existing = current.find((item) => item.provider === provider);
      return existing ? current.map((item) => item.provider === provider ? { ...item, ...patch } : item) : [...current, { provider, state: "idle", ...patch }];
    });
  }

  async function prepareMetadata(): Promise<Metadata> {
    if (form.metadataUrl) return { metadataUri: form.metadataUrl, imageUri: "" };
    if (!image) throw new Error("Add a square token image.");
    if (image.size > 5 * 1024 * 1024) throw new Error("The token image must be 5 MB or smaller.");
    const body = new FormData();
    body.append("image", image);
    for (const key of ["name", "symbol", "description", "website", "twitter", "telegram"] as const) body.append(key, form[key]);
    const response = await fetch(`${apiUrl}/api/metadata`, { method: "POST", body });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Metadata upload failed.");
    return data as Metadata;
  }

  async function signPrepared(transaction: string, encoding: "base64" | "base58", version: "legacy" | "v0") {
    if (!wallet.signTransaction) throw new Error("This wallet does not support transaction signing.");
    const raw = encoding === "base58" ? bs58.decode(transaction) : fromBase64(transaction);
    const decoded = version === "legacy" ? Transaction.from(raw) : VersionedTransaction.deserialize(raw);
    const signed = await wallet.signTransaction(decoded);
    return { signed, serialized: toBase64(signed.serialize()) };
  }

  async function confirmSigned(serialized: string) {
    const signature = await connection.sendRawTransaction(fromBase64(serialized), { skipPreflight: false, maxRetries: 3 });
    const confirmation = await connection.confirmTransaction(signature, "confirmed");
    if (confirmation.value.err) throw new Error(`Solana rejected ${signature.slice(0, 8)}…`);
    return signature;
  }

  async function runRoute(provider: ProviderId, metadata: Metadata) {
    if (!wallet.publicKey) throw new Error("Connect a Solana wallet first.");
    if (["stonk", "bonk"].includes(provider) && !image) throw new Error(`${providerById[provider].name} requires the original image file.`);
    setRoute(provider, { state: "preparing", message: "Preparing with the official launch route" });
    const logo = image ? await fileDataUrl(image) : "";
    const response = await fetch(`${apiUrl}/api/prepare/${provider}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...form, metadataUri: metadata.metadataUri, imageUri: metadata.imageUri, logo, wallet: wallet.publicKey.toBase58(), initialBuyLamports: Math.round(Number(form.initialBuy || 0) * 1_000_000_000) }),
    });
    const prepared = await response.json();
    if (!response.ok) throw new Error(prepared.error || "The provider could not prepare this launch.");

    if (prepared.kind === "stonk") {
      setRoute(provider, { state: "approval", message: "Approval 1 of 1 · StonkFun launch payment" });
      const { serialized } = await signPrepared(prepared.transaction, "base64", "legacy");
      setRoute(provider, { state: "confirming", message: "StonkFun is submitting the atomic launch" });
      const submitResponse = await fetch(`${apiUrl}/api/submit/stonk`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ signedQuote: prepared.signedQuote, signedTransaction: serialized, logo }) });
      let submitted = await submitResponse.json();
      if (!submitResponse.ok) throw new Error(submitted.error || "StonkFun submission failed.");
      while (submitted.status === "processing") {
        await new Promise((resolve) => window.setTimeout(resolve, 3500));
        const statusResponse = await fetch(`${apiUrl}/api/status/stonk/${submitted.paymentSignature}`);
        submitted = await statusResponse.json();
        if (!statusResponse.ok) throw new Error(submitted.error || "StonkFun status check failed.");
      }
      if (submitted.status !== "completed") throw new Error(submitted.message || "StonkFun did not complete the launch.");
      const signature = submitted.paymentSignature || submitted.signature;
      await saveLaunch(provider, submitted.mint, [signature]);
      setRoute(provider, { state: "success", message: "Live on StonkFun", mint: submitted.mint, signatures: [signature] });
      return;
    }

    const transactions = prepared.transactions || [{ transaction: prepared.transaction, encoding: prepared.encoding || "base64", version: prepared.version || "v0", label: "Create token" }];
    const signatures: string[] = [];
    for (let index = 0; index < transactions.length; index += 1) {
      const item = transactions[index];
      setRoute(provider, { state: "approval", message: `Approval ${index + 1} of ${transactions.length} · ${item.label}` });
      const { serialized } = await signPrepared(item.transaction, item.encoding || "base64", item.version || "v0");
      setRoute(provider, { state: "confirming", message: `Confirming ${index + 1} of ${transactions.length} on Solana` });
      signatures.push(await confirmSigned(serialized));
    }
    if (prepared.finalize) {
      const finalized = await fetch(`${apiUrl}/api/finalize/${provider}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...prepared.finalize, signatures, wallet: wallet.publicKey.toBase58(), name: form.name, symbol: form.symbol, description: form.description, twitter: form.twitter, metadataUri: metadata.metadataUri, imageUri: metadata.imageUri }) });
      const finalizedBody = await finalized.json();
      if (!finalized.ok) throw new Error(finalizedBody.error || "The launch landed but provider registration failed.");
    }
    await saveLaunch(provider, prepared.mint, signatures);
    setRoute(provider, { state: "success", message: "Confirmed on Solana", mint: prepared.mint, signatures });
  }

  async function saveLaunch(provider: ProviderId, mint: string, signatures: string[]) {
    const record = { provider, wallet: wallet.publicKey!.toBase58(), mint, signature: signatures[0], signatures, name: form.name, symbol: form.symbol };
    await fetch(`${apiUrl}/api/launches`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(record) });
    const saved = JSON.parse(localStorage.getItem("solana-anything-launches") || "[]");
    localStorage.setItem("solana-anything-launches", JSON.stringify([record, ...saved].slice(0, 100)));
  }

  async function start(ids = selected) {
    if (!wallet.connected) return showWallet(true);
    if (!form.name.trim() || !form.symbol.trim() || !form.description.trim()) return alert("Add the token name, ticker and description.");
    if (!ids.length) return alert("Select at least one launchpad.");
    let metadata: Metadata;
    try { metadata = await prepareMetadata(); } catch (error) { return alert(error instanceof Error ? error.message : "Metadata upload failed."); }
    for (const id of ids) {
      if (results.find((item) => item.provider === id)?.state === "success") continue;
      try { await runRoute(id, metadata); } catch (error) { setRoute(id, { state: "failed", message: error instanceof Error ? error.message : "Launch failed." }); }
    }
  }

  return <main className={`workspace theme-${primary.id}`} style={{ "--provider-accent": primary.accent, "--provider-ink": primary.ink } as React.CSSProperties}>
    <section className="intro">
      <div><span className="eyebrow">SOLANA LAUNCH ROUTER</span><h1>One token.<br/><span>Every launch.</span></h1></div>
      <p>Launch independently across Solana with one wallet, one set of token details and provider-native controls.</p>
    </section>

    <section className="builder-card">
      <div className="builder-head">
        <div className="segmented" aria-label="Launch mode">
          <button className={mode === "single" ? "active" : ""} onClick={() => { setMode("single"); setSelected((current) => current.slice(0, 1)); }}>Single</button>
          <button className={mode === "multi" ? "active" : ""} onClick={() => setMode("multi")}>Multi-launch</button>
        </div>
        <div className="zero-fee"><ShieldCheck size={16}/> Router fee 0%</div>
      </div>

      <div className="provider-strip">
        {providers.map((provider) => { const active = selected.includes(provider.id); return <button key={provider.id} type="button" className={`provider ${active ? "selected" : ""} ${provider.live ? "" : "gated"}`} onClick={() => choose(provider.id)} aria-pressed={active}>
          <span className="provider-mark" style={{ background: provider.accent, color: provider.ink }}>{provider.short}</span>
          <span className="provider-copy"><strong>{provider.name}</strong><small>{provider.method}</small></span>
          <span className="status-dot">{active ? <Check size={14}/> : provider.live ? "ADAPTER" : "GATED"}</span>
        </button>; })}
      </div>

      <div className="provider-banner">
        <div><span>{primary.name.toUpperCase()} LAUNCH</span><strong>{primary.id === "pump" ? "Create new coin" : primary.id === "bonk" ? "CREATE A TOKEN" : primary.id === "stonk" ? "Launch a token" : primary.id === "otc" ? "LAUNCH A COIN" : `Launch with ${primary.name}`}</strong></div>
        <a href={primary.url} target="_blank" rel="noreferrer">Official site <ExternalLink size={13}/></a>
      </div>

      <div className="form-layout">
        <label className={`upload ${preview ? "has-image" : ""}`}>
          {preview ? <img src={preview} alt="Token artwork preview"/> : <><ImagePlus size={27}/><strong>{primary.id === "otc" ? "ADD IMAGE" : "Token image"}</strong><span>Square PNG, JPG or WEBP · max 5 MB</span></>}
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onImage}/>
          {preview ? <button type="button" aria-label="Remove image" onClick={(event) => { event.preventDefault(); setImage(null); setPreview(""); }}><X size={15}/></button> : null}
        </label>
        <div className="fields">
          <div className="two"><Field label="Token name" value={form.name} onChange={(v) => update("name", v.slice(0, 32))} placeholder="Anything Solana"/><Field label="Ticker" value={form.symbol} onChange={(v) => update("symbol", v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))} placeholder="ANY"/></div>
          <label className="field"><span>Description</span><textarea value={form.description} onChange={(event) => update("description", event.target.value.slice(0, 500))} placeholder="Tell Solana what this token is about" rows={4}/></label>
          <div className="three"><Field label="Website" value={form.website} onChange={(v) => update("website", v)} placeholder="https://"/><Field label="X" value={form.twitter} onChange={(v) => update("twitter", v)} placeholder="https://x.com/"/><Field label="Telegram" value={form.telegram} onChange={(v) => update("telegram", v)} placeholder="https://t.me/"/></div>
        </div>
      </div>

      <button className="advanced-toggle" onClick={() => setOptionsOpen((value) => !value)}>Launchpad-specific options <ChevronDown size={16} className={optionsOpen ? "rotated" : ""}/></button>
      {optionsOpen ? <div className="provider-options">{chosen.map((provider) => <ProviderOptions key={provider.id} id={provider.id} form={form} update={update}/>)}</div> : null}

      <div className="approval-note"><CircleAlert size={17}/><span>{selected.length} independent launch{selected.length === 1 ? "" : "es"} · expect {approvals} wallet approval{approvals === 1 ? "" : "s"}. Confirm each provider separately; successful routes are skipped on retry.</span></div>
      <button className="launch-button" onClick={() => start()} disabled={!selected.length}>{wallet.connected ? `Prepare ${selected.length} launch${selected.length === 1 ? "" : "es"}` : "Connect wallet to continue"}<ArrowUpRight size={18}/></button>
    </section>

    {results.length ? <section className="route-results"><div className="section-title"><span>Live launch status</span><small>Every signature is tracked independently</small></div>{results.map((result) => { const provider = providerById[result.provider]; return <article key={result.provider} className={`route-row ${result.state}`}>
      <span className="provider-mark" style={{ background: provider.accent, color: provider.ink }}>{provider.short}</span><div><strong>{provider.name}</strong><small>{result.message}</small>{result.mint ? <code>{result.mint}</code> : null}</div><RouteIcon state={result.state}/>
      {result.signatures?.[0] ? <a href={`https://solscan.io/tx/${result.signatures[0]}`} target="_blank" rel="noreferrer">Explorer <ArrowUpRight size={14}/></a> : null}
      {result.state === "failed" ? <button onClick={() => start([result.provider])}><RotateCcw size={14}/> Retry</button> : null}
    </article>; })}</section> : null}
  </main>;
}

function ProviderOptions({ id, form, update }: { id: ProviderId; form: LaunchForm; update: (key: keyof LaunchForm, value: string) => void }) {
  if (id === "pump") return <article className="option-card pump-card"><OptionHead id={id}/><div className="option-grid"><Select label="Pool liquidity pair" value={form.pumpPair} onChange={(value) => update("pumpPair", value)} options={[["SOL", "SOL"]]}/><Field label="First buy (SOL)" value={form.initialBuy} onChange={(value) => update("initialBuy", value)} placeholder="0"/></div><p>Creator rewards can be shared on Pump after creation. Mayhem stays off for deterministic routing.</p></article>;
  if (id === "bonk") return <article className="option-card bonk-card"><OptionHead id={id}/><div className="option-grid"><Select label="Turbo" value={form.bonkTurbo} onChange={(value) => update("bonkTurbo", value)} options={[["off", "Turbo off"], ["on", "Turbo on"]]}/><Field label="First buy (SOL)" value={form.initialBuy} onChange={(value) => update("initialBuy", value)} placeholder="0"/></div><p>Creates through BONK’s public Raydium LaunchLab configuration and graduates to Raydium AMM.</p></article>;
  if (id === "stonk") return <article className="option-card stonk-card"><OptionHead id={id}/><div className="option-grid"><Select label="Fee model" value={form.stonkMode} onChange={(value) => update("stonkMode", value)} options={[["standard", "Standard token"], ["reward", "Reward token"]]}/><Select label="Holder rewards tax" value={form.stonkTax} onChange={(value) => update("stonkTax", value)} options={[["0", "None"], ["100", "1%"], ["300", "3%"]]}/><Select label="Quote token" value={form.stonkQuote} onChange={(value) => update("stonkQuote", value)} options={stonkPairs.map(([value, label]) => [value, label])}/><Field label="Dev buy (% supply)" value={form.stonkDevBuy} onChange={(value) => update("stonkDevBuy", value)} placeholder="0"/></div><p>Atomic StonkFun launch: payment, fixed-supply mint, first trade and LaunchLab pool land together or not at all.</p></article>;
  if (id === "otc") return <article className="option-card otc-card"><OptionHead id={id}/><div className="option-grid"><Select label="Launch on" value={form.otcVenue} onChange={(value) => update("otcVenue", value)} options={[["pump", "Pump"], ["meteora", "Meteora (verification pending)"]]}/><Select label="Paired with" value={form.otcPair} onChange={(value) => { update("otcPair", value); update("otcPairSymbol", otcPairs.find(([mint]) => mint === value)?.[1] || "CUSTOM"); }} options={otcPairs.map(([value, symbol, name]) => [value, `${symbol} · ${name}`])}/><Field label="Your first buy (SOL)" value={form.initialBuy} onChange={(value) => update("initialBuy", value)} placeholder="0"/></div><div className="split-bar"><span style={{width:"67.5%"}}>Holders 67.5%</span><span style={{width:"10%"}}>Desks</span><span style={{width:"22.5%"}}>Other</span></div><p>Two wallet confirmations: create the paired Pump V2 coin, then lock its creator-fee routing to OTC.</p></article>;
  if (id === "bags") return <article className="option-card bags-card"><OptionHead id={id}/><div className="option-grid"><Field label="Bags config key" value={form.bagsConfigKey} onChange={(value) => update("bagsConfigKey", value)} placeholder="Launch config public key"/><Field label="First buy (SOL)" value={form.initialBuy} onChange={(value) => update("initialBuy", value)} placeholder="0"/></div><p>The backend needs a Bags developer key; the key stays server-side and your wallet signs the returned transaction.</p></article>;
  return <article className={`option-card ${id}-card gated-card`}><OptionHead id={id}/><p>This adapter is present but intentionally disabled until the current SDK-built transaction passes mainnet simulation and a funded confirmation test.</p></article>;
}

function OptionHead({ id }: { id: ProviderId }) { const provider = providerById[id]; return <header><span className="provider-mark" style={{ background: provider.accent, color: provider.ink }}>{provider.short}</span><div><strong>{provider.name}</strong><small>{provider.live ? "Transaction route enabled" : "Verification gate"}</small></div></header>; }
function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) { return <label className="field"><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder}/></label>; }
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: readonly (readonly [string, string])[] }) { return <label className="field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([option, name]) => <option key={option} value={option}>{name}</option>)}</select></label>; }
function RouteIcon({ state }: { state: RouteState }) { if (["preparing", "approval", "confirming"].includes(state)) return <LoaderCircle className="spin" size={18}/>; if (state === "success") return <Check size={18}/>; if (state === "failed") return <CircleAlert size={18}/>; return null; }
export function WalletButton() { return <WalletMultiButton/>; }
