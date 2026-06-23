import { config } from "../config.js";

// Live USDT/BRL rate with a short in-memory cache (the "USDT/BRL" field in the cart).
let cached: { value: number; at: number } | null = null;
const TTL_MS = 60_000;

export async function getUsdtBrl(): Promise<number> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;

  let value = 5.2; // safe fallback if the source is unreachable
  try {
    if (config.rates.source === "binance") {
      const res = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=USDTBRL");
      if (res.ok) {
        const json = (await res.json()) as { price?: string };
        if (json.price) value = Number(json.price);
      }
    }
  } catch (err) {
    console.warn("[rates] failed to fetch USDT/BRL, using fallback:", err);
  }

  cached = { value, at: Date.now() };
  return value;
}
