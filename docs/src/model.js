export const N = 360;
export function generate(seed, mode) {
  if (
    !Number.isInteger(seed) ||
    seed < 1 ||
    seed > 4294967295 ||
    !["trend", "chop", "flat"].includes(mode)
  )
    throw Error("Invalid generator inputs");
  let x = seed >>> 0;
  const next = () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) / 4294967296) * 2 - 1;
  };
  return Array.from({ length: N }, (_, i) => {
    const u = next();
    return mode === "flat"
      ? 0
      : mode === "chop"
        ? (i % 2 === 0 ? 0.009 : -0.009) + 0.003 * u
        : (i < 120 ? 0.002 : i < 240 ? -0.002 : 0.002) + 0.008 * u;
  });
}
export function run(p) {
  if (!p) throw Error("Missing inputs");
  return simulate(
    generate(p.seed, p.scenario),
    p.lookback,
    p.threshold,
    p.feeBps,
  );
}
export function simulate(returns, lookback, threshold, feeBps) {
  if (
    !Array.isArray(returns) ||
    returns.length !== N ||
    ![20, 60, 120].includes(lookback) ||
    !Number.isFinite(threshold) ||
    threshold < 0 ||
    threshold > 0.1 ||
    !Number.isFinite(feeBps) ||
    feeBps < 0 ||
    feeBps > 100 ||
    returns.some((r) => !Number.isFinite(r) || r < -0.05 || r > 0.05)
  )
    throw Error("Invalid inputs");
  const price = [100];
  for (const r of returns) price.push(price.at(-1) * (1 + r));
  let cash = 1,
    q = 0,
    free = 1,
    fees = 0,
    gross = 0,
    peak = 1,
    maxDrawdown = 0,
    state = 0,
    entries = 0,
    exits = 0,
    invested = 0;
  const c = feeBps / 10000,
    rows = [];
  for (let i = 0; i < N; i++) {
    let signal = null,
      target = 0;
    if (i >= lookback) {
      signal = price[i] / price[i - lookback] - 1;
      target = signal > threshold ? 1 : 0;
    }
    let action = i < lookback ? "Warm-up" : "Hold cash",
      traded = 0,
      fee = 0;
    if (target !== state) {
      if (target === 1) {
        const newQ = cash / (price[i] * (1 + c));
        traded = newQ * price[i];
        fee = traded * c;
        cash = 0;
        q = newQ;
        state = 1;
        entries++;
        action = "Buy";
      } else {
        traded = q * price[i];
        fee = traded * c;
        cash = traded - fee;
        q = 0;
        state = 0;
        exits++;
        action = "Sell";
      }
    } else if (state === 1) action = "Hold shares";
    fees += fee;
    gross += q * (price[i + 1] - price[i]);
    if (state === 1) {
      free *= 1 + returns[i];
      invested++;
    }
    const exposure = state;
    if (i === N - 1 && state === 1) {
      const t = q * price[i + 1],
        f = t * c;
      traded += t;
      fee += f;
      fees += f;
      cash = t - f;
      q = 0;
      state = 0;
      exits++;
      action = action === "Buy" ? "Buy + terminal sell" : "Terminal sell";
    }
    const equity = cash + q * price[i + 1];
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, 1 - equity / peak);
    rows.push({
      period: i + 1,
      startPrice: price[i],
      endPrice: price[i + 1],
      assetReturn: returns[i],
      signal,
      exposure,
      action,
      traded,
      fee,
      totalFees: fees,
      shares: q,
      cash,
      equity,
      noFeeEquity: free,
      grossPnl: gross,
    });
  }
  const equity = rows.at(-1).equity;
  return {
    entries,
    exits,
    invested,
    totalFees: fees,
    grossPnl: gross,
    net: equity - 1,
    noFeeNet: free - 1,
    drag: free - equity,
    maxDrawdown,
    rows,
  };
}
