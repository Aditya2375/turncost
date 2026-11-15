package turncost;

import java.util.*;

public final class Engine {
  public static final int N = 360;

  public record Params(long seed, String scenario, int lookback, double threshold, double feeBps) {}

  public record Row(
      int period,
      double startPrice,
      double endPrice,
      double assetReturn,
      Double signal,
      int exposure,
      String action,
      double traded,
      double fee,
      double totalFees,
      double shares,
      double cash,
      double equity,
      double noFeeEquity,
      double grossPnl) {}

  public record Result(
      int entries,
      int exits,
      int invested,
      double totalFees,
      double grossPnl,
      double net,
      double noFeeNet,
      double drag,
      double maxDrawdown,
      List<Row> rows) {}

  static final class Rng {
    long x;

    Rng(long s) {
      x = s;
    }

    double next() {
      x ^= (x << 13) & 0xffffffffL;
      x ^= x >>> 17;
      x ^= (x << 5) & 0xffffffffL;
      x &= 0xffffffffL;
      return x / 4294967296.0 * 2 - 1;
    }
  }

  public static double[] generate(long seed, String mode) {
    if (seed < 1 || seed > 0xffffffffL || !Set.of("trend", "chop", "flat").contains(mode))
      throw new IllegalArgumentException("Invalid generator inputs");
    Rng r = new Rng(seed);
    double[] out = new double[N];
    for (int i = 0; i < N; i++) {
      double u = r.next();
      out[i] =
          mode.equals("flat")
              ? 0
              : mode.equals("chop")
                  ? ((i % 2 == 0 ? .009 : -.009) + .003 * u)
                  : ((i < 120 ? .002 : i < 240 ? -.002 : .002) + .008 * u);
    }
    return out;
  }

  public static Result run(Params p) {
    if (p == null) throw new IllegalArgumentException("Missing inputs");
    return simulate(generate(p.seed, p.scenario), p.lookback, p.threshold, p.feeBps);
  }

  public static Result simulate(double[] returns, int lookback, double threshold, double feeBps) {
    if (returns == null
        || returns.length != N
        || !(lookback == 20 || lookback == 60 || lookback == 120)
        || !Double.isFinite(threshold)
        || threshold < 0
        || threshold > .1
        || !Double.isFinite(feeBps)
        || feeBps < 0
        || feeBps > 100) throw new IllegalArgumentException("Invalid inputs");
    for (double r : returns)
      if (!Double.isFinite(r) || r < -.05 || r > .05)
        throw new IllegalArgumentException("Returns outside helper domain");
    double[] price = new double[N + 1];
    price[0] = 100;
    for (int i = 0; i < N; i++) price[i + 1] = price[i] * (1 + returns[i]);
    double cash = 1, q = 0, free = 1, fees = 0, gross = 0, peak = 1, mdd = 0, c = feeBps / 10000;
    int state = 0, entries = 0, exits = 0, invested = 0;
    List<Row> rows = new ArrayList<>();
    for (int i = 0; i < N; i++) {
      Double signal = null;
      int target = 0;
      if (i >= lookback) {
        signal = price[i] / price[i - lookback] - 1;
        target = signal > threshold ? 1 : 0;
      }
      String action = i < lookback ? "Warm-up" : "Hold cash";
      double traded = 0, fee = 0;
      if (target != state) {
        if (target == 1) {
          double newQ = cash / (price[i] * (1 + c));
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
      } else if (state == 1) action = "Hold shares";
      fees += fee;
      gross += q * (price[i + 1] - price[i]);
      if (state == 1) {
        free *= 1 + returns[i];
        invested++;
      }
      int exposure = state;
      if (i == N - 1 && state == 1) {
        double t = q * price[i + 1], f = t * c;
        traded += t;
        fee += f;
        fees += f;
        cash = t - f;
        q = 0;
        state = 0;
        exits++;
        action = action.equals("Buy") ? "Buy + terminal sell" : "Terminal sell";
      }
      double equity = cash + q * price[i + 1];
      peak = Math.max(peak, equity);
      mdd = Math.max(mdd, 1 - equity / peak);
      rows.add(
          new Row(
              i + 1,
              price[i],
              price[i + 1],
              returns[i],
              signal,
              exposure,
              action,
              traded,
              fee,
              fees,
              q,
              cash,
              equity,
              free,
              gross));
    }
    double eq = rows.get(N - 1).equity;
    return new Result(
        entries, exits, invested, fees, gross, eq - 1, free - 1, free - eq, mdd, rows);
  }
}
