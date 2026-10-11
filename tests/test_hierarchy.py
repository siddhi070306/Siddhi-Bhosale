import os
import unittest

os.environ["ZENITH_REQUIRE_LLM"] = "0"

from impactgraph import hierarchy, kbstate
from impactgraph.graph import KnowledgeGraph
from impactgraph.service import Analyzer

TEXT = ("Brent crude jumped 12% on Monday after an attack on tankers. Airline stocks fell sharply, "
        "with Delta Air Lines among the biggest decliners.")


class HierarchyTests(unittest.TestCase):
    def test_every_type_has_a_tier_and_tiers_are_ordered(self):
        for t, lay in (("event_class", 0), ("institution", 0), ("commodity", 1), ("indicator", 1), ("sector", 2),
                       ("company", 3), ("index", 3), ("instrument", 3)):
            self.assertEqual(hierarchy.layer_of(t)["level"], lay)
        self.assertEqual([l["level"] for l in hierarchy.LAYERS], [0, 1, 2, 3])

    def test_edge_kinds(self):
        self.assertEqual(hierarchy.edge_kind("commodity", "sector")["kind"], "next")
        self.assertEqual(hierarchy.edge_kind("sector", "company")["kind"], "next")
        self.assertEqual(hierarchy.edge_kind("indicator", "index")["kind"], "skip")
        self.assertEqual(hierarchy.edge_kind("indicator", "commodity")["kind"], "lateral")
        self.assertEqual(hierarchy.edge_kind("sector", "indicator")["kind"], "feedback")

    def test_curated_graph_audit_adds_up_and_has_only_the_known_feedback(self):
        kg = KnowledgeGraph()
        a = hierarchy.audit(kg)
        self.assertEqual(sum(a["by_kind"].values()), kg.g.number_of_edges())
        self.assertEqual(sorted(a["feedback_links"]), ["banks -> consumer_spending", "banks -> gdp_growth"])
        self.assertEqual(a["learned_links_pointing_up_from_assets"], [])

    def test_sector_membership(self):
        kg = KnowledgeGraph()
        self.assertEqual(set(hierarchy.members_of(kg, "airlines")), {"delta", "united", "indigo", "jets"})
        self.assertEqual(hierarchy.parent_sector(kg, "delta")["id"], "airlines")
        self.assertIsNone(hierarchy.parent_sector(kg, "crude_oil"))

    def test_full_json_carries_tiers_and_link_kinds(self):
        j = KnowledgeGraph().full_json()
        delta = next(n for n in j["nodes"] if n["id"] == "delta")
        self.assertEqual((delta["layer"], delta["level"], delta["parent"]["id"]), ("asset", 3, "airlines"))
        self.assertTrue(all("kind" in l for l in j["links"]))
        self.assertEqual(len(j["layers"]), 4)

    def test_analysis_rollup_matches_its_own_rows(self):
        r = Analyzer().analyze(TEXT, live=False, use_llm=False)
        h = r["hierarchy"]
        self.assertEqual([l["level"] for l in h["layers"]], [0, 1, 2, 3])
        by = {l["id"]: l for l in h["layers"]}
        self.assertEqual(by["asset"]["count"], len(r["assets"]))
        self.assertEqual(by["sector"]["count"], len(r["sectors"]))
        self.assertEqual(by["variable"]["count"], len(r["variables"]))
        self.assertEqual(by["event"]["count"], len(r["sources"]))
        air = next(d for d in h["sector_members"] if d["sector"] == "airlines")
        self.assertEqual(air["members_total"], 4)
        self.assertEqual(air["members_reached"], len(air["members"]))
        asset_ids = {a["node"] for a in r["assets"]}
        self.assertTrue(all(m["node"] in asset_ids for m in air["members"]))
        self.assertTrue(all(m["agrees_with_sector"] == (m["direction"] == air["direction"]) for m in air["members"]))

    def test_paths_and_graph_nodes_are_labelled_with_tiers(self):
        r = Analyzer().analyze(TEXT, live=False, use_llm=False)
        for p in r["paths"]:
            self.assertEqual(len(p["layers"]), len(p["nodes"]))
            self.assertEqual(len(p["steps"]), len(p["nodes"]) - 1)
            for st in p["steps"]:
                self.assertIn(st["step_kind"], ("next", "skip", "lateral", "feedback"))
            self.assertEqual(p["skips_tier"], any(s["step_kind"] == "skip" for s in p["steps"]))
        self.assertTrue(all("layer" in n for n in r["graph"]["nodes"]))

    def test_every_path_score_is_the_product_of_its_strengths_and_per_link_decays(self):
        r = Analyzer().analyze(TEXT, live=False, use_llm=False)
        self.assertTrue(r["paths"])
        for p in r["paths"]:
            prod = 1.0
            for st in p["steps"]:
                self.assertIn("decay", st)
                prod *= st["effective"] * st["decay"]
            self.assertAlmostEqual(prod, p["score"], delta=0.006, msg=p["headline"])
            self.assertEqual(p["steps"][0]["decay"], 1.0)

    def test_guard_rejects_a_learned_link_that_points_up_from_an_asset(self):
        a = Analyzer()
        ok = kbstate.health(a.kg)
        self.assertTrue(next(c for c in ok["checks"] if c["name"].startswith("hierarchy"))["ok"])
        a.kg.g.add_edge("delta", "crude_oil", sign=1, strength=0.5, lag=1, mechanism="bogus", provenance=["llm_proposed"],
                        evidence=[], inferred=True)
        bad = kbstate.health(a.kg)
        self.assertFalse(next(c for c in bad["checks"] if c["name"].startswith("hierarchy"))["ok"])

    def test_whatif_carries_the_rollup(self):
        w = Analyzer().whatif("crude_oil", 10)
        self.assertEqual(len(w["hierarchy"]["layers"]), 4)
        self.assertEqual(w["hierarchy"]["layers"][0]["top"][0]["status"], "hypothetical")



class UserAddedMembershipTests(unittest.TestCase):
    def test_an_asset_the_user_assigns_to_a_sector_is_a_member_of_it(self):
        kg = KnowledgeGraph()
        kg.add_asset({"id": "newco", "label": "NewCo", "type": "company", "series": "NEWCO", "kind": "ret"}, sector="airlines")
        self.assertEqual(hierarchy.parent_sector(kg, "newco")["id"], "airlines")
        self.assertIn("newco", hierarchy.members_of(kg, "airlines"))

if __name__ == "__main__":
    unittest.main()
