import "dotenv/config";
import cors from "cors";
import express from "express";
import multer from "multer";
import next from "next";
import { Pool } from "pg";
import { z } from "zod";
import BN from "bn.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  LAUNCHPAD_PROGRAM,
  LaunchpadConfig,
  Raydium,
  TxVersion,
  getPdaLaunchpadConfigId,
  txToBase64,
} from "@raydium-io/raydium-sdk-v2";
import {
  DynamicBondingCurveClient,
  buildCurve,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import { PUMP_SDK, feeSharingConfigPda } from "@pump-fun/pump-sdk";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const port = Number(process.env.PORT || 8787);
const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
const allowedOrigins = (process.env.WEB_ORIGIN || "http://localhost:3000").split(",").map((item) => item.trim());
const emberApiBase = String(process.env.EMBER_API_BASE || "https://embercurve.fun").replace(/\/$/, "");
const OTC_ORIGIN = "https://otcdesks.cash";
const OTC_REWARD_WALLET = new PublicKey(process.env.OTC_REWARD_WALLET || "2k5hrzuykwyTbUe8L7UriYAQhr5hijNLgBvEB4B9pP5y");
const PUMP_PROGRAM_ID = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const PUMP_AMM_PROGRAM_ID = new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA");

app.use(cors({ origin: allowedOrigins.includes("*") ? true : allowedOrigins, methods: ["GET", "POST", "OPTIONS"] }));
app.use(express.json({ limit: "8mb" }));

const db = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === "production" && !process.env.DATABASE_URL.includes("railway.internal") ? { rejectUnauthorized: false } : undefined }) : null;
const launchInput = z.object({
  name: z.string().min(1).max(64), symbol: z.string().min(1).max(13), description: z.string().min(1).max(1000),
  website: z.string().optional(), twitter: z.string().optional(), telegram: z.string().optional(),
  metadataUri: z.string().min(1), imageUri: z.string().optional(), logo: z.string().max(7_000_000).optional(),
  wallet: z.string().min(32).max(64), initialBuyLamports: z.number().int().nonnegative(), bagsConfigKey: z.string().optional(),
  bonkTurbo: z.string().optional(), stonkQuote: z.string().optional(), stonkMode: z.string().optional(), stonkTax: z.string().optional(), stonkDevBuy: z.string().optional(),
  emberQuote: z.string().optional(), emberFee: z.string().optional(), emberGraduate: z.string().optional(), emberMode: z.string().optional(), emberPayout: z.string().optional(),
  emberShield: z.string().optional(), emberVolatility: z.string().optional(), emberAirdrop: z.string().optional(),
  otcPair: z.string().optional(), otcPairSymbol: z.string().optional(), otcVenue: z.string().optional(),
});

async function initializeDatabase() {
  if (!db) return;
  await db.query(`CREATE TABLE IF NOT EXISTS launches (
    id BIGSERIAL PRIMARY KEY, provider TEXT NOT NULL, wallet TEXT NOT NULL, mint TEXT NOT NULL,
    signature TEXT UNIQUE NOT NULL, signatures JSONB NOT NULL DEFAULT '[]', name TEXT NOT NULL,
    symbol TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await db.query("ALTER TABLE launches ADD COLUMN IF NOT EXISTS signatures JSONB NOT NULL DEFAULT '[]'");
}

async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 60_000) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const nested = data.error as { message?: string; code?: string } | string | undefined;
    const message = typeof nested === "string" ? nested : nested?.message;
    throw Object.assign(new Error(message || `Provider returned HTTP ${response.status}`), { status: response.status, code: typeof nested === "object" ? nested?.code : undefined });
  }
  return data;
}

function dataOf<T>(payload: Record<string, unknown>) { return (payload.data || payload) as T; }
function connection() { return new Connection(rpcUrl, "confirmed"); }

function imageBlob(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) throw new Error("A valid token image is required.");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error("The token image must be 5 MB or smaller.");
  return { blob: new Blob([Uint8Array.from(bytes)], { type: match[1] }), type: match[1] };
}

app.get("/health", async (_request, response) => {
  let rpc = false;
  try { await connection().getLatestBlockhash("confirmed"); rpc = true; } catch { rpc = false; }
  response.status(rpc ? 200 : 503).json({ ok: rpc, network: "solana-mainnet", feeBps: 0, storage: db ? "postgres" : "memory", adapters: ["pump", "stonk", "ember", "bonk", "bags", "otc", "raydium", "meteora"] });
});

app.get("/api/providers", async (_request, response) => {
  let stonkLive = false;
  try { const stats = dataOf<{ config?: { apiLaunchesEnabled?: boolean } }>(await fetchJson("https://www.stonkfun.xyz/api/public/v1/stats", {}, 5_000)); stonkLive = Boolean(stats.config?.apiLaunchesEnabled); } catch { stonkLive = false; }
  response.json({ providers: [
    { id: "pump", preparation: "enabled", method: "pump.fun create transaction" },
    { id: "stonk", preparation: stonkLive ? "enabled" : "provider_unavailable", method: "StonkFun public v1" },
    { id: "ember", preparation: "enabled", method: "Ember Meteora launch API" },
    { id: "bonk", preparation: "enabled", method: "Raydium SDK + BONK platform config" },
    { id: "bags", preparation: process.env.BAGS_API_KEY ? "enabled" : "needs_api_key", method: "Bags API v2" },
    { id: "otc", preparation: "enabled", method: "Pump SDK V2 + OTC fee assignment" },
    { id: "raydium", preparation: "enabled", method: "Raydium LaunchLab SDK v2" },
    { id: "meteora", preparation: "enabled", method: "Meteora DBC SDK" },
  ] });
});

app.post("/api/metadata", upload.single("image"), async (request, response) => {
  try {
    if (!request.file) return response.status(400).json({ error: "Token image is required." });
    const form = new FormData();
    form.append("file", new Blob([Uint8Array.from(request.file.buffer)], { type: request.file.mimetype }), request.file.originalname);
    for (const key of ["name", "symbol", "description", "website", "twitter", "telegram"]) form.append(key, request.body[key] || "");
    form.append("showName", "true");
    const pumpResponse = await fetchJson("https://pump.fun/api/ipfs", { method: "POST", body: form });
    const metadataUri = String(pumpResponse.metadataUri || (pumpResponse.metadata as { uri?: string } | undefined)?.uri || "");
    const imageUri = String((pumpResponse.metadata as { image?: string } | undefined)?.image || pumpResponse.imageUri || "");
    if (!metadataUri) throw new Error("Pump metadata storage did not return a metadata URI.");
    response.json({ metadataUri, imageUri });
  } catch (error) { response.status(502).json({ error: error instanceof Error ? error.message : "Metadata upload failed." }); }
});

app.post("/api/prepare/pump", async (request, response) => {
  try {
    const input = launchInput.parse(request.body);
    const data = await fetchJson("https://fun-block.pump.fun/agents/create-coin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user: input.wallet, feePayer: input.wallet, creator: input.wallet, name: input.name, symbol: input.symbol, uri: input.metadataUri, solLamports: String(input.initialBuyLamports), encoding: "base64", mayhemMode: false, cashback: false, tokenizedAgent: false, frontRunningProtection: false }) });
    response.json({ transaction: data.transaction, mint: data.mintPublicKey, encoding: "base64", version: "v0", provider: "pump" });
  } catch (error) { response.status(422).json({ error: error instanceof Error ? error.message : "Pump preparation failed." }); }
});

app.post("/api/prepare/stonk", async (request, response) => {
  try {
    const input = launchInput.parse(request.body);
    if (!input.logo) return response.status(400).json({ error: "StonkFun requires the original token image." });
    const devBuy = Number(input.stonkDevBuy || 0);
    const body: Record<string, unknown> = {
      creatorWallet: input.wallet, quoteMint: input.stonkQuote, name: input.name, symbol: input.symbol,
      mode: input.stonkMode === "reward" ? "reward" : "standard", logo: input.logo,
      website: input.website || undefined, twitter: input.twitter || undefined, telegram: input.telegram || undefined,
    };
    if (devBuy > 0) body.devBuyPercent = devBuy;
    if (input.stonkMode === "reward" && Number(input.stonkTax)) body.transferFeeBps = Number(input.stonkTax);
    const prepared = dataOf<{ paymentTransaction: string; signedQuote: string; payment?: unknown }>(await fetchJson("https://www.stonkfun.xyz/api/public/v1/launches/prepare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
    response.json({ kind: "stonk", transaction: prepared.paymentTransaction, signedQuote: prepared.signedQuote, payment: prepared.payment });
  } catch (error) { response.status(422).json({ error: error instanceof Error ? error.message : "StonkFun preparation failed." }); }
});

app.post("/api/submit/stonk", async (request, response) => {
  try {
    const body = z.object({ signedQuote: z.string().min(10), signedTransaction: z.string().min(20), logo: z.string().min(20) }).parse(request.body);
    const submitted = dataOf<Record<string, unknown>>(await fetchJson("https://www.stonkfun.xyz/api/public/v1/launches/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
    response.json(submitted);
  } catch (error) {
    const status = (error as { status?: number }).status === 409 ? 409 : 422;
    response.status(status).json({ error: error instanceof Error ? error.message : "StonkFun submission failed.", charged: false });
  }
});

app.get("/api/status/stonk/:signature", async (request, response) => {
  try { response.json(dataOf(await fetchJson(`https://www.stonkfun.xyz/api/public/v1/launches/${encodeURIComponent(request.params.signature)}`))); }
  catch (error) { response.status(502).json({ error: error instanceof Error ? error.message : "StonkFun status failed." }); }
});

app.post("/api/prepare/ember", async (request, response) => {
  try {
    const input = launchInput.parse(request.body);
    if (!input.logo) return response.status(400).json({ error: "Ember requires the original token image." });
    const image = imageBlob(input.logo);
    const imageForm = new FormData();
    imageForm.append("file", image.blob, `token.${image.type.split("/")[1] || "png"}`);
    const uploaded = await fetchJson(`${emberApiBase}/api/upload/image`, { method: "POST", body: imageForm });
    const imageUrl = String(uploaded.url || dataOf<{ url?: string }>(uploaded).url || "");
    if (!imageUrl) throw new Error("Ember image upload did not return a URL.");
    const metadataPayload = await fetchJson(`${emberApiBase}/api/upload/metadata`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: input.name, symbol: input.symbol, description: input.description, image: imageUrl, website: input.website || "", x: input.twitter || "", telegram: input.telegram || "" }),
    });
    const uri = String(metadataPayload.uri || dataOf<{ uri?: string }>(metadataPayload).uri || "");
    if (!uri) throw new Error("Ember metadata upload did not return a URI.");
    const feeBps = [100, 200, 300].includes(Number(input.emberFee)) ? Number(input.emberFee) : 200;
    const graduateUsd = [25000, 35000, 40000].includes(Number(input.emberGraduate)) ? Number(input.emberGraduate) : 35000;
    const prepared = dataOf<Record<string, unknown>>(await fetchJson(`${emberApiBase}/api/solana/launch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "prepare",
        creatorWallet: input.wallet,
        name: input.name,
        symbol: input.symbol,
        uri,
        image: imageUrl,
        description: input.description,
        links: { website: input.website || "", x: input.twitter || "", telegram: input.telegram || "" },
        quoteMint: input.emberQuote || "So11111111111111111111111111111111111111112",
        feeBps,
        graduateUsd,
        mode: input.emberMode || "holders",
        splits: [],
        holdersBps: 10_000,
        payInQuote: input.emberPayout !== "sol",
        payMint: input.emberPayout === "ember" ? "EMBER" : undefined,
        addons: { shield: input.emberShield === "on", volatilityFee: input.emberVolatility === "on", airdropPct: input.emberAirdrop === "on" ? 5 : 0 },
      }),
    }));
    if (!prepared.transaction || !prepared.launchId) throw new Error("Ember did not return a launch transaction.");
    response.json({ kind: "ember", transaction: prepared.transaction, launchId: prepared.launchId, mint: prepared.mint || prepared.mintAddress });
  } catch (error) { response.status(422).json({ error: error instanceof Error ? error.message : "Ember preparation failed." }); }
});

app.post("/api/submit/ember", async (request, response) => {
  try {
    const body = z.object({ launchId: z.string().min(1), signedTransaction: z.string().min(20) }).parse(request.body);
    response.json(dataOf(await fetchJson(`${emberApiBase}/api/solana/launch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "submit", launchId: body.launchId, signedTransaction: body.signedTransaction }),
    })));
  } catch (error) { response.status(422).json({ error: error instanceof Error ? error.message : "Ember submission failed." }); }
});

type RayConfig = { key: { pubKey: string; index: number; mintB: string; tradeFeeRate: string; epoch: string; curveType: number; migrateFee: string; maxShareFeeRate: string; minSupplyA: string; maxLockRate: string; minSellRateA: string; minMigrateRateA: string; minFundRaisingB: string; protocolFeeOwner: string; migrateFeeOwner: string; migrateToAmmWallet: string; migrateToCpmmWallet: string }; mintInfoB: { decimals: number; programId: string }; defaultParams: { supplyInit: string; totalSellA: string; totalFundRaisingB: string } };

app.post("/api/prepare/bonk", async (request, response) => {
  try {
    const input = launchInput.parse(request.body);
    if (!input.imageUri) return response.status(400).json({ error: "BONK.fun requires an uploaded token image." });
    const configPayload = dataOf<{ data: RayConfig[] }>(await fetchJson("https://launch-mint-v1.raydium.io/main/configs"));
    const row = configPayload.data.find((item) => item.key.mintB === "So11111111111111111111111111111111111111112" && item.key.curveType === 0);
    if (!row) throw new Error("BONK's current SOL LaunchLab configuration is unavailable.");
    const configInfo: ReturnType<typeof LaunchpadConfig.decode> = {
      index: row.key.index, mintB: new PublicKey(row.key.mintB), tradeFeeRate: new BN(row.key.tradeFeeRate), epoch: new BN(row.key.epoch), curveType: row.key.curveType,
      migrateFee: new BN(row.key.migrateFee), maxShareFeeRate: new BN(row.key.maxShareFeeRate), minSupplyA: new BN(row.key.minSupplyA), maxLockRate: new BN(row.key.maxLockRate), minSellRateA: new BN(row.key.minSellRateA), minMigrateRateA: new BN(row.key.minMigrateRateA), minFundRaisingB: new BN(row.key.minFundRaisingB),
      protocolFeeOwner: new PublicKey(row.key.protocolFeeOwner), migrateFeeOwner: new PublicKey(row.key.migrateFeeOwner), migrateToAmmWallet: new PublicKey(row.key.migrateToAmmWallet), migrateToCpmmWallet: new PublicKey(row.key.migrateToCpmmWallet),
    };
    const imageResponse = await fetch(input.imageUri, { signal: AbortSignal.timeout(30_000) });
    if (!imageResponse.ok) throw new Error("Could not retrieve the uploaded token image for BONK.fun.");
    const image = await imageResponse.blob();
    const mintForm = new FormData();
    const mintFields = { wallet: input.wallet, name: input.name, symbol: input.symbol, website: input.website || "", twitter: input.twitter || "", telegram: input.telegram || "", configId: row.key.pubKey, decimals: "6", supply: row.defaultParams.supplyInit, totalSellA: row.defaultParams.totalSellA, totalFundRaisingB: row.defaultParams.totalFundRaisingB, totalLockedAmount: "0", cliffPeriod: "0", unlockPeriod: "0", platformId: "8pCtbn9iatQ8493mDQax4xfEUjhoVBpUWYVQoRU18333", migrateType: "amm", description: input.description };
    Object.entries(mintFields).forEach(([key, value]) => mintForm.append(key, value));
    mintForm.append("file", image, "token-image.png");
    const mintPayload = dataOf<{ mint: string; metadataLink: string }>(await fetchJson("https://launch-mint-v1.raydium.io/create/get-random-mint", { method: "POST", headers: { "ray-token": `token-${Date.now()}` }, body: mintForm }));
    const rpc = connection();
    const raydium = await Raydium.load({ owner: new PublicKey(input.wallet), connection: rpc, cluster: "mainnet", disableFeatureCheck: true, disableLoadToken: true, blockhashCommitment: "confirmed" });
    const created = await raydium.launchpad.createLaunchpad({
      programId: LAUNCHPAD_PROGRAM, mintA: new PublicKey(mintPayload.mint), decimals: 6, name: input.name, symbol: input.symbol, uri: mintPayload.metadataLink,
      configId: new PublicKey(row.key.pubKey), configInfo, migrateType: "amm", mintBDecimals: row.mintInfoB.decimals, mintBProgram: new PublicKey(row.mintInfoB.programId),
      platformId: new PublicKey("8pCtbn9iatQ8493mDQax4xfEUjhoVBpUWYVQoRU18333"), txVersion: TxVersion.V0, slippage: new BN(100), buyAmount: new BN(input.initialBuyLamports), createOnly: input.initialBuyLamports === 0,
      supply: new BN(row.defaultParams.supplyInit), totalSellA: new BN(row.defaultParams.totalSellA), totalFundRaisingB: new BN(row.defaultParams.totalFundRaisingB), totalLockedAmount: new BN(0), cliffPeriod: new BN(0), unlockPeriod: new BN(0),
    });
    const mintSignedPayload = await fetchJson("https://launch-mint-v1.raydium.io/create/sendTransaction", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ txs: created.transactions.map((transaction) => txToBase64(transaction)) }) });
    const signedData = dataOf<{ tx?: string; txs?: string[] }>(mintSignedPayload);
    const txs = signedData.txs || (signedData.tx ? [signedData.tx] : []);
    if (!txs.length) throw new Error("BONK.fun did not return a mint-signed transaction.");
    response.json({ mint: mintPayload.mint, transactions: txs.map((transaction, index) => ({ transaction, encoding: "base64", version: "v0", label: index ? `BONK transaction ${index + 1}` : "Create BONK.fun token" })) });
  } catch (error) { response.status(422).json({ error: error instanceof Error ? error.message : "BONK.fun preparation failed." }); }
});

app.post("/api/prepare/raydium", async (request, response) => {
  try {
    const input = launchInput.parse(request.body);
    const rpc = connection();
    const owner = new PublicKey(input.wallet);
    const mint = Keypair.generate();
    const configId = getPdaLaunchpadConfigId(LAUNCHPAD_PROGRAM, NATIVE_MINT, 0, 0).publicKey;
    const configAccount = await rpc.getAccountInfo(configId, "confirmed");
    if (!configAccount) throw new Error("Raydium's main SOL LaunchLab configuration is unavailable.");
    const configInfo = LaunchpadConfig.decode(configAccount.data);
    const configPayload = dataOf<{ data: RayConfig[] }>(await fetchJson("https://launch-mint-v1.raydium.io/main/configs"));
    const apiConfig = configPayload.data.find((item) => item.key.pubKey === configId.toBase58());
    if (!apiConfig) throw new Error("Raydium's LaunchLab API did not return its main SOL configuration.");
    const raydium = await Raydium.load({ owner, connection: rpc, cluster: "mainnet", disableFeatureCheck: true, disableLoadToken: true, blockhashCommitment: "confirmed" });
    (raydium.api as unknown as { fetchLaunchConfigs: () => Promise<unknown[]> }).fetchLaunchConfigs = async () => [apiConfig];
    const created = await raydium.launchpad.createLaunchpad({
      programId: LAUNCHPAD_PROGRAM,
      mintA: mint.publicKey,
      decimals: 6,
      name: input.name,
      symbol: input.symbol,
      uri: input.metadataUri,
      configId,
      configInfo,
      migrateType: "amm",
      mintBDecimals: 9,
      mintBProgram: TOKEN_PROGRAM_ID,
      txVersion: TxVersion.V0,
      slippage: new BN(100),
      buyAmount: new BN(input.initialBuyLamports),
      createOnly: input.initialBuyLamports === 0,
      extraSigners: [mint],
    });
    const transactions = created.transactions.map((transaction, index) => ({
      transaction: txToBase64(transaction),
      encoding: "base64",
      version: "v0",
      label: index ? `Raydium transaction ${index + 1}` : "Create Raydium LaunchLab token",
    }));
    if (!transactions.length) throw new Error("Raydium did not build a launch transaction.");
    response.json({ mint: mint.publicKey.toBase58(), transactions, provider: "raydium" });
  } catch (error) { response.status(422).json({ error: error instanceof Error ? error.message : "Raydium preparation failed." }); }
});

app.post("/api/prepare/meteora", async (request, response) => {
  try {
    const input = launchInput.parse(request.body);
    const rpc = connection();
    const payer = new PublicKey(input.wallet);
    const config = Keypair.generate();
    const baseMint = Keypair.generate();
    const curve = buildCurve({
      percentageSupplyOnMigration: 20,
      migrationQuoteThreshold: 10,
      token: { totalTokenSupply: 1_000_000_000, tokenBaseDecimal: 6, tokenQuoteDecimal: 9, tokenType: 0, tokenAuthorityOption: 1, leftover: 0 },
      fee: {
        baseFeeParams: { baseFeeMode: 0, feeSchedulerParam: { startingFeeBps: 100, endingFeeBps: 100, numberOfPeriod: 0, totalDuration: 0 } },
        dynamicFeeEnabled: true,
        collectFeeMode: 0,
        creatorTradingFeePercentage: 50,
        poolCreationFee: 0,
        enableFirstSwapWithMinFee: false,
      },
      migration: { migrationOption: 1, migrationFeeOption: 3, migrationFee: { feePercentage: 0, creatorFeePercentage: 0 } },
      liquidityDistribution: { partnerLiquidityPercentage: 0, creatorLiquidityPercentage: 90, partnerPermanentLockedLiquidityPercentage: 0, creatorPermanentLockedLiquidityPercentage: 10 },
      lockedVesting: { totalLockedVestingAmount: 0, numberOfVestingPeriod: 0, cliffUnlockAmount: 0, totalVestingDuration: 0, cliffDurationFromMigrationTime: 0 },
      activationType: 1,
    });
    const dbc = DynamicBondingCurveClient.create(rpc, "confirmed");
    const transaction = await dbc.partner.createConfigAndPool({
      ...curve,
      config: config.publicKey,
      quoteMint: NATIVE_MINT,
      feeClaimer: payer,
      leftoverReceiver: payer,
      payer,
      preCreatePoolParam: { name: input.name, symbol: input.symbol, uri: input.metadataUri, poolCreator: payer, baseMint: baseMint.publicKey },
    });
    const { blockhash } = await rpc.getLatestBlockhash("confirmed");
    transaction.feePayer = payer;
    transaction.recentBlockhash = blockhash;
    transaction.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_200_000 }));
    transaction.partialSign(config, baseMint);
    response.json({
      mint: baseMint.publicKey.toBase58(),
      transaction: transaction.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"),
      encoding: "base64",
      version: "legacy",
      provider: "meteora",
    });
  } catch (error) { response.status(422).json({ error: error instanceof Error ? error.message : "Meteora preparation failed." }); }
});

function creatorVaults(sharingConfig: PublicKey) {
  return [PublicKey.findProgramAddressSync([Buffer.from("creator-vault"), sharingConfig.toBuffer()], PUMP_PROGRAM_ID)[0], PublicKey.findProgramAddressSync([Buffer.from("creator_vault"), sharingConfig.toBuffer()], PUMP_AMM_PROGRAM_ID)[0]];
}

app.post("/api/prepare/otc", async (request, response) => {
  try {
    const input = launchInput.parse(request.body);
    if (input.otcVenue !== "pump") return response.status(503).json({ error: "OTC Meteora is still behind its funded verification gate. Choose Pump." });
    if (!input.otcPair) return response.status(400).json({ error: "Choose an OTC reward pair." });
    const rpc = connection();
    const user = new PublicKey(input.wallet);
    const quoteMint = new PublicKey(input.otcPair);
    const quoteAccount = await rpc.getAccountInfo(quoteMint, "confirmed");
    if (!quoteAccount) throw new Error("The selected OTC pair is not readable on Solana.");
    const quoteProgram = quoteAccount.owner;
    if (!quoteProgram.equals(TOKEN_PROGRAM_ID) && !quoteProgram.equals(TOKEN_2022_PROGRAM_ID)) throw new Error("The selected pair uses an unsupported token program.");
    const mint = Keypair.generate();
    const createIx = await PUMP_SDK.createV2Instruction({ mint: mint.publicKey, name: input.name, symbol: input.symbol, uri: input.metadataUri, creator: user, user, mayhemMode: false, quoteMint, quoteTokenProgram: quoteProgram, creatorFeeBps: new BN(100) });
    const sharingConfig = feeSharingConfigPda(mint.publicKey);
    const sharingIx = await PUMP_SDK.createFeeSharingConfig({ creator: user, mint: mint.publicKey, pool: null });
    const updateIx = await PUMP_SDK.updateFeeSharesV2({ authority: user, mint: mint.publicKey, currentShareholders: [user], newShareholders: [{ address: OTC_REWARD_WALLET, shareBps: 10_000 }], quoteMint, quoteTokenProgram: quoteProgram });
    const owners = [...creatorVaults(sharingConfig), user, OTC_REWARD_WALLET];
    const ataIxs = owners.map((owner) => createAssociatedTokenAccountIdempotentInstruction(user, getAssociatedTokenAddressSync(quoteMint, owner, true, quoteProgram, ASSOCIATED_TOKEN_PROGRAM_ID), owner, quoteMint, quoteProgram, ASSOCIATED_TOKEN_PROGRAM_ID));
    const { blockhash } = await rpc.getLatestBlockhash("confirmed");
    const make = (instructions: TransactionInstruction[]) => new VersionedTransaction(new TransactionMessage({ payerKey: user, recentBlockhash: blockhash, instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), ...instructions] }).compileToV0Message());
    const createTx = make([createIx]); createTx.sign([mint]);
    const feeTx = make([sharingIx, ...ataIxs, updateIx]);
    response.json({ mint: mint.publicKey.toBase58(), transactions: [
      { transaction: Buffer.from(createTx.serialize()).toString("base64"), encoding: "base64", version: "v0", label: `Create Pump coin paired with ${input.otcPairSymbol || "selected token"}` },
      { transaction: Buffer.from(feeTx.serialize()).toString("base64"), encoding: "base64", version: "v0", label: "Assign creator fees to OTC rewards" },
    ], finalize: { mint: mint.publicKey.toBase58(), pairMint: input.otcPair, pairSymbol: input.otcPairSymbol || "CUSTOM" } });
  } catch (error) { response.status(422).json({ error: error instanceof Error ? error.message : "OTC preparation failed." }); }
});

app.post("/api/finalize/otc", async (request, response) => {
  try {
    const body = z.object({ mint: z.string(), pairMint: z.string(), pairSymbol: z.string(), signatures: z.array(z.string()).min(2), wallet: z.string(), name: z.string(), symbol: z.string(), description: z.string(), twitter: z.string().optional(), metadataUri: z.string(), imageUri: z.string().optional() }).parse(request.body);
    await fetchJson(`${OTC_ORIGIN}/api/coins`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mint: body.mint, name: body.name, symbol: body.symbol, uri: body.metadataUri, image: body.imageUri, description: body.description, rewardMint: body.pairMint, rewardSymbol: body.pairSymbol, pairMint: body.pairMint, pairSymbol: body.pairSymbol, creator: body.wallet, createTx: body.signatures[0], twitter: body.twitter || "" }) });
    response.json({ ok: true, liveUrl: `${OTC_ORIGIN}/coin/${body.mint}` });
  } catch (error) { response.status(502).json({ error: error instanceof Error ? error.message : "OTC registration failed." }); }
});

app.post("/api/prepare/bags", async (request, response) => {
  try {
    if (!process.env.BAGS_API_KEY) return response.status(503).json({ error: "Bags needs BAGS_API_KEY on Railway." });
    const input = launchInput.parse(request.body);
    const headers = { "x-api-key": process.env.BAGS_API_KEY };
    const infoForm = new FormData();
    Object.entries({ name: input.name, symbol: input.symbol, description: input.description, metadataUrl: input.metadataUri, website: input.website || "", twitter: input.twitter || "", telegram: input.telegram || "" }).forEach(([key, value]) => infoForm.append(key, value));
    const info = await fetchJson("https://public-api-v2.bags.fm/api/v1/token-launch/create-token-info", { method: "POST", headers, body: infoForm });
    const details = (info.response || info.data || {}) as { tokenMint?: string; tokenMetadata?: string; tokenLaunch?: { uri?: string } };
    if (!details.tokenMint) throw new Error("Bags did not return a token mint.");
    const configPayload = await fetchJson("https://public-api-v2.bags.fm/api/v1/fee-share/config", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ payer: input.wallet, baseMint: details.tokenMint, claimersArray: [input.wallet], basisPointsArray: [10_000] }),
    });
    const config = dataOf<{ meteoraConfigKey?: string; transactions?: Array<{ transaction: string }>; bundles?: Array<Array<{ transaction: string }>> }>(configPayload);
    if (!config.meteoraConfigKey) throw new Error("Bags did not return a fee-share configuration.");
    const configTransactions = [...(config.transactions || []), ...(config.bundles || []).flat()].map((item, index) => ({ transaction: item.transaction, encoding: "base58", version: "v0", label: `Create Bags fee-share config ${index + 1}` }));
    response.json({
      kind: "bags",
      mint: details.tokenMint,
      metadataUri: details.tokenMetadata || details.tokenLaunch?.uri || input.metadataUri,
      configKey: config.meteoraConfigKey,
      configTransactions,
    });
  } catch (error) { response.status(422).json({ error: error instanceof Error ? error.message : "Bags preparation failed." }); }
});

app.post("/api/prepare/bags-launch", async (request, response) => {
  try {
    if (!process.env.BAGS_API_KEY) return response.status(503).json({ error: "Bags needs BAGS_API_KEY on Railway." });
    const input = z.object({ tokenMint: z.string().min(32), metadataUri: z.string().min(1), wallet: z.string().min(32), initialBuyLamports: z.number().int().nonnegative(), configKey: z.string().min(32) }).parse(request.body);
    const launch = await fetchJson("https://public-api-v2.bags.fm/api/v1/token-launch/create-launch-transaction", {
      method: "POST",
      headers: { "x-api-key": process.env.BAGS_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({ ipfs: input.metadataUri, tokenMint: input.tokenMint, wallet: input.wallet, initialBuyLamports: input.initialBuyLamports, configKey: input.configKey }),
    });
    const transaction = String(launch.response || launch.data || "");
    if (!transaction) throw new Error("Bags did not return a launch transaction.");
    response.json({ transaction, mint: input.tokenMint, encoding: "base58", version: "v0", provider: "bags" });
  } catch (error) { response.status(422).json({ error: error instanceof Error ? error.message : "Bags launch preparation failed." }); }
});

app.post("/api/prepare/:provider", (request, response) => response.status(503).json({ error: `${request.params.provider} is intentionally gated until its current official SDK route passes mainnet simulation and confirmation.` }));

app.post("/api/launches", async (request, response) => {
  try {
    const input = z.object({ provider: z.string(), wallet: z.string(), mint: z.string(), signature: z.string(), signatures: z.array(z.string()).optional(), name: z.string(), symbol: z.string() }).parse(request.body);
    if (db) await db.query("INSERT INTO launches(provider,wallet,mint,signature,signatures,name,symbol) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(signature) DO NOTHING", [input.provider, input.wallet, input.mint, input.signature, JSON.stringify(input.signatures || [input.signature]), input.name, input.symbol]);
    response.status(201).json({ ok: true, explorer: `https://solscan.io/tx/${input.signature}` });
  } catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : "Could not save launch." }); }
});

app.get("/api/launches", async (request, response) => {
  if (!db) return response.json({ launches: [] });
  const wallet = String(request.query.wallet || "");
  const result = await db.query("SELECT provider,wallet,mint,signature,signatures,name,symbol,created_at FROM launches WHERE ($1 = '' OR wallet = $1) ORDER BY created_at DESC LIMIT 100", [wallet]);
  response.json({ launches: result.rows });
});

async function start() {
  await initializeDatabase();
  const nextApp = next({ dev: process.env.NODE_ENV !== "production" });
  await nextApp.prepare();
  const nextHandler = nextApp.getRequestHandler();
  app.use((request, response) => nextHandler(request, response));
  app.listen(port, "0.0.0.0", () => console.log(`Anything Solana listening on ${port}`));
}

start().catch((error) => { console.error(error); process.exit(1); });
