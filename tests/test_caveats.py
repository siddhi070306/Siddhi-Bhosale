import os
import unittest
from unittest import mock

os.environ["ZENITH_REQUIRE_LLM"] = "0"

from impactgraph import llm
from impactgraph.service import Analyzer


class CaveatTests(unittest.TestCase):
    def test_links_carry_the_stored_strength_next_to_the_effective_one(self):
        res = Analyzer().analyze("Brent crude jumped 12% on Monday.", live=False, use_llm=False)
        links = res["graph"]["links"]
        self.assertTrue(links)
        for l in links:
            if l.get("base_strength") is not None:
                self.assertTrue(0 < l["base_strength"] <= 0.99)
        self.assertTrue(any("base_strength" in l for l in links))

    def test_summary_prompt_forbids_calling_model_output_observed(self):
        with mock.patch.object(llm, "_chat", return_value="ok") as chat:
            llm.summarise({"observed_events": ["Crude Oil up 12%"], "top_sectors": ["Real Estate ↓"]})
        system_prompt = chat.call_args[0][0]
        self.assertIn("observed_events", system_prompt)
        self.assertIn("never describe it as observed", system_prompt)



class SecEndpointTests(unittest.TestCase):
    def test_unknown_ticker_is_a_404_with_a_reason(self):
        from fastapi.testclient import TestClient
        import server
        with mock.patch.object(server.feeds, "sec_filings", return_value={}):
            r = TestClient(server.app).get("/api/sec?ticker=NOPE")
        self.assertEqual(r.status_code, 404)
        self.assertIn("No SEC record", r.json()["detail"])

if __name__ == "__main__":
    unittest.main()
