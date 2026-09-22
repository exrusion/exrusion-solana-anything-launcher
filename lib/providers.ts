export type ProviderId = "pump" | "stonk" | "ember" | "bonk" | "bags" | "otc" | "raydium" | "meteora";

export type Provider = {
  id: ProviderId;
  name: string;
  short: string;
  logo: string;
  method: string;
  accent: string;
  ink: string;
  live: boolean;
  confirmations: number;
  url: string;
};

export const providers: readonly Provider[] = [
  { id: "pump", name: "Pump.fun", short: "P", logo: "https://pump.fun/pump-logomark.svg", method: "Official create transaction", accent: "#4de58a", ink: "#082b18", live: true, confirmations: 1, url: "https://pump.fun/create" },
  { id: "stonk", name: "StonkFun", short: "S", logo: "https://www.stonkfun.xyz/stonk-mark.svg", method: "Official public launch API", accent: "#6bff8c", ink: "#071d0d", live: true, confirmations: 1, url: "https://www.stonkfun.xyz/launch" },
  { id: "ember", name: "Ember", short: "E", logo: "https://embercurve.fun/apple-touch-icon.png", method: "Meteora curve + fee modules", accent: "#ff825c", ink: "#351b14", live: true, confirmations: 1, url: "https://embercurve.fun" },
  { id: "bonk", name: "BONK.fun", short: "B!", logo: "https://www.bonk.fun/logos/bonk_fun.png", method: "Official Raydium LaunchLab", accent: "#ffd83d", ink: "#211a00", live: true, confirmations: 1, url: "https://www.bonk.fun/create" },
  { id: "bags", name: "Bags", short: "B", logo: "https://bags.fm/icon.png?e952db43040dbe33", method: "Official Bags API v2", accent: "#ef77bc", ink: "#291020", live: true, confirmations: 1, url: "https://bags.fm" },
  { id: "otc", name: "OTC", short: "OTC", logo: "https://otcdesks.cash/otc-icon.svg", method: "Wallet-signed Pump V2 adapter", accent: "#d7ff67", ink: "#112015", live: true, confirmations: 2, url: "https://otcdesks.cash/launcher" },
  { id: "raydium", name: "Raydium", short: "R", logo: "https://raydium.io/favicon.ico", method: "Official LaunchLab SDK", accent: "#978cff", ink: "#17102e", live: true, confirmations: 1, url: "https://raydium.io/launchpad" },
  { id: "meteora", name: "Meteora", short: "M", logo: "https://launch.meteora.ag/favicon.ico", method: "Official DBC SDK", accent: "#ffad56", ink: "#2b1606", live: true, confirmations: 1, url: "https://launch.meteora.ag" },
] as const;

export const providerById = Object.fromEntries(providers.map((provider) => [provider.id, provider])) as Record<ProviderId, Provider>;
