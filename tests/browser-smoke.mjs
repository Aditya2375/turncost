import { run } from "../web/src/model.js";
import { spawn } from "node:child_process";
import {
  writeFileSync,
  readFileSync,
  mkdirSync,
  existsSync,
  rmSync,
  mkdtempSync,
} from "node:fs";

const HTTP_PORT = 8987;
const CDP_PORT = 9388;
const SHOTS = process.env.SMOKE_SHOTS === "1";
const root = new URL("..", import.meta.url).pathname;

const profile = mkdtempSync("/tmp/turncost-chrome-");
const server = spawn(
  "python3",
  [
    "-m",
    "http.server",
    String(HTTP_PORT),
    "--bind",
    "127.0.0.1",
    "--directory",
    `${root}docs`,
  ],
  { stdio: "ignore", detached: true },
);
const chrome = spawn(
  "google-chrome",
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore", detached: true },
);

const cleanup = async (code) => {
  for (const child of [chrome, server]) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
  }
  await Promise.all(
    [chrome, server].map((child) =>
      child.exitCode !== null
        ? Promise.resolve()
        : new Promise((r) => child.once("exit", r)),
    ),
  );
  rmSync(profile, { recursive: true, force: true });
  process.exit(code);
};
const timeout = setTimeout(() => {
  console.error("smoke: timeout");
  cleanup(1);
}, 90000);
process.on("SIGINT", () => cleanup(2));
process.on("uncaughtException", (e) => {
  console.error(e);
  cleanup(1);
});
process.on("unhandledRejection", (e) => {
  console.error(e);
  cleanup(1);
});

async function waitFor(fn, label, timeoutMs = 60000) {
  const start = Date.now();
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    if (Date.now() - start > timeoutMs)
      throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok, detail });
  console.log(
    `${ok ? "ok" : "NOT OK"} - ${name}${detail ? " - " + detail : ""}`,
  );
};

await waitFor(
  async () => (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).ok,
  "chrome devtools",
);
const target = await (
  await fetch(`http://127.0.0.1:${CDP_PORT}/json/new`, { method: "PUT" })
).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

let mid = 0;
const rpcPending = new Map();
const consoleErrors = [];
const requests = [];
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.method === "Network.requestWillBeSent")
    requests.push(msg.params.request.url);
  if (msg.id && rpcPending.has(msg.id)) {
    rpcPending.get(msg.id)(msg);
    rpcPending.delete(msg.id);
  } else if (msg.method === "Runtime.exceptionThrown")
    consoleErrors.push(
      msg.params.exceptionDetails?.exception?.description ?? "page exception",
    );
};
const cdp = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++mid;
    rpcPending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const res = await cdp("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.result?.exceptionDetails)
    throw new Error(JSON.stringify(res.result.exceptionDetails));
  return res.result?.result?.value;
};
const shot = async (name) => {
  if (!SHOTS) return;
  await new Promise((r) => setTimeout(r, 900));
  const metrics = await cdp("Page.getLayoutMetrics");
  const size = metrics.result.cssContentSize;
  const r = await cdp("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: size.width, height: size.height, scale: 1 },
  });
  writeFileSync(
    `${root}smoke-${name}.png`,
    Buffer.from(r.result.data, "base64"),
  );
};

await cdp("Runtime.enable");
await cdp("Network.enable");
await cdp("Page.enable");
await cdp("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});
const url = process.env.SMOKE_URL || `http://127.0.0.1:${HTTP_PORT}/`;
await cdp("Page.navigate", { url });
await waitFor(
  async () =>
    await evaluate(`document.querySelectorAll('#ledger tr').length===360`),
  "rendered",
);
const input = (id, value) =>
    evaluate(
      `document.getElementById(${JSON.stringify(id)}).value=${JSON.stringify(String(value))};document.getElementById(${JSON.stringify(id)}).dispatchEvent(new Event('input',{bubbles:true}));true`,
    ),
  submit = () =>
    evaluate(`document.getElementById('controls').requestSubmit();true`);
const f = (v, d = 6) => (v === null ? "N/A" : v.toFixed(d)),
  pct = (v) => (v * 100).toFixed(2) + "%";
async function verify(p, selected, label) {
  const r = run(p),
    row = r.rows[selected - 1],
    d = await evaluate(
      `({head:Object.fromEntries(['net','free','drag','fees'].map(k=>[k,document.getElementById(k).textContent])),rows:[...document.querySelectorAll('#ledger tr')].map(r=>[...r.cells].map(c=>c.textContent)),inspect:[...document.querySelectorAll('#inspect dd')].map(x=>x.textContent),identity:document.getElementById('identity').textContent,selected:document.querySelector('#ledger tr.selected').dataset.period,charts:['equity','signal'].map(id=>{const s=document.getElementById(id);return{id,w:Math.max(200,Math.floor(s.getBoundingClientRect().width)),paths:[...s.querySelectorAll('path')].map(x=>x.getAttribute('d')),dots:[...s.querySelectorAll('circle')].map(x=>[+x.getAttribute('cx'),+x.getAttribute('cy')]),bands:[...s.querySelectorAll('rect')].filter(x=>x.getAttribute('fill')==='#276448').length}})})`,
    );
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  check(
    label + "head",
    eq(d.head, {
      net: pct(r.net),
      free: pct(r.noFeeNet),
      drag: (r.drag * 100).toFixed(2) + " pp",
      fees: r.totalFees.toFixed(4) + " u",
    }),
  );
  check(
    label + "all4320ledgerCells",
    eq(
      d.rows,
      r.rows.map((x) => [
        String(x.period),
        x.signal === null ? "N/A" : f(x.signal * 100),
        f(x.assetReturn * 100),
        x.exposure ? "Long" : "Cash",
        x.action,
        ...[
          x.traded,
          x.fee,
          x.totalFees,
          x.shares,
          x.cash,
          x.equity,
          x.noFeeEquity,
        ].map((v) => f(v)),
      ]),
    ),
  );
  check(
    label + "inspection",
    eq(d.inspect, [
      row.signal === null
        ? "N/A · warm-up"
        : (row.signal * 100).toFixed(4) + "%",
      (row.assetReturn * 100).toFixed(4) + "%",
      row.exposure ? "Long" : "Cash",
      row.action,
      f(row.traded) + " u",
      f(row.fee) + " u",
      f(row.shares),
      f(row.cash) + " u",
    ]),
  );
  check(
    label + "identity",
    d.identity ===
      `Capital ${f(row.equity)} = 1 + gross P&L ${f(row.grossPnl)} − fees ${f(row.totalFees)} units. No-fee capital ${f(row.noFeeEquity)}.`,
  );
  check(label + "highlight", d.selected === String(selected));
  for (const c of d.charts) {
    const equity = c.id === "equity",
      series = equity
        ? [
            [1, ...r.rows.map((x) => x.equity)],
            [1, ...r.rows.map((x) => x.noFeeEquity)],
          ]
        : [[null, ...r.rows.map((x) => x.signal)]],
      vals = series.flat().filter(Number.isFinite);
    if (!equity) vals.push(p.threshold, 0);
    let lo = Math.min(...vals),
      hi = Math.max(...vals),
      pad = (hi - lo) * 0.12 || 0.02;
    lo -= pad;
    hi += pad;
    const bottom = (equity ? 240 : 200) - 34,
      x = (i) => 62 + (i / 360) * (c.w - 77),
      y = (v) => bottom - ((v - lo) / (hi - lo)) * (bottom - 14);
    let ok = c.paths.length === series.length;
    for (let k = 0; k < series.length; k++) {
      const points = [...c.paths[k].matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map(
          (m) => [+m[1], +m[2]],
        ),
        expected = series[k].map((v, i) => [i, v]).filter((v) => v[1] !== null);
      ok &&=
        points.length === expected.length &&
        points.every(
          (v, i) =>
            Math.abs(v[0] - x(expected[i][0])) <= 0.00501 &&
            Math.abs(v[1] - y(expected[i][1])) <= 0.00501,
        );
    }
    check(label + c.id + "allPathCoordinates", ok);
    const v = series[0][selected];
    check(
      label + c.id + "selectedMarker",
      v === null
        ? c.dots.length === 0
        : c.dots.length === 1 &&
            Math.abs(c.dots[0][0] - x(selected)) < 1e-7 &&
            Math.abs(c.dots[0][1] - y(v)) < 1e-7,
    );
    if (!equity) check(label + "longBand", c.bands === r.invested);
  }
}
const base = {
  seed: 2026,
  scenario: "trend",
  lookback: 60,
  threshold: 0,
  feeBps: 10,
};
await verify(base, 360, "default");
await shot("default");
await input("period", 60);
await verify(base, 60, "warmupBoundary");
await input("period", 61);
await verify(base, 61, "firstEligible");
await shot("first");
await input("seed", 4294967295);
await verify(base, 61, "dirty");
await input("fee", 101);
await submit();
check(
  "invalidRetains",
  await evaluate(
    `document.getElementById('fee').getAttribute('aria-invalid')==='true'&&document.getElementById('status').textContent.includes('unchanged')`,
  ),
);
await verify(base, 61, "invalid");
await input("fee", 100);
await input("lookback", 20);
await input("scenario", "chop");
await input("threshold", 1);
await submit();
const chop = {
  seed: 4294967295,
  scenario: "chop",
  lookback: 20,
  threshold: 0.01,
  feeBps: 100,
};
await verify(chop, 61, "chop");
await shot("chop");
await input("scenario", "flat");
await submit();
await verify({ ...chop, scenario: "flat" }, 61, "flat");
check(
  "flatNoStale",
  await evaluate(
    `document.getElementById('net').textContent==='0.00%'&&document.querySelectorAll('#signal rect').length===1`,
  ),
);
await shot("flat");
await input("scenario", "trend");
await input("threshold", 0);
await input("fee", 0);
await input("lookback", 120);
await input("seed", 1);
await submit();
const zero = {
  seed: 1,
  scenario: "trend",
  lookback: 120,
  threshold: 0,
  feeBps: 0,
};
await input("period", 360);
await verify(zero, 360, "zeroFee");
check(
  "zeroFeeEquals",
  await evaluate(
    `document.getElementById('net').textContent===document.getElementById('free').textContent&&document.getElementById('fees').textContent==='0.0000 u'`,
  ),
);
for (const id of ["seed", "threshold", "fee"]) {
  await input(id, "");
  await submit();
  check(
    "blank" + id,
    await evaluate(
      `document.getElementById(${JSON.stringify(id)}).getAttribute('aria-invalid')==='true'`,
    ),
  );
  await input(id, id === "seed" ? 1 : 0);
}
await submit();
for (const [width, height] of [
  [768, 1000],
  [390, 844],
  [360, 780],
  [320, 800],
]) {
  await cdp("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 600,
  });
  await new Promise((r) => setTimeout(r, 300));
  check(
    "pageBounds" + width,
    await evaluate(`document.documentElement.scrollWidth<=innerWidth`),
  );
  check(
    "metricsBounds" + width,
    await evaluate(
      `[...document.querySelectorAll('.metrics strong')].every(x=>x.getBoundingClientRect().right<=innerWidth-10)`,
    ),
  );
  check(
    "svgBounds" + width,
    await evaluate(
      `[...document.querySelectorAll('svg')].every(x=>x.getBoundingClientRect().right<=innerWidth&&x.getBoundingClientRect().width>200)`,
    ),
  );
  await verify(zero, 360, "mobile" + width);
  if (width === 320) {
    await shot("mobile-plots");
    await evaluate(`document.querySelector('details').open=true;true`);
    check(
      "ledgerBounded320",
      await evaluate(
        `document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.table-scroll').scrollWidth>document.querySelector('.table-scroll').clientWidth&&document.querySelector('.table-scroll').scrollHeight>document.querySelector('.table-scroll').clientHeight`,
      ),
    );
    await shot("mobile-ledger");
  }
}
check("noExceptions", consoleErrors.length === 0, consoleErrors.join(";"));
check(
  "sameOriginOnly",
  requests.every(
    (x) => x.startsWith(new URL(url).origin) || x === "about:blank",
  ),
  requests.filter((x) => !x.startsWith(new URL(url).origin)).join(";"),
);
check(
  "noStorage",
  await evaluate(`localStorage.length===0&&sessionStorage.length===0`),
);
check(
  "csp",
  await evaluate(
    `document.querySelector('meta[http-equiv="Content-Security-Policy"]').content.includes("connect-src 'none'")`,
  ),
);
writeFileSync(`${root}browser-checks.json`, JSON.stringify(checks, null, 2));
console.log(
  `${checks.length} Chrome checks, ${checks.filter((x) => !x.ok).length} failures`,
);
clearTimeout(timeout);
await cleanup(checks.every((x) => x.ok) ? 0 : 1);
