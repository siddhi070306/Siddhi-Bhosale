import unittest
import numpy as np

from impactgraph import forecast

class TestForecast(unittest.TestCase):
    def test_simulate_monte_carlo_structure(self):
        res = forecast.simulate_monte_carlo("crude_oil", shock_pct=5.0, horizon_days=30, simulations=300)
        self.assertEqual(res["node_id"], "crude_oil")
        self.assertEqual(res["horizon_days"], 30)
        self.assertEqual(len(res["days"]), 31)  # D+0 to D+30
        
        # Check bands
        bands = res["bands"]
        for key in ["p10", "p25", "p50", "p75", "p90", "mean"]:
            self.assertIn(key, bands)
            self.assertEqual(len(bands[key]), 31)

        # Day 0 should match shock starting level
        self.assertAlmostEqual(bands["p50"][0], 105.0, places=1)
        self.assertAlmostEqual(bands["p10"][0], 105.0, places=1)
        self.assertAlmostEqual(bands["p90"][0], 105.0, places=1)

        # Quantile ordering should hold at all steps: p10 <= p25 <= p50 <= p75 <= p90
        for t in range(31):
            self.assertLessEqual(bands["p10"][t], bands["p25"][t] + 1e-4)
            self.assertLessEqual(bands["p25"][t], bands["p50"][t] + 1e-4)
            self.assertLessEqual(bands["p50"][t], bands["p75"][t] + 1e-4)
            self.assertLessEqual(bands["p75"][t], bands["p90"][t] + 1e-4)

    def test_risk_metrics(self):
        res = forecast.simulate_monte_carlo("airlines", shock_pct=-8.0, horizon_days=20, simulations=200)
        metrics = res["metrics"]
        self.assertIn("median_terminal_pct", metrics)
        self.assertIn("var_95_pct", metrics)
        self.assertIn("cvar_95_pct", metrics)
        self.assertIn("prob_loss_pct", metrics)
        self.assertTrue(0.0 <= metrics["prob_loss_pct"] <= 100.0)

    def test_fallback_node(self):
        res = forecast.simulate_monte_carlo("unknown_asset", shock_pct=0.0, horizon_days=15)
        self.assertEqual(res["node_id"], "unknown_asset")
        self.assertEqual(len(res["days"]), 16)
        self.assertAlmostEqual(res["bands"]["p50"][0], 100.0, places=1)

if __name__ == "__main__":
    unittest.main()
