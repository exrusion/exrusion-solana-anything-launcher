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
type LaunchRecord = { provider: ProviderId; wallet: string; mint: string; signature: string; signatures?: string[]; name: string; symbol: string; created_at?: string };
type ProviderState = "enabled" | "needs_api_key" | "provider_unavailable" | "verification_required";
type Metadata = { metadataUri: string; imageUri: string };
type LaunchForm = { name: string; symbol: string; description: string; website: string; twitter: string; telegram: string; initialBuy: string; metadataUrl: string; bagsConfigKey: string; pumpPair: string; bonkTurbo: string; stonkQuote: string; stonkMode: string; stonkTax: string; stonkDevBuy: string; emberQuote: string; emberFee: string; emberGraduate: string; emberMode: string; emberPayout: string; emberShield: string; emberVolatility: string; emberAirdrop: string; otcPair: string; otcPairSymbol: string; otcVenue: string };

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
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
const emberPairs = [
  ["So11111111111111111111111111111111111111112", "SOL · Wrapped SOL"],
  ["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "USDC · USD Coin"],
  ["DezXAZ8z7PnrnRJjz3wXBoRgixCa6Pc5fB1pPB263", "BONK · Bonk"],
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
  const [history, setHistory] = useState<LaunchRecord[]>([]);
  const [providerStates, setProviderStates] = useState<Partial<Record<ProviderId, ProviderState>>>({});
  const [form, setForm] = useState({
    name: "", symbol: "", description: "", website: "", twitter: "", telegram: "",
    initialBuy: "0", metadataUrl: "", bagsConfigKey: "", pumpPair: "SOL", bonkTurbo: "off",
    stonkQuote: stonkPairs[0][0], stonkMode: "standard", stonkTax: "0", stonkDevBuy: "0",
    emberQuote: emberPairs[0][0], emberFee: "200", emberGraduate: "35000", emberMode: "holders", emberPayout: "quote",
    emberShield: "off", emberVolatility: "off", emberAirdrop: "off",
    otcPair: otcPairs[0][0], otcPairSymbol: otcPairs[0][1], otcVenue: "pump",
  });

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => {
    const local = JSON.parse(localStorage.getItem("solana-anything-launches") || "[]") as LaunchRecord[];
    setHistory(local);
    fetch(`${apiUrl}/api/launches`).then((response) => response.ok ? response.json() : Promise.reject()).then((body) => {
      const remote = Array.isArray(body.launches) ? body.launches as LaunchRecord[] : [];
      if (remote.length) setHistory(remote);
    }).catch(() => undefined);
  }, []);
  useEffect(() => {
    fetch(`${apiUrl}/api/providers`).then((response) => response.ok ? response.json() : Promise.reject()).then((body) => {
      const states = Object.fromEntries((body.providers || []).map((provider: { id: ProviderId; preparation: ProviderState }) => [provider.id, provider.preparation]));
      setProviderStates(states);
    }).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!Object.keys(providerStates).length) return;
    setSelected((current) => {
      const available = current.filter((id) => providerById[id].live && !["needs_api_key", "provider_unavailable", "verification_required"].includes(providerStates[id] || "enabled"));
      return available.length ? available : ["pump"];
    });
  }, [providerStates]);
  const chosen = useMemo(() => providers.filter((provider) => selected.includes(provider.id)), [selected]);
  const primary = chosen[0] || providers[0];
  const approvals = chosen.reduce((sum, provider) => sum + provider.confirmations, 0);
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const routeAvailable = (id: ProviderId) => providerById[id].live && !["needs_api_key", "provider_unavailable", "verification_required"].includes(providerStates[id] || "enabled");

  function choose(id: ProviderId) {
    if (!routeAvailable(id)) return;
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
    if (["stonk", "ember", "bonk"].includes(provider) && !image) throw new Error(`${providerById[provider].name} requires the original image file.`);
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

    if (prepared.kind === "ember") {
      setRoute(provider, { state: "approval", message: "Approval 1 of 1 · Ember launch transaction" });
      const { serialized } = await signPrepared(prepared.transaction, "base64", "legacy");
      setRoute(provider, { state: "confirming", message: "Ember is submitting the signed launch" });
      const submitResponse = await fetch(`${apiUrl}/api/submit/ember`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ launchId: prepared.launchId, signedTransaction: serialized }) });
      const submitted = await submitResponse.json();
      if (!submitResponse.ok) throw new Error(submitted.error || "Ember submission failed.");
      const mint = submitted.mint || submitted.mintAddress || submitted.pool || prepared.mint;
      const signature = submitted.signature || submitted.txSignature || submitted.transactionSignature;
      if (!mint || !signature) throw new Error("Ember submitted the launch but did not return its mint and signature.");
      await saveLaunch(provider, mint, [signature]);
      setRoute(provider, { state: "success", message: "Live on Ember", mint, signatures: [signature] });
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
    const saved = JSON.parse(localStorage.getItem("solana-anything-launches") || "[]") as LaunchRecord[];
    const next = [record, ...saved].slice(0, 100);
    localStorage.setItem("solana-anything-launches", JSON.stringify(next));
    setHistory(next);
  }

  async function start(ids = selected) {
    if (!wallet.connected) return showWallet(true);
    if (!form.name.trim() || !form.symbol.trim() || !form.description.trim()) return alert("Add the token name, ticker and description.");
    if (!ids.length) return alert("Select at least one launchpad.");
    let metadata: Metadata = { metadataUri: "provider-native", imageUri: "" };
    if (ids.some((id) => ["pump", "bonk", "otc", "bags"].includes(id))) {
      try { metadata = await prepareMetadata(); } catch (error) { return alert(error instanceof Error ? error.message : "Metadata upload failed."); }
    }
    for (const id of ids) {
      if (results.find((item) => item.provider === id)?.state === "success") continue;
      try { await runRoute(id, metadata); } catch (error) { setRoute(id, { state: "failed", message: error instanceof Error ? error.message : "Launch failed." }); }
    }
  }

  return <main id="launch" className={`workspace theme-${primary.id}`} style={{ "--provider-accent": primary.accent, "--provider-ink": primary.ink } as React.CSSProperties}>
    <section className="intro">
      <div><span className="eyebrow">EIGHT RAILS. ONE SOLANA WORKSPACE.</span><h1>Choose a rail.<br/><span>Launch from here.</span></h1></div>
      <p>Launch once or prepare the same token for every Solana rail you select. Provider fees stay with each launchpad; Anything takes no cut.</p>
    </section>

    <section className="builder-card">
      <div className="builder-head">
        <div className="segmented" aria-label="Launch mode">
          <button className={mode === "single" ? "active" : ""} onClick={() => { setMode("single"); setSelected((current) => current.slice(0, 1)); }}>Single</button>
          <button className={mode === "multi" ? "active" : ""} onClick={() => setMode("multi")}>Multi-launch</button>
        </div>
        <div className="zero-fee"><ShieldCheck size={16}/> Router fee 0%</div>
      </div>

      <div className="provider-heading"><div><strong>Choose a launchpad</strong><span>{mode === "single" ? "One provider, its native workflow" : "Select every available route you want to launch"}</span></div><div className="provider-heading-actions">{mode === "multi" ? <><button type="button" onClick={() => setSelected(providers.filter((provider) => routeAvailable(provider.id)).map((provider) => provider.id))}>Select all available</button><button type="button" onClick={() => setSelected([])}>Clear</button></> : null}<small>{selected.length} selected</small></div></div>
      <div className="provider-strip">
        {providers.map((provider) => { const active = selected.includes(provider.id); const available = routeAvailable(provider.id); const state = providerStates[provider.id]; return <button key={provider.id} type="button" className={`provider provider-${provider.id} ${active ? "selected" : ""} ${available ? "" : "gated"}`} style={{ "--card-accent": provider.accent } as React.CSSProperties} onClick={() => choose(provider.id)} aria-pressed={active} disabled={!available}>
          <ProviderLogo id={provider.id}/>
          <span className="provider-copy"><strong>{provider.name}</strong><small>{provider.method}</small></span>
          <span className="status-dot">{active ? <Check size={14}/> : state === "needs_api_key" ? "KEY" : state === "provider_unavailable" ? "OFFLINE" : available ? "ADAPTER" : "GATED"}</span>
        </button>; })}
      </div>

      {mode === "single" && ["pump", "bonk", "stonk"].includes(primary.id) ? <SingleLaunchExperience
        id={primary.id}
        form={form}
        update={update}
        preview={preview}
        onImage={onImage}
        clearImage={() => { setImage(null); setPreview(""); }}
        walletConnected={wallet.connected}
        onLaunch={() => start()}
      /> : <>
      {mode === "multi" ? <div className="multi-flow-bar"><div><span>01</span><strong>Token details</strong><small>Enter everything once</small></div><i/><div><span>02</span><strong>Route options</strong><small>Only what differs</small></div><i/><div><span>03</span><strong>Wallet approvals</strong><small>Confirm every launch</small></div></div> : <div className="provider-banner">
        <div><span>{primary.name.toUpperCase()} LAUNCH</span><strong>{primary.id === "pump" ? "Create new coin" : primary.id === "bonk" ? "CREATE A TOKEN" : primary.id === "stonk" ? "Launch a token" : primary.id === "otc" ? "LAUNCH A COIN" : `Launch with ${primary.name}`}</strong></div>
        <a href={primary.url} target="_blank" rel="noreferrer">Official site <ExternalLink size={13}/></a>
      </div>}

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
      </>}
    </section>

    {results.length ? <section className="route-results"><div className="section-title"><span>Live launch status</span><small>Every signature is tracked independently</small></div>{results.map((result) => { const provider = providerById[result.provider]; return <article key={result.provider} className={`route-row ${result.state}`}>
      <ProviderLogo id={provider.id}/><div><strong>{provider.name}</strong><small>{result.message}</small>{result.mint ? <code>{result.mint}</code> : null}</div><RouteIcon state={result.state}/>
      {result.signatures?.[0] ? <a href={`https://solscan.io/tx/${result.signatures[0]}`} target="_blank" rel="noreferrer">Explorer <ArrowUpRight size={14}/></a> : null}
      {result.state === "failed" ? <button onClick={() => start([result.provider])}><RotateCcw size={14}/> Retry</button> : null}
    </article>; })}</section> : null}

    <section id="launched" className="launched-section">
      <div className="launched-heading"><div><span className="eyebrow">LIVE HISTORY</span><h2>Launched from here.</h2></div><p>Confirmed launches appear with their provider, mint and Solana explorer link.</p></div>
      <div className="launched-grid">
        {history.length ? history.map((launch, index) => { const provider = providerById[launch.provider]; return <article className="launched-card" key={`${launch.signature}-${index}`}>
          <ProviderLogo id={launch.provider}/><div><span>{provider?.name || launch.provider}</span><strong>{launch.name || "Untitled"} · ${launch.symbol || "TOKEN"}</strong><code>{launch.mint}</code></div><a href={`https://solscan.io/tx/${launch.signature}`} target="_blank" rel="noreferrer" aria-label={`Open ${launch.name} transaction on Solscan`}><ExternalLink size={15}/></a>
        </article>; }) : <div className="launched-empty"><strong>No confirmed launches on this device yet.</strong><span>Your successful launches will appear here automatically.</span></div>}
      </div>
    </section>

    <section id="how-it-works" className="how-section">
      <span className="eyebrow">HOW IT WORKS</span><h2>One form. Independent approvals.</h2>
      <div><article><span>01</span><strong>Enter once</strong><p>Add the token identity and artwork once.</p></article><article><span>02</span><strong>Choose rails</strong><p>Use one route or select every enabled Solana launchpad.</p></article><article><span>03</span><strong>Sign safely</strong><p>Your wallet shows and approves each provider transaction.</p></article></div>
    </section>
  </main>;
}

type NativeFormProps = {
  id: ProviderId;
  form: LaunchForm;
  update: (key: keyof LaunchForm, value: string) => void;
  preview: string;
  onImage: (event: ChangeEvent<HTMLInputElement>) => void;
  clearImage: () => void;
  walletConnected: boolean;
  onLaunch: () => void;
};

function SingleLaunchExperience(props: NativeFormProps) {
  if (props.id === "pump") return <PumpLaunch {...props}/>;
  if (props.id === "bonk") return <BonkLaunch {...props}/>;
  return <StonkLaunch {...props}/>;
}

function NativeArtwork({ preview, onImage, clearImage, className = "" }: Pick<NativeFormProps, "preview" | "onImage" | "clearImage"> & { className?: string }) {
  return <div className={`native-artwork ${className}`}>
    <label>
      {preview ? <img src={preview} alt="Token artwork preview"/> : <><ImagePlus size={27}/><strong>Select image to upload</strong><span>or drag and drop it here</span></>}
      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onImage}/>
    </label>
    {preview ? <button type="button" aria-label="Remove image" onClick={clearImage}><X size={15}/></button> : null}
  </div>;
}

function NativeLaunchButton({ walletConnected, onLaunch, label }: Pick<NativeFormProps, "walletConnected" | "onLaunch"> & { label: string }) {
  return <button type="button" className="native-submit" onClick={onLaunch}>{walletConnected ? label : "Connect wallet"}<ArrowUpRight size={17}/></button>;
}

function PumpLaunch({ form, update, preview, onImage, clearImage, walletConnected, onLaunch }: NativeFormProps) {
  return <section className="native-launch pump-native">
    <div className="native-topbar"><ProviderLogo id="pump"/><button type="button" aria-label="Back">‹</button><div className="native-search">⌕&nbsp;&nbsp; Search for coins and users… <kbd>⌘ K</kbd></div><span className="native-create">＋</span><span className="pump-sign">Sign in</span></div>
    <div className="pump-grid">
      <div>
        <h2>Create new coin</h2>
        <div className="pump-section">
          <h3>Coin details</h3><p>Choose carefully, these can&apos;t be changed once the coin is created</p>
          <div className="two"><Field label="Coin name" value={form.name} onChange={(v) => update("name", v.slice(0, 32))} placeholder="Name your coin"/><Field label="Ticker" value={form.symbol} onChange={(v) => update("symbol", v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))} placeholder="Add a coin ticker (e.g. DOGE)"/></div>
          <label className="field"><span>Description (Optional)</span><textarea value={form.description} onChange={(event) => update("description", event.target.value.slice(0, 500))} placeholder="Write a short description" rows={4}/></label>
          <details className="native-details"><summary>↗ &nbsp; Add social links (Optional)</summary><div className="three"><Field label="Website" value={form.website} onChange={(v) => update("website", v)} placeholder="https://"/><Field label="X" value={form.twitter} onChange={(v) => update("twitter", v)} placeholder="https://x.com/"/><Field label="Telegram" value={form.telegram} onChange={(v) => update("telegram", v)} placeholder="https://t.me/"/></div></details>
          <div className="native-label">Pool liquidity pair</div><div className="choice-row"><button type="button" className="chosen">◎ SOL</button><button type="button" disabled>◉ USDC</button></div>
          <div className="native-label">Send creator rewards to:</div><div className="wide-tabs"><button type="button" className="chosen">♔ Creator</button><button type="button">♙ Holders</button></div><p>Creator rewards can be shared with wallets or charities from the coin page after your coin has been created.</p>
          <div className="mayhem-row"><span className="mayhem-icon">〽</span><div><strong>Mayhem mode</strong><small>Increased price volume.</small></div><span className="fake-switch"/></div><p>ⓘ Active for 24h, only set at creation. May increase coin supply.</p>
        </div>
        <div className="pump-section media-section"><NativeArtwork preview={preview} onImage={onImage} clearImage={clearImage}/><div className="media-rules"><strong>File size and type</strong><span>Image · max 5 MB · JPG, PNG or WEBP</span><strong>Resolution and aspect ratio</strong><span>Square artwork recommended</span></div></div>
        <NativeLaunchButton walletConnected={walletConnected} onLaunch={onLaunch} label="Create coin"/>
      </div>
      <aside className="pump-preview"><h2>Preview</h2><div>{preview ? <img src={preview} alt="Token preview"/> : <span>A preview of how the coin<br/>will look like</span>}<strong>{form.name || "Your coin"}</strong><small>{form.symbol ? `$${form.symbol}` : "$TICKER"}</small></div></aside>
    </div>
  </section>;
}

function BonkLaunch({ form, update, preview, onImage, clearImage, walletConnected, onLaunch }: NativeFormProps) {
  return <section className="native-launch bonk-native">
    <div className="native-brand"><ProviderLogo id="bonk"/><strong>BONKfun</strong><span>CREATE</span></div><div className="bonk-title"><h2>Create <span>a Token</span></h2><div><button type="button" className={form.bonkTurbo === "on" ? "active" : ""} onClick={() => update("bonkTurbo", form.bonkTurbo === "on" ? "off" : "on")}>♢ Turbo {form.bonkTurbo === "on" ? "On" : "Off"}</button><button type="button">▣ Save Config</button><button type="button">Load Config⌄</button><button type="button">← Back</button></div></div>
    <div className="bonk-board">
      {!walletConnected ? <div className="bonk-wallet-callout"><span>⌁</span><h3>Wallet Connection Required</h3><p>Please connect your wallet to create a token</p></div> : <div className="bonk-form-grid">
        <div className="bonk-form"><div className="native-kicker">TOKEN DETAILS</div><div className="two"><Field label="Token name" value={form.name} onChange={(v) => update("name", v.slice(0, 32))} placeholder="Name your token"/><Field label="Symbol" value={form.symbol} onChange={(v) => update("symbol", v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))} placeholder="BONK"/></div><label className="field"><span>Description</span><textarea value={form.description} onChange={(event) => update("description", event.target.value.slice(0, 500))} placeholder="Describe your token" rows={4}/></label><div className="three"><Field label="Website" value={form.website} onChange={(v) => update("website", v)} placeholder="https://"/><Field label="X" value={form.twitter} onChange={(v) => update("twitter", v)} placeholder="https://x.com/"/><Field label="Telegram" value={form.telegram} onChange={(v) => update("telegram", v)} placeholder="https://t.me/"/></div><div className="two"><Field label="First buy (SOL)" value={form.initialBuy} onChange={(v) => update("initialBuy", v)} placeholder="0"/><Select label="Launch mode" value={form.bonkTurbo} onChange={(v) => update("bonkTurbo", v)} options={[["off", "Classic"], ["on", "Turbo"]]}/></div></div>
        <aside><div className="native-kicker">TOKEN PREVIEW</div><NativeArtwork preview={preview} onImage={onImage} clearImage={clearImage}/><h3>{form.name || "Your token"}</h3><p>{form.symbol ? `$${form.symbol}` : "$TOKEN"}</p><NativeLaunchButton walletConnected={walletConnected} onLaunch={onLaunch} label="Create token"/></aside>
      </div>}
    </div>
    {!walletConnected ? <NativeLaunchButton walletConnected={walletConnected} onLaunch={onLaunch} label="Create token"/> : null}
  </section>;
}

function StonkLaunch({ form, update, preview, onImage, clearImage, walletConnected, onLaunch }: NativeFormProps) {
  const reward = form.stonkMode === "reward";
  return <section className="native-launch stonk-native">
    <div className="native-brand"><ProviderLogo id="stonk"/><strong>StonkFun</strong><span>LAUNCHLAB ROUTE</span></div><div className="stonk-heading"><h2>Launch a token</h2><p>Create a fixed-supply token with a one-sided Raydium market quoted against a meme, stock, currency, commodity or any other token.</p></div>
    <div className="stonk-grid"><div className="stonk-form">
      <div className="native-label">Launch on</div><span className="stonk-pill">LaunchLab</span>
      <div className="native-label">Fee model</div><div className="wide-tabs"><button type="button" className={!reward ? "chosen" : ""} onClick={() => update("stonkMode", "standard")}>Standard token</button><button type="button" className={reward ? "chosen" : ""} onClick={() => update("stonkMode", "reward")}>Reward token</button></div>
      <div className="native-label">Holder rewards tax</div><div className="choice-row">{[["0","None"],["100","1%"],["300","3%"]].map(([value,label]) => <button type="button" key={value} className={form.stonkTax === value ? "chosen" : ""} onClick={() => update("stonkTax", value)}>{label}</button>)}</div><p>A standard token carries no transfer tax. Pick a rate to launch a reward token instead.</p>
      <div className="stonk-info">ⓘ Your token launches on a bonding curve with no upfront liquidity. It trades against the curve until 85 SOL is raised, then graduates automatically into a Raydium pool.</div>
      <div className="stonk-divider"/><div className="stonk-row-head"><div><div className="native-label">Dev buy</div><p>Optional. Buy up to 75% of supply as the pool&apos;s first trade.</p></div><div className="choice-row"><button type="button" className="chosen">% of supply</button><button type="button">SOL amount</button></div></div><input className="stonk-range" type="range" min="0" max="75" value={Number(form.stonkDevBuy) || 0} onChange={(event) => update("stonkDevBuy", event.target.value)} aria-label="Dev buy percentage"/><div className="range-labels"><span>0%</span><span>75%</span></div>
      <div className="stonk-divider"/><div className="two"><Field label="Token name" value={form.name} onChange={(v) => update("name", v.slice(0, 32))} placeholder="e.g. NVDA Doge"/><Field label="Symbol" value={form.symbol} onChange={(v) => update("symbol", v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))} placeholder="e.g. NVDGE"/></div>
      <div className="native-label artwork-label">Token image</div><NativeArtwork preview={preview} onImage={onImage} clearImage={clearImage}/>
      <div className="stonk-divider"/><div className="native-label">Project links</div><p>Optional. Saved in the token&apos;s permanent metadata.</p><div className="three"><Field label="Website" value={form.website} onChange={(v) => update("website", v)} placeholder="https://www.stonkfun.xyz/"/><Field label="X / Twitter" value={form.twitter} onChange={(v) => update("twitter", v)} placeholder="https://x.com/project"/><Field label="Telegram" value={form.telegram} onChange={(v) => update("telegram", v)} placeholder="https://t.me/project"/></div>
      <div className="stonk-divider"/><div className="native-label">Quote token</div><p>The launch token will trade against this quote token.</p><div className="quote-tabs"><span>xStocks</span><span>PreStocks</span><span>Currencies</span><span className="chosen">Solana</span><span>Custom</span></div><Select label="Pair" value={form.stonkQuote} onChange={(v) => update("stonkQuote", v)} options={stonkPairs.map(([value,label]) => [value,label])}/>
    </div><aside className="stonk-summary"><h3>Launch summary</h3>{[["Launchpad","LaunchLab"],["Graduates at","85 SOL raised"],["Supply","1 billion"],["Trading fee","1.25%"],["Transfer tax → holders",form.stonkTax === "0" ? "None" : form.stonkTax === "100" ? "1%" : "3%"],["Curve fee → you earn","0.5% per trade"],["Launch cost","~0.012 SOL"]].map(([label,value]) => <div className="summary-row" key={label}><span>{label}</span><strong>{value}</strong></div>)}<small>network rent only — no router fee</small><div className="summary-notes">♙ Liquidity is permanently locked with Burn &amp; Earn.<br/><br/>◉ Image and metadata are stored permanently on Arweave.</div><NativeLaunchButton walletConnected={walletConnected} onLaunch={onLaunch} label="Launch token"/></aside></div>
  </section>;
}

function ProviderOptions({ id, form, update }: { id: ProviderId; form: LaunchForm; update: (key: keyof LaunchForm, value: string) => void }) {
  if (id === "pump") return <article className="option-card pump-card"><OptionHead id={id}/><div className="option-grid"><Select label="Pool liquidity pair" value={form.pumpPair} onChange={(value) => update("pumpPair", value)} options={[["SOL", "SOL"]]}/><Field label="First buy (SOL)" value={form.initialBuy} onChange={(value) => update("initialBuy", value)} placeholder="0"/></div><p>Creator rewards can be shared on Pump after creation. Mayhem stays off for deterministic routing.</p></article>;
  if (id === "bonk") return <article className="option-card bonk-card"><OptionHead id={id}/><div className="option-grid"><Select label="Turbo" value={form.bonkTurbo} onChange={(value) => update("bonkTurbo", value)} options={[["off", "Turbo off"], ["on", "Turbo on"]]}/><Field label="First buy (SOL)" value={form.initialBuy} onChange={(value) => update("initialBuy", value)} placeholder="0"/></div><p>Creates through BONK’s public Raydium LaunchLab configuration and graduates to Raydium AMM.</p></article>;
  if (id === "stonk") return <article className="option-card stonk-card"><OptionHead id={id}/><div className="option-grid"><Select label="Fee model" value={form.stonkMode} onChange={(value) => update("stonkMode", value)} options={[["standard", "Standard token"], ["reward", "Reward token"]]}/><Select label="Holder rewards tax" value={form.stonkTax} onChange={(value) => update("stonkTax", value)} options={[["0", "None"], ["100", "1%"], ["300", "3%"]]}/><Select label="Quote token" value={form.stonkQuote} onChange={(value) => update("stonkQuote", value)} options={stonkPairs.map(([value, label]) => [value, label])}/><Field label="Dev buy (% supply)" value={form.stonkDevBuy} onChange={(value) => update("stonkDevBuy", value)} placeholder="0"/></div><p>Atomic StonkFun launch: payment, fixed-supply mint, first trade and LaunchLab pool land together or not at all.</p></article>;
  if (id === "ember") return <article className="option-card ember-card"><OptionHead id={id}/><div className="option-grid"><Select label="Pair" value={form.emberQuote} onChange={(value) => update("emberQuote", value)} options={emberPairs.map(([value, label]) => [value, label])}/><Select label="Trade tax" value={form.emberFee} onChange={(value) => update("emberFee", value)} options={[["100", "1%"], ["200", "2%"], ["300", "3%"]]}/><Select label="Graduation" value={form.emberGraduate} onChange={(value) => update("emberGraduate", value)} options={[["25000", "$25,000"], ["35000", "$35,000"], ["40000", "$40,000"]]}/><Select label="Fee destination" value={form.emberMode} onChange={(value) => update("emberMode", value)} options={[["holders", "Holder rewards"], ["diamond", "Diamond Hands"], ["vault", "Milestone Vault"], ["burn", "Buyback & burn"], ["keep", "Keep it"]]}/><Select label="Payout currency" value={form.emberPayout} onChange={(value) => update("emberPayout", value)} options={[["quote", "Selected pair"], ["sol", "SOL"], ["ember", "EMBER"]]}/><Select label="Sniper Shield" value={form.emberShield} onChange={(value) => update("emberShield", value)} options={[["off", "Off"], ["on", "On"]]}/><Select label="Volatility Dividend" value={form.emberVolatility} onChange={(value) => update("emberVolatility", value)} options={[["off", "Off"], ["on", "On"]]}/><Select label="Graduation airdrop" value={form.emberAirdrop} onChange={(value) => update("emberAirdrop", value)} options={[["off", "Off"], ["on", "5%"]]}/></div><p>Launches on Ember’s Meteora curve. The selected fee module and economics are validated by Ember before your wallet signs.</p></article>;
  if (id === "otc") return <article className="option-card otc-card"><OptionHead id={id}/><div className="option-grid"><Select label="Launch on" value={form.otcVenue} onChange={(value) => update("otcVenue", value)} options={[["pump", "Pump"], ["meteora", "Meteora (verification pending)"]]}/><Select label="Paired with" value={form.otcPair} onChange={(value) => { update("otcPair", value); update("otcPairSymbol", otcPairs.find(([mint]) => mint === value)?.[1] || "CUSTOM"); }} options={otcPairs.map(([value, symbol, name]) => [value, `${symbol} · ${name}`])}/><Select label="Your first buy" value="0" onChange={() => update("initialBuy", "0")} options={[["0", "None · adapter verification"]]}/></div><div className="split-bar"><span style={{width:"67.5%"}}>Holders 67.5%</span><span style={{width:"10%"}}>Desks</span><span style={{width:"22.5%"}}>Other</span></div><p>Two wallet confirmations: create the paired Pump V2 coin, then lock its creator-fee routing to OTC.</p></article>;
  if (id === "bags") return <article className="option-card bags-card"><OptionHead id={id}/><div className="option-grid"><Field label="Bags config key" value={form.bagsConfigKey} onChange={(value) => update("bagsConfigKey", value)} placeholder="Launch config public key"/><Field label="First buy (SOL)" value={form.initialBuy} onChange={(value) => update("initialBuy", value)} placeholder="0"/></div><p>The backend needs a Bags developer key; the key stays server-side and your wallet signs the returned transaction.</p></article>;
  return <article className={`option-card ${id}-card gated-card`}><OptionHead id={id}/><p>This adapter is present but intentionally disabled until the current SDK-built transaction passes mainnet simulation and a funded confirmation test.</p></article>;
}

function ProviderLogo({ id }: { id: ProviderId }) { const provider = providerById[id]; return <span className="provider-mark" style={{ background: provider.accent, color: provider.ink }}><span className="provider-fallback" aria-hidden="true">{provider.short}</span><img src={provider.logo} alt={`${provider.name} logo`} onError={(event) => { event.currentTarget.style.display = "none"; }}/></span>; }
function OptionHead({ id }: { id: ProviderId }) { const provider = providerById[id]; return <header><ProviderLogo id={id}/><div><strong>{provider.name}</strong><small>{provider.live ? "Transaction route enabled" : "Verification gate"}</small></div></header>; }
function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) { return <label className="field"><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder}/></label>; }
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: readonly (readonly [string, string])[] }) { return <label className="field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([option, name]) => <option key={option} value={option}>{name}</option>)}</select></label>; }
function RouteIcon({ state }: { state: RouteState }) { if (["preparing", "approval", "confirming"].includes(state)) return <LoaderCircle className="spin" size={18}/>; if (state === "success") return <Check size={18}/>; if (state === "failed") return <CircleAlert size={18}/>; return null; }
export function WalletButton() { return <WalletMultiButton/>; }
