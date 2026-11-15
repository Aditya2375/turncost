package turncost;

import java.util.*;

public class TestRunner {
  static long n;

  static void ck(boolean b) {
    n++;
    if (!b) throw new AssertionError("check" + n);
  }

  static void eq(double a, double b) {
    ck(Math.abs(a - b) < 1e-10 * Math.max(1, Math.abs(b)));
  }

  public static void main(String[] args) {
    for (long seed : new long[] {1, 2, 2026, 2147483648L, 4294967295L})
      for (String mode : new String[] {"trend", "chop", "flat"})
        for (int l : new int[] {20, 60, 120})
          for (double th : new double[] {0, .01, .1})
            for (double fee : new double[] {0, 5, 100}) {
              var r = Engine.run(new Engine.Params(seed, mode, l, th, fee));
              ck(r.entries() == r.exits());
              eq(r.net(), r.grossPnl() - r.totalFees());
              eq(r.drag(), r.noFeeNet() - r.net());
              ck(r.drag() >= -1e-12 && r.maxDrawdown() >= 0 && r.maxDrawdown() < 1);
              double total = 0, last = 1;
              for (int i = 0; i < 360; i++) {
                var row = r.rows().get(i);
                ck(row.equity() > 0 && row.cash() >= 0 && row.shares() >= 0);
                eq(row.equity(), row.cash() + row.shares() * row.endPrice());
                eq(row.equity(), 1 + row.grossPnl() - row.totalFees());
                eq(row.fee(), row.traded() * fee / 10000);
                total += row.fee();
                eq(row.totalFees(), total);
                if (i < l) {
                  ck(row.signal() == null && row.exposure() == 0);
                  eq(row.equity(), 1);
                } else {
                  ck(row.signal() != null);
                  ck(row.exposure() == (row.signal() > th ? 1 : 0));
                }
                ck(row.noFeeEquity() + 1e-12 >= row.equity());
                if (fee == 0) eq(row.equity(), row.noFeeEquity());
                last = row.equity();
              }
              eq(r.rows().get(359).shares(), 0);
              if (mode.equals("flat")) {
                ck(r.entries() == 0);
                eq(r.net(), 0);
              }
            }
    double[] constant = new double[360];
    Arrays.fill(constant, .01);
    var f = Engine.simulate(constant, 20, 0, 100);
    double free = Math.pow(1.01, 340), expected = free * .99 / 1.01;
    eq(f.net(), expected - 1);
    eq(f.noFeeNet(), free - 1);
    ck(f.entries() == 1 && f.exits() == 1 && f.invested() == 340);
    eq(f.rows().get(20).fee(), .01 / 1.01);
    eq(f.totalFees(), .01 / 1.01 + free * .01 / 1.01);
    ck(f.drag() > f.totalFees());
    double[] flat = new double[360];
    eq(Engine.simulate(flat, 20, 0, 100).net(), 0);
    for (int l : new int[] {0, 19, 21, 360})
      try {
        Engine.simulate(flat, l, 0, 5);
        throw new AssertionError();
      } catch (IllegalArgumentException e) {
        n++;
      }
    for (double[] bad : new double[][] {{-.01, 5}, {.11, 5}, {0, 101}, {Double.NaN, 0}})
      try {
        Engine.simulate(flat, 20, bad[0], bad[1]);
        throw new AssertionError();
      } catch (IllegalArgumentException e) {
        n++;
      }
    double[] terminal = new double[360];
    terminal[358] = .01;
    terminal[359] = .02;
    var lastEntry = Engine.simulate(terminal, 20, 0, 100);
    ck(lastEntry.entries() == 1 && lastEntry.exits() == 1 && lastEntry.invested() == 1);
    ck(lastEntry.rows().get(359).action().equals("Buy + terminal sell"));
    eq(lastEntry.net(), 1.02 * .99 / 1.01 - 1);
    eq(lastEntry.totalFees(), .01 / 1.01 + 1.02 * .01 / 1.01);
    eq(lastEntry.rows().get(359).traded(), 1 / 1.01 + 1.02 / 1.01);
    System.out.println(n + " Java assertions passed");
  }
}
