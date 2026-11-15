import { run } from "./model.js";
const $ = (id) => document.getElementById(id),
  ns = "http://www.w3.org/2000/svg";
let current = null,
  params = null;
const num = (v, d = 6) => v.toFixed(d),
  pct = (v, d = 2) => (v * 100).toFixed(d) + "%",
  el = (tag, attrs = {}, text) => {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    if (text !== undefined) e.textContent = text;
    return e;
  };
function draw(id, series, threshold = null) {
  const svg = $(id);
  for (const n of [...svg.children])
    if (!["title", "desc"].includes(n.tagName)) n.remove();
  const w = Math.max(200, Math.floor(svg.getBoundingClientRect().width)),
    h = id === "equity" ? 240 : 200,
    left = 62,
    right = w - 15,
    top = 14,
    bottom = h - 34,
    width = right - left,
    x = (t) => left + (t / 360) * width;
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  let values = series.flatMap((s) => s.data.filter(Number.isFinite));
  if (threshold !== null) values.push(threshold, 0);
  let lo = Math.min(...values),
    hi = Math.max(...values),
    pad = (hi - lo) * 0.12 || 0.02;
  lo -= pad;
  hi += pad;
  const y = (v) => bottom - ((v - lo) / (hi - lo)) * (bottom - top);
  svg.append(
    el("rect", {
      x: left,
      y: top,
      width: x(params.lookback) - left,
      height: bottom - top,
      fill: "#eceee7",
    }),
  );
  for (let i = 0; i < 3; i++) {
    const v = lo + ((hi - lo) * i) / 2;
    svg.append(
      el("line", {
        x1: left,
        x2: right,
        y1: y(v),
        y2: y(v),
        stroke: "#d3d5ce",
      }),
      el(
        "text",
        { x: left - 10, y: y(v) + 4, "text-anchor": "end" },
        id === "equity" ? v.toFixed(2) : (100 * v).toFixed(1) + "%",
      ),
    );
  }
  for (const t of [0, 120, 240, 360])
    svg.append(
      el(
        "text",
        {
          x: x(t),
          y: h - 9,
          "text-anchor": t === 0 ? "start" : t === 360 ? "end" : "middle",
        },
        String(t),
      ),
    );
  if (threshold !== null)
    svg.append(
      el("line", {
        x1: left,
        x2: right,
        y1: y(threshold),
        y2: y(threshold),
        stroke: "#97472d",
        "stroke-dasharray": "5 5",
      }),
    );
  for (const s of series) {
    let d = "";
    s.data.forEach((v, i) => {
      if (v === null) return;
      d += (d ? " L" : "M") + x(i).toFixed(2) + " " + y(v).toFixed(2);
    });
    svg.append(
      el("path", {
        d,
        fill: "none",
        stroke: s.color,
        "stroke-width": 2,
        "stroke-dasharray": s.dash || "none",
        "vector-effect": "non-scaling-stroke",
      }),
    );
  }
  if (id === "signal") {
    current.rows.forEach((r) => {
      if (r.exposure)
        svg.append(
          el("rect", {
            x: x(r.period - 1),
            y: bottom + 4,
            width: width / 360 + 0.05,
            height: 6,
            fill: "#276448",
          }),
        );
    });
  }
  const period = Number($("period").value),
    selected = series[0].data[period];
  svg.append(
    el("line", {
      x1: x(period),
      x2: x(period),
      y1: top,
      y2: bottom,
      stroke: "#5e6669",
      "stroke-dasharray": "2 4",
    }),
  );
  if (selected !== null)
    svg.append(
      el("circle", {
        cx: x(period),
        cy: y(selected),
        r: 3.5,
        fill: series[0].color,
      }),
    );
}
function inspect() {
  const p = Number($("period").value),
    r = current.rows[p - 1];
  $("selected").value = p + " / 360";
  $("inspect").replaceChildren();
  for (const [label, value] of [
    ["Known signal", r.signal === null ? "N/A · warm-up" : pct(r.signal, 4)],
    ["Period return", pct(r.assetReturn, 4)],
    ["During period", r.exposure ? "Long" : "Cash"],
    ["Action", r.action],
    ["Traded notional", num(r.traded) + " u"],
    ["Fee this period", num(r.fee) + " u"],
    ["End shares", num(r.shares)],
    ["End cash", num(r.cash) + " u"],
  ]) {
    const dl = document.createElement("dl"),
      dt = document.createElement("dt"),
      dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = value;
    dl.append(dt, dd);
    $("inspect").append(dl);
  }
  $("identity").textContent =
    `Capital ${num(r.equity)} = 1 + gross P&L ${num(r.grossPnl)} − fees ${num(r.totalFees)} units. No-fee capital ${num(r.noFeeEquity)}.`;
  for (const tr of $("ledger").children)
    tr.classList.toggle("selected", Number(tr.dataset.period) === p);
  draw("equity", [
    { data: [1, ...current.rows.map((r) => r.equity)], color: "#276448" },
    {
      data: [1, ...current.rows.map((r) => r.noFeeEquity)],
      color: "#365f89",
      dash: "5 4",
    },
  ]);
  draw(
    "signal",
    [{ data: [null, ...current.rows.map((r) => r.signal)], color: "#242b2d" }],
    params.threshold,
  );
}
function render() {
  const r = current;
  $("net").textContent = pct(r.net);
  $("net").classList.toggle("negative", r.net < 0);
  $("free").textContent = pct(r.noFeeNet);
  $("drag").textContent = (r.drag * 100).toFixed(2) + " pp";
  $("fees").textContent = r.totalFees.toFixed(4) + " u";
  $("applied").textContent =
    `APPLIED / ${params.scenario} · seed ${params.seed} · lookback ${params.lookback} · threshold ${pct(params.threshold, 2)} · one-way fee ${params.feeBps} bps · 360 abstract periods`;
  $("summary").textContent =
    `${r.entries} buys · ${r.exits} sells · ${r.invested} long periods · max drawdown ${pct(r.maxDrawdown)}`;
  const frag = document.createDocumentFragment();
  for (const row of r.rows) {
    const tr = document.createElement("tr");
    tr.dataset.period = row.period;
    for (const value of [
      row.period,
      row.signal === null ? "N/A" : num(row.signal * 100),
      num(row.assetReturn * 100),
      row.exposure ? "Long" : "Cash",
      row.action,
      ...[
        row.traded,
        row.fee,
        row.totalFees,
        row.shares,
        row.cash,
        row.equity,
        row.noFeeEquity,
      ].map((v) => num(v)),
    ]) {
      const td = document.createElement("td");
      td.textContent = String(value);
      tr.append(td);
    }
    frag.append(tr);
  }
  $("ledger").replaceChildren(frag);
  inspect();
}
function apply(e) {
  e?.preventDefault();
  const seed = Number($("seed").value),
    lookback = Number($("lookback").value),
    threshold = Number($("threshold").value) / 100,
    feeBps = Number($("fee").value),
    scenario = $("scenario").value;
  for (const id of ["seed", "threshold", "fee"])
    $(id).removeAttribute("aria-invalid");
  let error = "";
  if (
    !$("seed").value.trim() ||
    !Number.isInteger(seed) ||
    seed < 1 ||
    seed > 4294967295
  ) {
    error = "Seed must be a whole number from 1 to 4294967295.";
    $("seed").setAttribute("aria-invalid", "true");
  } else if (
    !$("threshold").value.trim() ||
    !Number.isFinite(threshold) ||
    threshold < 0 ||
    threshold > 0.1
  ) {
    error = "Threshold must be between 0 and 10 percent.";
    $("threshold").setAttribute("aria-invalid", "true");
  } else if (
    !$("fee").value.trim() ||
    !Number.isFinite(feeBps) ||
    feeBps < 0 ||
    feeBps > 100
  ) {
    error = "One-way fee must be between 0 and 100 bps.";
    $("fee").setAttribute("aria-invalid", "true");
  }
  if (error) {
    $("status").textContent = error + " Applied results are unchanged.";
    return;
  }
  try {
    const next = { seed, lookback, threshold, feeBps, scenario },
      result = run(next);
    params = next;
    current = result;
    $("status").textContent = "";
    render();
  } catch {
    $("status").textContent =
      "Inputs could not be applied. Results are unchanged.";
  }
}
$("controls").addEventListener("submit", apply);
$("controls").addEventListener("input", () => {
  $("status").textContent = "Inputs changed. Apply to update the results.";
});
$("period").addEventListener("input", inspect);
apply();

window.addEventListener("resize", () => {
  if (current) inspect();
});
