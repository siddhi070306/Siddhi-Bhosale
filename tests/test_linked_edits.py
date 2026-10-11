"""Editing a link also adjusts the links that work through the same economic reason (after the user approves), shows the
ripple on chains, sectors and companies before saving, saves everything as one undoable change, and re-scores the open
analysis from its saved events without calling the language model."""
import os
import unittest
from unittest import mock

os.environ["ZENITH_REQUIRE_LLM"] = "0"

from impactgraph import channels, library, llm, ripple
from impactgraph.service import Analyzer

OIL = "Brent crude jumped 12% on Monday after an attack on tankers in the Strait of Hormuz. Airline stocks fell sharply."


def snapshot(kg):
    return {(u, v): (e["sign"], round(e["strength"], 4), tuple(e.get("provenance") or [])) for u, v, e in kg.g.edges(data=True)}


class ChannelTests(unittest.TestCase):
    def setUp(self):
        self.kg = Analyzer().kg

    def test_links_are_grouped_by_their_reason(self):
        ch = lambda u, v: channels.channel_of(self.kg, u, v)
        self.assertEqual(ch("crude_oil", "airlines"), "energy_cost")
        self.assertEqual(ch("crude_oil", "autos"), "energy_cost")
        self.assertEqual(ch("crude_oil", "chemicals"), "feedstock")
        self.assertEqual(ch("natural_gas", "inflation_exp"), "inflation")
        self.assertEqual(ch("fed", "rate_exp"), "policy")
        self.assertEqual(ch("rate_exp", "real_estate"), "borrowing_cost")
        self.assertEqual(ch("airlines", "delta"), "structure")
        self.assertEqual(ch("banks", "nifty_bank"), "structure")
        self.assertFalse([e for e in self.kg.g.edges if ch(*e) == "other"])        # every curated link has a reason

    def test_siblings_share_the_reason_only(self):
        ch, sibs = channels.siblings(self.kg, "crude_oil", "airlines")
        self.assertEqual(ch, "energy_cost")
        self.assertIn(("crude_oil", "autos"), sibs)
        self.assertNotIn(("crude_oil", "chemicals"), sibs)                         # feedstock: a different reason
        self.assertEqual(channels.siblings(self.kg, "airlines", "delta"), ("structure", []))


class ProposalTests(unittest.TestCase):
    def setUp(self):
        self.kg = Analyzer().kg

    def test_same_reason_same_proportion_signs_kept(self):
        p = ripple.propose(self.kg, "crude_oil", "airlines", -0.4)
        self.assertEqual((p["edit"]["before"], p["edit"]["after"], p["ratio"]), (-0.8, -0.4, 0.5))
        autos = next(l for l in p["linked"] if l["target"] == "autos")
        self.assertEqual((autos["before"], autos["after"]), (-0.3, -0.15))
        self.assertTrue(all((l["before"] > 0) == (l["after"] > 0) for l in p["linked"]))
        self.assertIsNone(p["note"])

    def test_a_sign_flip_alone_is_not_spread(self):
        p = ripple.propose(self.kg, "crude_oil", "airlines", 0.8)
        self.assertEqual(p["linked"], [])
        self.assertIn("sign", p["note"])

    def test_structural_links_are_never_grouped(self):
        p = ripple.propose(self.kg, "airlines", "delta", 0.45)
        self.assertEqual(p["linked"], [])
        self.assertIn("own price data", p["note"])

    def test_a_link_the_user_edited_before_is_proposed_but_not_ticked(self):
        a = Analyzer()
        a.update_edge("crude_oil", "autos", weight=-0.2)
        p = ripple.propose(a.kg, "crude_oil", "airlines", -0.4)
        autos = next(l for l in p["linked"] if l["target"] == "autos")
        self.assertTrue(autos["user_edited"])
        self.assertFalse(autos["default"])


class RippleTests(unittest.TestCase):
    def setUp(self):
        self.a = Analyzer()
        self.res = self.a.analyze(OIL, live=False)

    def test_preview_is_read_only_and_rescores_the_chains_through_the_edit(self):
        before = snapshot(self.a.kg)
        p = ripple.preview(self.a.kg, "crude_oil", "airlines", -0.4, analysis=self.res)
        self.assertEqual(snapshot(self.a.kg), before)
        r = p["ripple"]
        self.assertEqual(r["basis"], "analysis")
        direct = next(c for c in r["chains"] if c["nodes"] == ["crude_oil", "airlines"])
        self.assertLess(direct["after"], direct["before"])
        autos = next(c for c in r["chains"] if c["nodes"] == ["crude_oil", "autos"])
        self.assertAlmostEqual(autos["after"], autos["before"] / 2, delta=0.02)    # the linked link moved with it
        self.assertTrue(r["nodes"])
        self.assertIn("crude_oil>airlines", r["edges"])

    def test_unticking_a_linked_link_leaves_it_out(self):
        p = ripple.preview(self.a.kg, "crude_oil", "airlines", -0.4, accepted=[], analysis=self.res)
        self.assertFalse(any(l["selected"] for l in p["linked"]))
        self.assertFalse([c for c in p["ripple"]["chains"] if c["nodes"] == ["crude_oil", "autos"]])

    def test_without_an_analysis_the_ripple_is_a_rise_in_the_source(self):
        p = ripple.preview(self.a.kg, "rate_exp", "real_estate", -0.3)
        self.assertEqual(p["ripple"]["basis"], "unit")
        self.assertIn("Interest-Rate Expectations", p["ripple"]["basis_label"])


class SaveAndRescoreTests(unittest.TestCase):
    def test_saved_as_one_change_and_one_undo_reverts_all(self):
        a = Analyzer()
        v0, before = a.guard.version, snapshot(a.kg)
        r = a.update_edge("crude_oil", "airlines", weight=-0.4,
                          linked=[{"source": "crude_oil", "target": "autos", "weight": -0.15},
                                  {"source": "natural_gas", "target": "utilities", "weight": -0.2}])
        self.assertEqual(r["version"], v0 + 1)
        g = a.kg.g
        self.assertEqual((g["crude_oil"]["airlines"]["strength"], g["crude_oil"]["autos"]["strength"],
                          g["natural_gas"]["utilities"]["strength"]), (0.4, 0.15, 0.2))
        entry = a.guard.history_view(1)["entries"][0]
        self.assertIn("same reason: fuel and energy costs", entry["summary"])
        self.assertEqual(entry["diff_counts"]["links_changed"], 3)
        a.guard.restore_version(v0, "undo")
        self.assertEqual(snapshot(a.kg), before)

    def test_a_missing_linked_link_is_refused(self):
        a = Analyzer()
        r = a.update_edge("crude_oil", "airlines", weight=-0.4, linked=[{"source": "crude_oil", "target": "delta", "weight": -0.1}])
        self.assertIn("error", r)
        self.assertEqual(a.kg.g["crude_oil"]["airlines"]["strength"], 0.8)

    def test_rescore_uses_the_saved_events_and_calls_no_model(self):
        a = Analyzer()
        res = a.analyze(OIL, live=False)
        p = ripple.preview(a.kg, "crude_oil", "airlines", -0.4, analysis=res)
        a.update_edge("crude_oil", "airlines", weight=-0.4,
                      linked=[{"source": l["source"], "target": l["target"], "weight": l["after"]} for l in p["linked"] if l["selected"]])
        articles = len(a.kg.articles)
        with mock.patch.object(llm, "available", return_value=True), mock.patch.object(llm, "_chat") as chat, \
                mock.patch.dict(os.environ, {"ZENITH_REQUIRE_LLM": "1"}):
            r = a.rescore(res)
        chat.assert_not_called()
        self.assertTrue(r["rescored"])
        self.assertEqual([e["label"] for e in r["events"]], [e["label"] for e in res["events"]])
        self.assertEqual((r["graph_changes"], len(a.kg.articles)), ([], articles))   # nothing learned
        after = {x["node"]: x["confidence"] for x in r["sectors"] + r["assets"]}
        for n in p["ripple"]["nodes"]:                                                # the preview predicted the result
            if n["node"] in after and not n["vanished"]:
                self.assertAlmostEqual(after[n["node"]], n["after"]["confidence"], delta=0.02, msg=n["label"])


class EndpointTests(unittest.TestCase):
    def test_preview_save_and_rescore_endpoints(self):
        import server
        from fastapi.testclient import TestClient
        a, lib = Analyzer(), library.AnalysisLibrary(None)
        res = a.analyze(OIL, live=False)
        lib.record(res, title="Oil jumps")
        with mock.patch.object(server, "analyzer", a), mock.patch.object(server, "LIB", lib), \
                mock.patch.object(llm, "available", return_value=False):
            c = TestClient(server.app)
            p = c.post("/api/kb/edge/preview", json={"source": "crude_oil", "target": "airlines", "weight": -0.4,
                                                     "analysis_id": res["article_id"]}).json()
            self.assertEqual(p["ripple"]["basis"], "analysis")
            self.assertEqual(snapshot(a.kg)[("crude_oil", "airlines")][:2], (-1, 0.8))   # preview saved nothing
            linked = [{"source": l["source"], "target": l["target"], "weight": l["after"]} for l in p["linked"] if l["selected"]]
            s = c.post("/api/kb/edge", json={"source": "crude_oil", "target": "airlines", "weight": -0.4, "linked": linked})
            self.assertEqual(s.status_code, 200, s.text)
            self.assertEqual(len(s.json()["linked"]), len(linked))
            r = c.post("/api/analysis/rescore", json={"analysis_id": res["article_id"]}).json()
            self.assertTrue(r["rescored"])
            self.assertEqual(c.post("/api/kb/edge/preview", json={"source": "x", "target": "y", "weight": 0.1}).status_code, 400)


if __name__ == "__main__":
    unittest.main()
