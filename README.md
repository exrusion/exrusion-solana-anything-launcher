# Anything Solana

A zero-router-fee Solana launch workspace that reuses one token form across independent launchpads while keeping provider-specific options and wallet approvals explicit.

## Routes

- Pump.fun — official create transaction builder
- StonkFun — public prepare/sign/submit API
- Ember — provider-native metadata plus Meteora curve prepare/sign/submit flow
- BONK.fun — Raydium LaunchLab SDK and BONK platform configuration
- Bags — Bags API v2 (requires `BAGS_API_KEY`)
- OTC — wallet-signed Pump V2 custom-quote launch plus OTC fee routing
- Raydium standalone and Meteora DBC — visible but verification-gated

## Local development

```bash
npm install
npm run dev
```

In another terminal:

```bash
npm run server
```

Copy `.env.example` to `.env.local` for local development. `NEXT_PUBLIC_API_URL` can point at the separate local API process; production uses the same Railway origin. Railway uses `PORT`, `WEB_ORIGIN`, `SOLANA_RPC_URL`, `DATABASE_URL`, `EMBER_API_BASE`, and optionally `BAGS_API_KEY`.

## Verification

```bash
npm run typecheck
npm run build
```

The router never requests private keys. Every launch transaction is presented to the connected wallet, submitted independently, confirmed on Solana, and recorded with its mint and signatures. Provider fees remain unchanged; the router takes 0%.
