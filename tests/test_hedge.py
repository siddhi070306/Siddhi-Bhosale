import unittest
from impactgraph.graph import KnowledgeGraph
from impactgraph.service import Analyzer
from impactgraph import hedge

class PortfolioHedgeTests(unittest.TestCase):
    def setUp(self):
        self.a = Analyzer(persist=False)

    def test_aviation_portfolio_crude_oil_spike_hedges_with_energy(self):
        res = self.a.analyze("Brent crude jumped 14% after an attack on oil infrastructure.")
        holdings = hedge.PORTFOLIO_PRESETS["aviation_transport"]["holdings"]
        
        report = hedge.analyze_portfolio_hedge(self.a.kg, res, holdings, total_value_usd=50000000.0)
        
        # Verify structure
        self.assertEqual(report["portfolio_value_usd"], 50000000.0)
        self.assertTrue(report["is_downside"])
        self.assertLess(report["net_pnl_usd"], 0)
        self.assertLess(report["net_impact_pct"], 0)
        self.assertGreater(report["var_95_30d_usd"], 0)
        
        # Check holdings
        self.assertEqual(len(report["holdings"]), len(holdings))
        dal_holding = next(h for h in report["holdings"] if h["ticker"] == "DAL")
        self.assertLess(dal_holding["pnl_usd"], 0)  # Airline hurt by crude oil shock
        
        # Check recommended counter-hedges
        self.assertGreater(len(report["recommended_hedges"]), 0)
        top_hedge = report["recommended_hedges"][0]
        self.assertEqual(top_hedge["action"], "BUY / LONG")
        self.assertGreater(top_hedge["coverage_offset_pct"], 25.0)
        self.assertGreater(top_hedge["post_hedge_net_pnl_usd"], report["net_pnl_usd"])

    def test_custom_portfolio_holdings(self):
        res = self.a.analyze("Federal Reserve raised interest rates by 50 basis points.")
        holdings = [
            {"node": "reits", "ticker": "VNQ", "weight": 0.6, "label": "Vanguard Real Estate"},
            {"node": "banks", "ticker": "JPM", "weight": 0.4, "label": "JPMorgan Chase"},
        ]
        report = hedge.analyze_portfolio_hedge(self.a.kg, res, holdings, total_value_usd=10000000.0)
        self.assertEqual(report["portfolio_value_usd"], 10000000.0)
        self.assertEqual(len(report["holdings"]), 2)
