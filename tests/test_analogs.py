import unittest
import numpy as np

from impactgraph import analogs

class TestAnalogs(unittest.TestCase):
    def test_rebase_series(self):
        prices = np.array([100.0, 110.0, 105.0, 95.0, 100.0])
        rebased = analogs._rebase_series(prices, start_idx=0, length=5)
        self.assertEqual(len(rebased), 5)
        self.assertEqual(rebased[0], 100.0)
        self.assertEqual(rebased[1], 110.0)

    def test_find_analog_windows(self):
        # 200 trading days
        prices = np.full(200, 100.0)
        # Create a sharp drop at index 50
        prices[50] = 90.0  # -10% drop over 5 days
        dates = [f"2023-01-{i+1:02d}" for i in range(200)]
        windows = analogs._find_analog_windows(dates, prices, shock_threshold=5.0)
        self.assertTrue(len(windows) >= 1)
        self.assertEqual(windows[0][0], 50)
        self.assertAlmostEqual(windows[0][1], -10.0, places=1)

    def test_historical_analogs_unknown_node(self):
        res = analogs.historical_analogs("non_existent_node", shock_pct=5.0, live=False)
        self.assertEqual(res["node_id"], "non_existent_node")
        self.assertIsNone(res["current"])
        self.assertEqual(res["analogs"], [])

    def test_historical_analogs_known_node(self):
        res = analogs.historical_analogs("crude_oil", shock_pct=5.0, live=False)
        self.assertEqual(res["node_id"], "crude_oil")
        self.assertIn("analogs", res)
        self.assertIn("threshold_used", res)

if __name__ == "__main__":
    unittest.main()
