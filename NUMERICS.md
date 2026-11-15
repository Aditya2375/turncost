# Numerical contract

## Domain

360 abstract periods, starting price 100 and capital 1. Seed is integer 1..4294967295. Scenario is `trend`, `chop`, or `flat`. Lookback L is 20, 60 or 120; threshold 0..0.1; fee 0..100 bps. The exported testing helper accepts exactly 360 finite returns in [-0.05, 0.05]; it is not a general file-import or market-data interface.

For each period, xorshift32 applies x XOR x<<13, x XOR x>>>17, x XOR x<<5 with unsigned 32-bit wrap. `u = unsigned(x)/2^32 * 2 - 1`, so u is in [-1,1). One draw per period, even for flat. Trend: 0.002 + 0.008u in periods 1..120 and 241..360, -0.002 + 0.008u in 121..240. Chop: (+0.009 in odd periods, -0.009 in even periods) + 0.003u. Flat: zero. No Gaussian, independence, calibration or real market claims.

P[0]=100; P[t]=P[t-1](1+r[t]). Before period t (one-indexed), signal exists only if t>L and equals P[t-1]/P[t-1-L]-1. It includes exactly L prior returns, excludes r[t], and chooses long iff strictly greater than threshold. All prices and signals are unaffected by fees. Strict floating-point comparisons are deliberate; values near the threshold can depend on last-bit arithmetic. Java and JS currently match exactly across tested seeds, Python's window-product reference within tolerance. No rounded display value drives a decision.

## Trade accounting

Initial cash 1, shares 0. On cash->long, q=C/[P(t-1)(1+c)], traded=qP, fee=c*traded, cash=0. On long->cash, traded=qP, fee=c*traded, cash=traded-fee and q=0. No target rebalance or fee when the exposure does not change. Use post-start-trade shares for gross P&L q*(P[t]-P[t-1]). At t=360, any shares are liquidated at P[360] with fee c*q\*P[360]. Last-period entry is permitted; it pays both sides. Ledger notional and fee aggregate both trades when that occurs. Exposure is the position held during the period, not the final inventory after liquidation.

Capital at every period end is cash + q\*P[t] = 1 + cumulative gross P&L - cumulative fees. Gross P&L uses the actual cost-reduced shares, not a separate no-cost position. Fees are capital units, not percentages. No-fee capital starts at 1 and multiplies by (1+r[t]) only when long; cash periods multiply by 1. Same exposure, different sizing. Return = terminal capital -1. Drag = no-fee terminal capital - actual terminal capital, displayed in percentage points of starting capital. Fees do not equal drag in general. Neither series has external flows. Drawdown = max(1-E[t]/max(E[0..t])) with E[0]=1; only period ends are measured.

## Analytic check

Constant +1% returns, L20, threshold0, c=.01: first buy at start of period21, 340 long periods, terminal sell. No-fee capital A=1.01^340. Net capital A*.99/1.01. Entry fee .01/1.01, exit fee .01*A/1.01. Terminal shares0, exactly one buy and one sell. Total drag exceeds fees because positive growth is lost. A separate fixture sets period21 return to -5% after positive formation: period21 remains long, proving current return does not choose current exposure.

## Presentation

Ledger six decimals, headline returns two, fees four; very small nonzero amounts can display zero. No early rounding. Charts use full-path axis bounds and are explicitly retrospective; no algorithm consumes plot geometry. Period t signal is known at start, but plotted at t beside its resulting exposure/return. Warm-up signal is absent (not zero). Entire first L periods shaded. Net and no-fee paths include capital1 at period0 and period360 terminal fees. At zero fee they overlap. Exposure band counts all periods held long, including a terminal period whose end shares are zero. Values in the inspector/ledger are the exact audit alternative to the plots.

## Limits

Single long/cash, arbitrary fractional shares, zero-yield cash, immediate fills at observed boundary prices, no gap, delay, spread, slippage, impact, taxes, borrow, funding or capacity. No dates or annualization. No parameter search, predictive inference, significance or out-of-sample validation. The synthetic trend regime is purpose-built, not discovered. Changing fee does not change signals. No live trading capability. Chrome emulation is not native iOS/Android testing.
