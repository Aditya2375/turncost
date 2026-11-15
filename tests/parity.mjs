import { run } from "../web/src/model.js";
import { execFileSync } from "node:child_process";
let n = 0,
  max = 0;
function same(a, b, path = "") {
  if (typeof a === "number") {
    n++;
    const d = Math.abs(a - b) / Math.max(1, Math.abs(a));
    max = Math.max(max, d);
    if (d > 2e-10) throw Error(`${path}: ${a} ${b}`);
  } else if (Array.isArray(a)) {
    if (a.length !== b.length) throw Error("length");
    a.forEach((v, i) => same(v, b[i], path + i + "."));
  } else if (a && typeof a === "object") {
    if (Object.keys(a).join() != Object.keys(b).join()) throw Error("keys");
    Object.keys(a).forEach((k) => same(a[k], b[k], path + k + "."));
  } else {
    n++;
    if (a !== b) throw Error(path + " value");
  }
}
for (const seed of [1, 2, 2026, 2147483648, 4294967295])
  for (const scenario of ["trend", "chop", "flat"])
    for (const [lookback, threshold, feeBps] of [
      [20, 0, 0],
      [60, 0.01, 5],
      [120, 0.1, 100],
    ]) {
      const p = { seed, scenario, lookback, threshold, feeBps };
      same(
        run(p),
        JSON.parse(
          execFileSync(
            process.env.JAVA || "java",
            [
              "-cp",
              "build/classes",
              "Dump",
              String(seed),
              scenario,
              String(lookback),
              String(threshold),
              String(feeBps),
            ],
            { encoding: "utf8", maxBuffer: 8e6 },
          ),
        ),
      );
    }
console.log(`${n} full Java/JS values maxscaled ${max}`);
