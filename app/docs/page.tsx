import { Header } from "@/components/header";
import { providers } from "@/lib/providers";

const requirements: Record<string, string> = {
  pump: "Square image, metadata, SOL fee and optional first buy",
  stonk: "Quote pair, standard/reward mode, optional tax and dev buy",
  ember: "Quote pair, trade tax, graduation level and fee destination",
  bonk: "Image, BONK LaunchLab config, SOL fee and optional first buy",
  bags: "Prefilled official Bags form, then review and launch on Bags",
  otc: "Pump venue, approved reward pair and two wallet approvals",
  raydium: "Metadata, SOL network fee and optional first buy",
  meteora: "Metadata and one config + pool wallet approval",
};

export default function Docs() {
  return <><Header/><main className="docs">
    <div className="docs-hero"><span className="eyebrow">DOCUMENTATION</span><h1>One form. Independent Solana launches.</h1><p>Anything Solana reuses your token identity while preserving each launchpad’s own economics, transaction and wallet confirmation. Anything takes 0%.</p></div>
    <section><h2>How multi-launch works</h2><ol>
      <li><b>Connect once.</b><span>Choose Phantom, Solflare, Backpack, Trust Wallet or another compatible Solana wallet.</span></li>
      <li><b>Enter token information once.</b><span>Name, ticker, image, description, website, X and Telegram are reused across every selected route.</span></li>
      <li><b>Review native settings.</b><span>Each selected launchpad gets its own visual panel containing only the controls its current launch flow needs.</span></li>
      <li><b>Approve each launch.</b><span>Routes are independent. OTC requires two confirmations; most routes require one. Rejecting one does not cancel another.</span></li>
      <li><b>Confirm and save.</b><span>Mint addresses and all transaction signatures are stored only after confirmation and linked to Solscan.</span></li>
    </ol></section>
    <section><h2>Current integration surface</h2><div className="docs-table"><div className="table-head"><span>Launchpad</span><span>Integration method</span><span>Launch requirement</span></div>{providers.map((provider) => <div className="table-row" key={provider.id}><strong>{provider.name}</strong><span>{provider.method}</span><span>{requirements[provider.id]}</span></div>)}</div><p className="docs-note">Connected means the adapter either builds the provider transaction for your wallet or hands a validated launch intent to the provider’s official form. A real launch is complete only after you review, sign and confirm it on mainnet.</p></section>
    <section><h2>Provider behavior</h2><div className="unsupported">
      <article><strong>Pump.fun</strong><p>Uploads permanent token metadata, requests the official create transaction and submits the wallet-signed version to Solana.</p></article>
      <article><strong>BONK.fun</strong><p>Uses Raydium’s maintained SDK, live LaunchLab config API and BONK platform address. BONK supplies the mint signature; your wallet remains fee payer.</p></article>
      <article><strong>StonkFun</strong><p>Uses its keyless public prepare → sign → submit flow. A processing result is polled and never repaid.</p></article>
      <article><strong>Ember</strong><p>Uploads metadata through Ember, prepares its Meteora curve launch with the selected fee module, and submits only after your wallet signs.</p></article>
      <article><strong>OTC</strong><p>Creates a custom-quote Pump V2 coin, then asks for a second signature to assign creator fees to OTC’s reward wallet before registration.</p></article>
      <article><strong>Bags</strong><p>Uses Bags’ official launch-intent format to open a prefilled Bags form with the token name, ticker, description, artwork and social links. Review its fee mode and first buy on Bags before launching.</p></article>
      <article><strong>Raydium</strong><p>Builds a standard SOL LaunchLab token through Raydium SDK v2 using the live on-chain LaunchLab configuration and an optional first buy.</p></article>
      <article><strong>Meteora</strong><p>Uses Meteora’s official DBC SDK to create a new 1B-supply token, DBC configuration and DAMM v2 graduation pool in one wallet-signed transaction.</p></article>
      <article><strong>Retry safety</strong><p>Confirmed routes are skipped. Failed routes can be retried on their own without starting successful launches again.</p></article>
    </div></section>
    <section><h2>Fees, security and launch risk</h2><p>Every venue keeps its provider, pool and network fees. Anything takes no fee and never requests a private key. Always read every wallet simulation: token creation is irreversible, provider APIs can change, and a launch may require more SOL than the displayed network estimate.</p></section>
  </main></>;
}
