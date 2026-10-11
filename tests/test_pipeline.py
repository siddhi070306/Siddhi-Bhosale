import os
import unittest

os.environ["ZENITH_REQUIRE_LLM"] = "0"   # tests run offline; LLM-required mode is tested explicitly below

from impactgraph import extract as ex
from impactgraph import kb
from impactgraph import propagate as pg
from impactgraph.graph import KnowledgeGraph
from impactgraph.service import Analyzer, SAMPLES


def events(text):
    return ex.extract(text)["events"]


def find(evs, trigger, status=None):
    return [e for e in evs if e["trigger"] == trigger and (status is None or e["status"] == status)]


class ExtractionTests(unittest.TestCase):
    def test_price_move_with_magnitude(self):
        e = find(events("Brent crude jumped 12% on Monday."), "crude_oil")[0]
        self.assertEqual((e["direction"], e["status"], e["magnitude"]), (1, "observed", "12%"))

    def test_hedged_statement_is_expected_not_observed(self):
        evs = events("Analysts warned that higher energy costs could lift inflation expectations.")
        self.assertTrue(find(evs, "inflation_exp", "expected"))
        self.assertFalse(find(evs, "inflation_exp", "observed"))

    def test_rupee_weakening_means_usdinr_up(self):
        e = find(events("The rupee weakened sharply."), "usdinr")[0]
        self.assertEqual(e["direction"], 1)

    def test_clause_boundary_does_not_leak_verbs(self):
        evs = events("Real estate stocks fell, while analysts said banks could benefit from wider lending margins.")
        self.assertTrue(find(evs, "real_estate", "observed"))
        self.assertFalse(find(evs, "banks"))

    def test_noun_increase_is_not_a_verb(self):
        evs = events("Utilities were expected to pass on part of the increase to customers.")
        self.assertFalse(find(evs, "utilities"))

    def test_central_banks_is_not_the_banks_sector(self):
        evs = events("Markets expect central banks to keep rates higher.")
        self.assertFalse(find(evs, "banks"))

    def test_fed_decision_with_bps(self):
        e = find(events("The Federal Reserve raised interest rates by 50 basis points."), "fed")[0]
        self.assertEqual(e["direction"], 1)
        self.assertIn("50", e["magnitude"])

    def test_opec_restraint_and_geopolitics(self):
        evs = events("OPEC+ signalled it would keep its output cuts in place. "
                     "A missile attack hit tankers near the Strait of Hormuz.")
        self.assertTrue(find(evs, "opec_supply_cut", "observed"))
        self.assertTrue(find(evs, "geopolitical_tension", "observed"))

    def test_regulation_is_scoped_to_regulators_market(self):
        e = find(events("The RBI imposed tighter rules on banks."), "banks")[0]
        self.assertEqual((e["type"], e["direction"], e["market"]), ("regulation", -1, "IN"))


class PropagationTests(unittest.TestCase):
    def setUp(self):
        self.kg = KnowledgeGraph()

    def src(self, trig, d=1, anchor=False):
        return [{"id": "s", "trigger": trig, "direction": d, "intensity": .8, "anchor": anchor}]

    def test_oil_up_hurts_airlines_helps_producers(self):
        agg = pg.aggregate(pg.propagate(self.kg, self.src("crude_oil")))
        self.assertEqual(agg["airlines"]["direction"], -1)
        self.assertEqual(agg["oil_gas_producers"]["direction"], 1)

    def test_direction_flips_with_shock_sign(self):
        up = pg.aggregate(pg.propagate(self.kg, self.src("crude_oil", 1)))
        dn = pg.aggregate(pg.propagate(self.kg, self.src("crude_oil", -1)))
        self.assertEqual(up["airlines"]["direction"], -dn["airlines"]["direction"])

    def test_scores_decay_with_hops_and_chain_sign(self):
        paths = pg.propagate(self.kg, self.src("crude_oil"))
        chain = [p for p in paths if p["nodes"] == ["crude_oil", "inflation_exp", "rate_exp", "real_estate"]][0]
        direct = [p for p in paths if p["nodes"] == ["crude_oil", "inflation_exp"]][0]
        self.assertLess(chain["score"], direct["score"])
        self.assertEqual(chain["sign"], -1)  # oil up -> real estate down via rates

    def test_confidence_is_capped(self):
        agg = pg.aggregate(pg.propagate(self.kg, self.src("gold")), exclude=("gold",))
        for a in agg.values():
            self.assertLessEqual(a["confidence"], pg.CONF_CAP)

    def test_conflicting_paths_flagged_mixed(self):
        paths = [{"nodes": ["a", "x"], "edges": [("a", "x")], "score": .5, "sign": 1, "lag": 1, "intensity": .5},
                 {"nodes": ["a", "b", "x"], "edges": [("a", "b"), ("b", "x")], "score": .45, "sign": -1, "lag": 2, "intensity": .5}]
        self.assertTrue(pg.aggregate(paths)["x"]["mixed"])

    def test_anchor_blocks_paths_through_observed_node(self):
        srcs = [{"id": "a", "trigger": "geopolitical_tension", "direction": 1, "intensity": .6, "anchor": False},
                {"id": "b", "trigger": "crude_oil", "direction": 1, "intensity": .8, "anchor": True}]
        for p in pg.propagate(self.kg, srcs):
            if p["source_id"] == "a" and "crude_oil" in p["nodes"]:
                self.assertEqual(p["nodes"][-1], "crude_oil")  # stops at the anchor

    def test_market_scope_blocks_foreign_assets(self):
        srcs = [{"id": "r", "trigger": "banks", "direction": -1, "intensity": .5, "anchor": True, "market": "IN"}]
        reached = {p["nodes"][-1] for p in pg.propagate(self.kg, srcs)}
        self.assertIn("hdfcbank", reached)
        self.assertNotIn("jpm", reached)


class GraphTests(unittest.TestCase):
    def test_ingest_reinforces_once_and_adds_inferred_entity(self):
        a = Analyzer()
        text = "Crude oil rose 5% and airline stocks fell. Zephyr Airlines also dropped."
        before = a.kg.g["crude_oil"]["airlines"]["strength"]
        a.analyze(text)
        mid = a.kg.g["crude_oil"]["airlines"]["strength"]
        a.analyze(text)  # the same article again must not double count
        self.assertGreater(mid, before)
        self.assertEqual(a.kg.g["crude_oil"]["airlines"]["strength"], mid)
        self.assertTrue(any(d.get("inferred") for _, d in a.kg.g.nodes(data=True)))

    def test_reset_restores_priors(self):
        a = Analyzer()
        a.analyze("Crude oil rose 5% and airline stocks fell.")
        a.reset()
        self.assertEqual(a.kg.stats()["articles_ingested"], 0)


class EndToEndTests(unittest.TestCase):
    def test_all_samples_run_offline(self):
        a = Analyzer()
        for s in SAMPLES:
            r = a.analyze(s["text"], live=False)
            self.assertTrue(r["events"], s["id"])
            self.assertTrue(r["paths"], s["id"])
            self.assertTrue(r["assets"], s["id"])
            for p in r["paths"]:
                self.assertTrue(0 < p["score"] <= 1)

    def test_no_event_text_returns_no_paths(self):
        r = Analyzer().analyze("The weather was pleasant and the cafe was busy.")
        self.assertEqual(r["paths"], [])

    def test_simulated_data_never_adjusts_confidence(self):
        a = Analyzer()
        a.analyze(SAMPLES[0]["text"], live=False)
        checked = 0
        for u, v, d in a.kg.g.edges(data=True):
            val = d.get("validation")
            if val and val.get("simulated"):
                self.assertFalse(val["adjusts"])
                self.assertEqual(a.kg.eff_strength(u, v), min(0.99, d["strength"]))
                checked += 1
        self.assertGreater(checked, 0)

    def test_kb_integrity(self):
        for s, d, sign, st, lag, why in kb.EDGES:
            self.assertIn(s, kb.NODES)
            self.assertIn(d, kb.NODES)
            self.assertIn(sign, (-1, 1))
            self.assertTrue(0 < st <= 1 and lag >= 0 and why)


class LlmRequiredTests(unittest.TestCase):
    def test_required_without_key_is_an_error(self):
        from impactgraph import service
        keep = dict(os.environ)
        try:
            for k in ("GROQ_API_KEY", "OPENROUTER_API_KEY"):
                os.environ.pop(k, None)
            os.environ["ZENITH_REQUIRE_LLM"] = "1"
            self.assertIn("error", service.Analyzer().analyze("Brent crude jumped 12%."))
        finally:
            os.environ.clear()
            os.environ.update(keep)

    def test_llm_links_are_verified_and_never_flip_priors(self):
        from impactgraph import llm
        text = "Crude oil rose sharply, which pushed airline costs higher and weighed on airline shares."
        fake = ('{"links":[{"src":"crude_oil","dst":"airlines","sign":-1,"mechanism":"fuel cost","quote":"%s"},'
                '{"src":"crude_oil","dst":"gold","sign":1,"mechanism":"x","quote":"this sentence is not in the article"},'
                '{"src":"nope","dst":"gold","sign":1,"mechanism":"x","quote":"%s"}]}') % (text, text)
        orig = llm._chat
        llm._chat = lambda *a, **k: fake
        try:
            links = llm.extract_links(text)
        finally:
            llm._chat = orig
        self.assertEqual([(l["src"], l["dst"]) for l in links], [("crude_oil", "airlines")])
        kg = KnowledgeGraph()
        kg.add_llm_links("a1", [{"src": "crude_oil", "dst": "airlines", "sign": 1, "quote": text, "mechanism": "m"}])
        self.assertEqual(kg.g["crude_oil"]["airlines"]["sign"], -1)  # conflicting LLM sign ignored
        kg.add_llm_links("a1", [{"src": "gold", "dst": "airlines", "sign": 1, "quote": text, "mechanism": "m"}])
        self.assertEqual(kg.g["gold"]["airlines"]["provenance"], ["llm_proposed"])


class WhatIfTests(unittest.TestCase):
    def test_whatif_is_read_only_and_signs_follow_shock(self):
        a = Analyzer()
        before = {(u, v): d["strength"] for u, v, d in a.kg.g.edges(data=True)}
        n_before = a.kg.g.number_of_edges()
        up = a.whatif("crude_oil", 25)
        dn = a.whatif("crude_oil", -10)
        self.assertEqual({(u, v): d["strength"] for u, v, d in a.kg.g.edges(data=True)}, before)
        self.assertEqual(a.kg.g.number_of_edges(), n_before)
        d_up = {r["node"]: r["direction"] for r in up["sectors"]}
        d_dn = {r["node"]: r["direction"] for r in dn["sectors"]}
        self.assertEqual(d_up["airlines"], -1)
        self.assertEqual(d_dn["airlines"], 1)
        small = {r["node"]: r["sensitivity"] for r in a.whatif("crude_oil", 2)["sectors"]}
        big = {r["node"]: r["sensitivity"] for r in up["sectors"]}
        self.assertGreater(big["airlines"], small["airlines"])

    def test_whatif_rejects_bad_input(self):
        a = Analyzer()
        self.assertIn("error", a.whatif("nope", 5))
        self.assertIn("error", a.whatif("crude_oil", 0))

    def test_whatif_multi_shock_conflicting_forces(self):
        a = Analyzer()
        res = a.whatif(shocks=[
            {"trigger": "crude_oil", "magnitude_pct": 10.0},
            {"trigger": "airlines", "magnitude_pct": 8.0}
        ])
        self.assertTrue(res.get("is_multi_shock"))
        self.assertEqual(len(res.get("shocks", [])), 2)
        # Check that downstream asset delta has both positive and negative forces evaluated
        delta_row = next((r for r in res["assets"] if r["node"] == "delta"), None)
        self.assertIsNotNone(delta_row)
        self.assertGreater(delta_row["pos_mass"], 0)
        self.assertGreater(delta_row["neg_mass"], 0)
        self.assertIn("direction", delta_row)
        self.assertIn("agreement", delta_row)


if __name__ == "__main__":
    unittest.main()
