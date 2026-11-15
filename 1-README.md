# turncost

A long/cash momentum worksheet that follows the money, including transaction costs and foregone compounding. Java 21 core, dependency-free browser mirror, 360 seeded synthetic periods. No accounts, uploads, storage, market data or trading connection.

## Run

Open `docs/` through a local HTTP server:

```sh
python3 -m http.server 8000 --directory docs
```

Then open `http://localhost:8000`. Internet is unnecessary after the files are downloaded. The only outgoing links are optional background reading; the app itself makes no external requests.

## Model

- Start with 1 unit in cash, price 100. Pick a 20, 60 or 120 period lookback, 0..10% threshold and 0..100 bps one-way proportional fee.
- First L periods are warm-up. Before period t's return, compute `P[t-1]/P[t-1-L]-1`. Long only if strictly above the threshold; otherwise cash.
- Buy with `q = cash / (price * (1 + c))`; sell for `q * price * (1 - c)`. Fees are on traded notional, paid from available capital. Hold shares without rebalancing. Cash earns zero. A remaining position is sold after period 360's return and pays its exit fee, even if bought that period.
- The no-fee path uses the same exposure decisions but its own capital. Return drag is its terminal capital minus net terminal capital. Fees paid are actual units debited. They differ because fees remove capital that could have earned later returns.
- Net capital = 1 + gross mark-to-market P&L - cumulative fees. The ledger provides all 360 rows. Max drawdown uses period-end capital, including starting capital 1 and terminal liquidation; it does not see intraperiod moves.

This teaching simplification is not the paper's diversified, volatility-scaled futures strategy. Execution at the already-observed boundary price assumes zero latency and no gap. No spread, slippage, impact, taxes, leverage, shorting, funding, partial fills or share rounding. Synthetic performance is not evidence of skill. Educational use only, not investment advice.

See [NUMERICS.md](NUMERICS.md) for generator, timing and numerical details.

## Test

Java 21+, Node 22+, Python 3 standard library. Browser tests also require `google-chrome` on PATH. No package install:

```sh
javac -d build/classes src/turncost/*.java tools/*.java tests/turncost/*.java
java -cp build/classes turncost.TestRunner
node tests/parity.mjs
node tests/domain.mjs
python3 tests/reference.py
node tools/build-web.mjs
node tests/browser-smoke.mjs
```

The suites cover full Java/browser state parity; an independent Python PRNG/window-product/cash reference; constant-return closed forms; fee monotonicity; future-return mutation of prefixes; warm-up, zero-cost, flat and terminal-sale cases. Chrome compares every ledger cell and plotted coordinate, plus input retention and narrow-screen layout. CI rebuilds `docs/` and checks for drift. CI-only scanners are pinned; runtime has no dependencies.

## Sources

- [Moskowitz, Ooi, Pedersen, Time series momentum (2012)](https://w4.stern.nyu.edu/facdir/lpederse/papers/TimeSeriesMomentum.pdf): own-history return signal, not cross-sectional ranking.
- [MOSEK Portfolio Optimization Cookbook, transaction costs](https://docs.mosek.com/portfolio-cookbook/transaction.html): linear traded-notional costs and self-financing budget.
- [Gurobi, rebalancing with transaction costs](https://gurobi-finance.readthedocs.io/en/latest/modeling_notebooks/rebalancing.html): fixed versus proportional costs. No Gurobi code or dependency used.
- [VectorBT, realistic backtests](https://vectorbt.pro/features/backtesting/backtest-realism/): causal timing and available capital. No VectorBT dependency or performance claims adopted.
- [Investor.gov, how fees affect returns](https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins/updated): fees reduce the capital earning returns. This app charges trade fees, not the bulletin's annual expense ratios.
- [Portfolio Performance, time-weighted return](https://help.portfolio-performance.info/en/concepts/performance/time-weighted/): geometric compounding and portfolio-internal cash movements. No external deposits or withdrawals here.

## License

Original code and documentation: **MIT OR Apache-2.0**, at your option. See [LICENSE-MIT](LICENSE-MIT) and [LICENSE-APACHE](LICENSE-APACHE). Linked reading is not bundled or relicensed.
