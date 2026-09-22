# Anything Solana

A zero-router-fee Solana launch workspace that reuses one token form across independent launchpads while keeping provider-specific options and wallet approvals explicit.

## Routes

- Pump.fun — official create transaction builder
- StonkFun — public prepare/sign/submit API
- Ember — provider-native metadata plus Meteora curve prepare/sign/submit flow
- BONK.fun — Raydium LaunchLab SDK and BONK platform configuration
- Bags — official prefilled launch-intent flow, with API v2 transaction building used automatically when `BAGS_API_KEY` is available
- OTC — wallet-signed Pump V2 custom-quote launch plus OTC fee routing
- Raydium — official SDK v2 LaunchLab transaction builder
- Meteora — official DBC SDK config-and-pool transaction builder

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
