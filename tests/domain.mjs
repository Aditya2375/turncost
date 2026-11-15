import assert from "node:assert/strict";
import { run, generate, simulate } from "../web/src/model.js";
let n = 0;
const ck = (x) => {
    assert(x);
    n++;
  },
  eq = (a, b) => ck(Math.abs(a - b) < 1e-10 * Math.max(1, Math.abs(b)));
for (const seed of [1, 2026, 4294967295])
  for (const scenario of ["trend", "chop", "flat"])
    for (const lookback of [20, 60, 120]) {
      const a = generate(seed, scenario),
        r = simulate(a, lookback, 0.01, 5);
      for (let c = lookback; c < 359; c += 23) {
        const b = [...a];
        for (let i = c + 1; i < 360; i++) b[i] = i % 2 === 0 ? 0.05 : -0.05;
        const x = simulate(b, lookback, 0.01, 5);
        for (let i = 0; i <= c; i++)
          ck(JSON.stringify(r.rows[i]) === JSON.stringify(x.rows[i]));
      }
      const free = simulate(a, lookback, 0.01, 0),
        cost = simulate(a, lookback, 0.01, 100);
      for (let i = 0; i < 360; i++) {
        ck(
          r.rows[i].exposure === free.rows[i].exposure &&
            free.rows[i].exposure === cost.rows[i].exposure,
        );
        ck(
          r.rows[i].action === free.rows[i].action &&
            free.rows[i].action === cost.rows[i].action,
        );
        ck(
          cost.rows[i].equity <= r.rows[i].equity + 1e-12 &&
            r.rows[i].equity <= free.rows[i].equity + 1e-12,
        );
        eq(r.rows[i].equity, 1 + r.rows[i].grossPnl - r.rows[i].totalFees);
        if (i >= lookback) {
          const expected =
            a.slice(i - lookback, i).reduce((v, r) => v * (1 + r), 1) - 1;
          eq(r.rows[i].signal, expected);
          ck(r.rows[i].exposure === (expected > 0.01 ? 1 : 0));
        }
      }
    }
const growth = simulate(Array(360).fill(0.01), 20, 0, 100);
eq(growth.rows[20].fee, 0.01 / 1.01);
eq(growth.rows.at(-1).equity, (Math.pow(1.01, 340) * 0.99) / 1.01);
ck(growth.drag > growth.totalFees);
ck(
  growth.rows.at(-1).action === "Terminal sell" &&
    growth.rows.at(-1).shares === 0,
);
const loss = Array(360).fill(0.01);
loss[20] = -0.05;
const x = simulate(loss, 20, 0, 0);
ck(x.rows[20].exposure === 1);
eq(x.rows[20].equity, 0.95); // current bad return cannot change exposure chosen from the prior window.
for (const p of [
  { seed: 0 },
  { lookback: 21 },
  { threshold: 0.11 },
  { feeBps: -1 },
  { threshold: NaN },
  { scenario: "bad" },
])
  assert.throws(() =>
    run({
      seed: 1,
      scenario: "trend",
      lookback: 20,
      threshold: 0,
      feeBps: 5,
      ...p,
    }),
  );
console.log(
  `${n} causal-prefix/compounding/fees/monotonicity/domain checks passed`,
);

const terminal = Array(360).fill(0);
terminal[358] = 0.01;
terminal[359] = 0.02;
const lastEntry = simulate(terminal, 20, 0, 100);
ck(
  lastEntry.entries === 1 && lastEntry.exits === 1 && lastEntry.invested === 1,
);
ck(lastEntry.rows[359].action === "Buy + terminal sell");
eq(lastEntry.rows[359].equity, (1.02 * 0.99) / 1.01);
eq(lastEntry.rows[359].fee, 0.01 / 1.01 + (1.02 * 0.01) / 1.01);
eq(lastEntry.rows[359].traded, 1 / 1.01 + 1.02 / 1.01);
console.log("5 analytic last-period entry/dual-fee checks passed");
