import os
import unittest
from unittest import mock

import numpy as np

os.environ["ZENITH_REQUIRE_LLM"] = "0"

from impactgraph import forecast


def real_series(n=400, sigma=0.01, kind="ret", simulated=False, seed=3):
    rets = np.random.RandomState(seed).normal(0.0, sigma, n)
    dates = ["d%d" % i for i in range(n)]
    return dates, rets, {"source": "YF:TEST", "mode": "live", "simulated": simulated, "kind": kind}


def run(node="crude_oil", series=None, **kw):
    with mock.patch.object(forecast.ts, "get_returns", return_value=series):
        return forecast.simulate_monte_carlo(node, **kw)


class ForecastTests(unittest.TestCase):
    def test_structure_and_quantile_ordering(self):
        res = run(series=real_series(), shock_pct=5.0, horizon_days=30, simulations=300)
        self.assertTrue(res["available"])
        self.assertEqual(len(res["days"]), 31)
        b = res["bands"]
        for key in ("p10", "p25", "p50", "p75", "p90", "mean"):
            self.assertEqual(len(b[key]), 31)
        for key in ("p10", "p25", "p50", "p75", "p90"):          # day 0 is the assumed shock level
            self.assertAlmostEqual(b[key][0], 105.0, places=1)
        for t in range(31):
            self.assertLessEqual(b["p10"][t], b["p25"][t] + 1e-4)
            self.assertLessEqual(b["p25"][t], b["p50"][t] + 1e-4)
            self.assertLessEqual(b["p50"][t], b["p75"][t] + 1e-4)
            self.assertLessEqual(b["p75"][t], b["p90"][t] + 1e-4)

    def test_volatility_comes_from_the_real_series_and_drift_is_zero(self):
        calm = run(series=real_series(sigma=0.005), simulations=500)
        wild = run(series=real_series(sigma=0.03), simulations=500)
        self.assertAlmostEqual(calm["params"]["sigma_daily_pct"], 0.5, delta=0.1)
        self.assertAlmostEqual(wild["params"]["sigma_daily_pct"], 3.0, delta=0.4)
        self.assertEqual(calm["params"]["mu_daily_pct"], 0.0)
        self.assertGreater(wild["metrics"]["var_95_pct"], calm["metrics"]["var_95_pct"])
        # with zero drift and no shock the median stays near the starting level
        self.assertAlmostEqual(calm["metrics"]["median_terminal_pct"], 0.0, delta=2.0)

    def test_shock_is_only_what_the_caller_assumes(self):
        base = run(series=real_series(), shock_pct=0.0)
        down = run(series=real_series(), shock_pct=-8.0)
        self.assertAlmostEqual(base["bands"]["p50"][0], 100.0, places=1)
        self.assertAlmostEqual(down["bands"]["p50"][0], 92.0, places=1)
        self.assertIn("assumption", down["note"])

    def test_risk_metrics_are_sane(self):
        m = run(series=real_series(), shock_pct=-8.0, horizon_days=20, simulations=400)["metrics"]
        self.assertTrue(0.0 <= m["prob_loss_pct"] <= 100.0)
        self.assertGreaterEqual(m["cvar_95_pct"], m["var_95_pct"])

    def test_reproducible_with_a_seed(self):
        a = run(series=real_series(), seed=7)
        b = run(series=real_series(), seed=7)
        self.assertEqual(a["bands"]["p50"], b["bands"]["p50"])

    def test_refuses_simulated_data(self):
        res = run(series=real_series(simulated=True))
        self.assertFalse(res["available"])
        self.assertIn("simulated", res["reason"])
        self.assertNotIn("bands", res)
        self.assertNotIn("metrics", res)

    def test_refuses_yield_style_series_stored_as_changes(self):
        res = run("us10y", series=real_series(sigma=0.048, kind="diff"))
        self.assertFalse(res["available"])
        self.assertIn("percentage points", res["reason"])

    def test_refuses_nodes_without_a_series_instead_of_inventing_volatility(self):
        res = run("gdp_growth", series=None)
        self.assertFalse(res["available"])
        self.assertIn("no market price series", res["reason"])
        res = forecast.simulate_monte_carlo("unknown_asset", shock_pct=0.0, horizon_days=15)
        self.assertFalse(res["available"])

    def test_refuses_short_or_flat_history(self):
        self.assertFalse(run(series=real_series(n=60))["available"])
        flat = ["d%d" % i for i in range(300)], np.zeros(300), {"source": "YF:FLAT", "simulated": False, "kind": "ret"}
        self.assertFalse(run(series=flat)["available"])

    def test_no_invented_prior_label_anywhere(self):
        for res in (run(series=real_series()), run(series=None), run(series=real_series(simulated=True))):
            self.assertNotIn("Calibrated", str(res))


if __name__ == "__main__":
    unittest.main()
