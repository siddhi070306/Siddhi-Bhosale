import os
import unittest
from unittest import mock

import numpy as np

os.environ["ZENITH_REQUIRE_LLM"] = "0"

from impactgraph import analogs


class TestAnalogs(unittest.TestCase):
    def test_rebase_series(self):
        prices = np.array([100.0, 110.0, 105.0, 95.0, 100.0])
        rebased = analogs._rebase_series(prices, start_idx=0, length=5)
        self.assertEqual(len(rebased), 5)
        self.assertEqual(rebased[0], 100.0)
        self.assertEqual(rebased[1], 110.0)

    def test_find_analog_windows(self):
        prices = np.full(200, 100.0)
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

    def test_historical_analogs_known_node_without_data_is_empty_not_invented(self):
        with mock.patch.object(analogs.ts, "_cache_read", return_value=None):
            res = analogs.historical_analogs("crude_oil", shock_pct=5.0, live=False)
        self.assertEqual(res["analogs"], [])
        self.assertIsNone(res["current"])
        self.assertIn("Not enough", res["note"])

    def test_labels_claim_no_macro_event_names(self):
        n = 400
        rs = np.random.RandomState(1)
        vals = 100 * np.cumprod(1 + rs.normal(0, 0.004, n))
        vals[120:125] *= np.linspace(1.0, 0.88, 5)            # one clear drop, well before the final 95 days
        dates = ["2024-%02d-%02d" % (1 + i // 28 % 12, 1 + i % 28) for i in range(n)]
        with mock.patch.object(analogs.ts, "_cache_read", return_value={"dates": dates, "vals": vals.tolist(), "t": 0}):
            res = analogs.historical_analogs("crude_oil", shock_pct=8.0, live=False)
        self.assertTrue(res["analogs"])
        for a in res["analogs"]:
            self.assertTrue(a["label"].startswith("Move on "))
            for name in ("COVID", "Ukraine", "SVB", "Fed Rate", "Carry", "Trade War", "Election"):
                self.assertNotIn(name, a["label"])


if __name__ == "__main__":
    unittest.main()
