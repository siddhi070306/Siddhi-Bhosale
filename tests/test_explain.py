"""Plain-English explanations of relationships (impactgraph/explain.py)."""
import os
import unittest
from unittest import mock

os.environ["ZENITH_REQUIRE_LLM"] = "0"

from impactgraph import explain, llm
from impactgraph.service import SAMPLES, Analyzer

AGREES = {"verdict": "supported", "corr": -0.33, "lag_days": 0, "n": 489, "multiplier": 1.165, "adjusts": True, "simulated": False}
DISAGREES = {"verdict": "contradicted", "corr": 0.2, "lag_days": 1, "n": 502, "multiplier": 0.8, "adjusts": True, "simulated": False}


class WordingTests(unittest.TestCase):
    def setUp(self):
        self.a = Analyzer()
        self.kg = self.a.kg

    def test_a_curated_link_reads_as_a_sentence_with_its_reason(self):
        s = explain.explain_link(self.kg, "crude_oil", "airlines")
        self.assertEqual(s["headline"], "A rise in Crude Oil tends to push the Airlines sector down.")
        self.assertIn("jet fuel", s["why"])
        self.assertIn("An analyst wrote this link", s["identified"][0])
        self.assertIn("has not been checked against market data", s["data"])
        self.assertTrue(s["text"].startswith(s["headline"]))

    def test_grammar_for_sectors_indices_and_central_banks(self):
        self.assertEqual(explain.explain_link(self.kg, "airlines", "delta")["headline"],
                         "A rise in the Airlines sector tends to push Delta Air Lines up.")
        self.assertIn("is a member of the Airlines sector", explain.explain_link(self.kg, "airlines", "delta")["why"])
        self.assertIn("push the S&P 500 down", explain.explain_link(self.kg, "rate_exp", "spx")["headline"])
        self.assertTrue(explain.explain_link(self.kg, "fed", "rate_exp")["headline"].startswith("A hawkish move by the US Federal Reserve"))
        self.assertEqual(explain.explain_link(self.kg, "airlines", "delta")["timing"], "The effect typically shows up on the same day.")

    def test_market_data_that_agrees_raises_the_score_and_the_text_shows_the_arithmetic(self):
        self.kg.set_validation("crude_oil", "airlines", AGREES)
        s = explain.explain_link(self.kg, "crude_oil", "airlines")
        self.assertIn("Market data agrees: over 489 trading days, when Crude Oil moved, Airlines moved the opposite way on the same day "
                      "(correlation -0.33)", s["data"])
        self.assertEqual(s["score_value"], round(self.kg.eff_strength("crude_oil", "airlines"), 3))
        self.assertAlmostEqual(s["score_parts"]["start"] * s["score_parts"]["data_multiplier"], s["score_value"], places=2)
        self.assertIn("starts at 0.80, set by the analyst; market data raised it", s["score"])
        self.assertIn("not a probability or a price move", s["score"])

    def test_short_codes_for_the_relationships_board(self):
        s = explain.explain_link(self.kg, "crude_oil", "airlines")
        self.assertEqual((s["identified_by"], s["data_check"]["result"], s["sign"]), (["analyst"], "unchecked", -1))
        self.kg.set_validation("crude_oil", "airlines", AGREES)
        d = explain.explain_link(self.kg, "crude_oil", "airlines")["data_check"]
        self.assertEqual((d["result"], d["corr"], d["days"]), ("agrees", -0.33, 489))
        self.a.analyze("Crude oil jumped 8% on Monday, and airline stocks fell sharply.", live=False, use_llm=False)
        self.assertIn("article", explain.explain_link(self.kg, "crude_oil", "airlines")["identified_by"])

    def test_market_data_that_disagrees_says_so_and_lowers_the_score(self):
        self.kg.set_validation("usd", "crude_oil", DISAGREES)
        s = explain.explain_link(self.kg, "usd", "crude_oil")
        self.assertIn("Market data disagrees", s["data"])
        self.assertIn("opposite of what the link expects", s["data"])
        self.assertIn("market data lowered it by 20%", s["score"])

    def test_article_evidence_and_language_model_links_are_explained(self):
        self.a.analyze("Crude oil jumped 8% on Monday, and airline stocks fell sharply.", live=False, use_llm=False)
        s = explain.explain_link(self.kg, "crude_oil", "airlines")          # both named in one sentence: article evidence
        self.assertTrue(any(x.startswith("1 analysed article sentence mentions both") and "“Crude oil jumped 8%" in x
                            for x in s["identified"]), s["identified"])
        self.assertIn("article evidence raised it to", s["score"])
        self.kg.add_llm_links("art1", [{"src": "copper", "dst": "chemicals", "sign": 1, "quote": "Copper rose and chemical makers gained.",
                                        "mechanism": "Copper is an input"}])
        s = explain.explain_link(self.kg, "copper", "chemicals")
        self.assertIn("language model proposed it", s["identified"][0])
        self.assertIn("starts at 0.35", s["score"])

    def test_an_edit_rechecks_the_data_against_the_new_direction(self):
        stale = dict(AGREES, verdict="contradicted", multiplier=0.67)       # judged while the sign was flipped
        self.kg.set_validation("crude_oil", "airlines", stale)
        self.a.update_edge("crude_oil", "airlines", weight=-0.80, reason="restore")
        v = self.kg.g["crude_oil"]["airlines"]["validation"]
        self.assertNotEqual(v, stale)                                        # recomputed, not left from the old direction
        s = explain.explain_link(self.kg, "crude_oil", "airlines")
        self.assertIn("set by the analyst (a user restored this value)", s["score"])
        if v.get("verdict") in ("supported", "contradicted") and not v.get("simulated"):
            self.assertEqual(v["verdict"], "supported")                      # oil and airlines do move opposite in the data

    def test_a_user_added_link_says_who_added_it(self):
        with mock.patch.object(llm, "available", return_value=False):
            self.a.add_link("copper", "chemicals", 1, 0.4, 2, "Copper is a chemical input for some producers")
        s = explain.explain_link(self.kg, "copper", "chemicals")
        self.assertIn("A user added this link.", s["identified"])
        self.assertIn("set by a user", s["score"])


class ChainTests(unittest.TestCase):
    TEXT = ("Crude oil rose 12% on Monday after an attack on tankers in the Strait of Hormuz. Airline stocks fell sharply.")

    def setUp(self):
        self.a = Analyzer()
        self.a.guard.set_mode("static")
        self.r = self.a.analyze(self.TEXT, live=False, use_llm=False)

    def chain(self, end, via):
        return next(p for p in self.r["paths"] if p["end"] == end and via in p["nodes"])

    def test_every_chain_is_told_step_by_step_with_reasons(self):
        self.assertTrue(all(p.get("story") for p in self.r["paths"]))
        s = self.chain("real_estate", "inflation_exp")["story"]
        self.assertEqual(s["headline"], "Crude Oil ↑ → Inflation Expectations ↑ → Interest-Rate Expectations ↑ → Real Estate ↓")
        self.assertTrue(s["narrative"].startswith("A rise in Crude Oil pushes Inflation Expectations up, because energy is a direct CPI input"))
        self.assertIn("; that rise in Inflation Expectations pushes Interest-Rate Expectations up, because", s["narrative"])
        self.assertIn("; and that rise in Interest-Rate Expectations pushes the Real Estate sector down, because", s["narrative"])
        self.assertTrue(s["opening"].startswith("The article reports Crude Oil up 12% (“Crude oil rose 12%"))
        self.assertIn("This is an inference, not something the article states.", s["conclusion"])

    def test_the_arithmetic_reproduces_the_chain_score_and_names_the_weakest_step(self):
        for p in self.r["paths"]:
            s = p["story"]
            prod = 1.0
            for st in s["steps"]:
                prod *= st["strength"] * st["discount"]
            self.assertAlmostEqual(prod, p["score"], places=2)
            if len(s["steps"]) > 1:
                w = min(s["steps"], key=lambda x: x["weight"])
                self.assertIn("%s → %s" % (w["from_label"], w["to_label"]), s["weakest"])
        self.assertIn("= %.2f" % self.chain("real_estate", "inflation_exp")["score"], self.chain("real_estate", "inflation_exp")["story"]["arithmetic"])

    def test_evidence_counts_match_the_steps(self):
        s = self.chain("real_estate", "inflation_exp")["story"]
        c = s["evidence_counts"]
        self.assertEqual((c["steps"], c["analyst"]), (3, 3))
        self.assertEqual(c["data_agrees"] + c["data_disagrees"] + c["data_too_weak"] + c["unchecked"], 3)
        self.assertTrue(s["evidence"].startswith("Evidence: 3 of 3 steps are written by an analyst"))

    def test_a_chain_ending_on_a_reported_move_says_whether_it_agrees(self):
        s = self.chain("airlines", "crude_oil")["story"]
        self.assertEqual(s["conclusion"], "The article itself reports the Airlines sector moving down, and this chain agrees with it.")

    def test_openings_for_expected_and_hypothetical_starts(self):
        p = self.chain("real_estate", "inflation_exp")
        exp = explain.explain_chain(self.a.kg, p, {"status": "expected", "label": "Crude Oil up", "quote": "Oil could rise."})
        self.assertIn("stated as a possibility rather than as something that happened", exp["opening"])
        hyp = explain.explain_chain(self.a.kg, p, {"status": "hypothesis", "label": "Crude Oil up (model hypothesis)"})
        self.assertIn("as a hypothesis; the article does not state it", hyp["opening"])


class AnalysisTests(unittest.TestCase):
    def test_every_relationship_in_an_analysis_carries_its_explanation(self):
        a = Analyzer()
        a.guard.set_mode("static")
        r = a.analyze(SAMPLES[0]["text"], live=False, use_llm=False)
        kg_links = [l for l in r["graph"]["links"] if a.kg.g.has_edge(l["source"], l["target"])]
        self.assertTrue(kg_links)
        self.assertTrue(all(l.get("story") and l.get("mechanism") for l in kg_links))
        self.assertTrue(all("story" not in l for l in r["graph"]["links"] if l.get("kind") == "reports"))   # article-event links are not graph links

    def test_explain_endpoint(self):
        import server
        from fastapi.testclient import TestClient
        with mock.patch.object(server, "analyzer", Analyzer()):
            c = TestClient(server.app)
            ok = c.get("/api/kg/explain?src=crude_oil&dst=airlines").json()
            self.assertEqual(ok["headline"], "A rise in Crude Oil tends to push the Airlines sector down.")
            self.assertEqual(c.get("/api/kg/explain?src=gold&dst=tcs").status_code, 404)


if __name__ == "__main__":
    unittest.main()
