import os
import unittest

os.environ["ZENITH_REQUIRE_LLM"] = "0"

from impactgraph import hierarchy as H
from impactgraph.graph import KnowledgeGraph
from impactgraph.service import Analyzer

TEXT = "Brent crude jumped 12% on Monday after an attack on tankers. Airline stocks fell sharply, Delta Air Lines fell most."


class StoredPropertyTests(unittest.TestCase):
    def test_every_curated_node_and_link_carries_stored_properties(self):
        g = KnowledgeGraph().g
        for n, d in g.nodes(data=True):
            self.assertIn(d["tier"], ("event", "variable", "sector", "asset"), n)
            self.assertEqual(d["origin"], "curated")
            self.assertIn(d["market"], ("US", "IN", "GLOBAL"))
            self.assertIsNone(d["first_seen"])
        for u, v, e in g.edges(data=True):
            self.assertIn(e["relation"], H.RELATIONS, (u, v))

    def test_relations_by_endpoint(self):
        g = KnowledgeGraph().g
        self.assertEqual(g["airlines"]["delta"]["relation"], "member_of")
        self.assertEqual(g["airlines"]["jets"]["relation"], "tracks")
        self.assertEqual(g["banks"]["nifty_bank"]["relation"], "tracks")
        self.assertEqual(g["banks"]["spx"]["relation"], "weight_in")
        self.assertEqual(g["gold"]["gld"]["relation"], "tracks")
        self.assertEqual(g["reliance"]["nifty50"]["relation"], "weight_in")
        self.assertEqual(g["crude_oil"]["airlines"]["relation"], "causes")
        self.assertTrue(any(e["relation"] == "policy_reaction" for _, _, e in g.out_edges("fed", data=True)))

    def test_reliance_is_now_a_member_of_its_sector(self):
        kg = KnowledgeGraph()
        self.assertEqual(H.parent_sector(kg, "reliance")["id"], "refiners")
        self.assertIn("reliance", H.members_of(kg, "refiners"))
        self.assertIn("nifty_realty", H.members_of(kg, "real_estate"))
        self.assertNotIn("spx", H.members_of(kg, "banks"))   # a sector's weight in a broad index is not membership

    def test_llm_links_are_always_plain_causal_claims(self):
        self.assertEqual(H.relation_for("sector", "company", "banks", "xyz", ["llm_proposed"]), "causes")

    def test_user_added_and_learned_nodes_record_their_origin(self):
        kg = KnowledgeGraph()
        kg.add_asset({"id": "newco", "label": "NewCo", "type": "company", "series": [], "kind": None}, sector="airlines")
        self.assertEqual(kg.g.nodes["newco"]["origin"], "user")
        self.assertEqual(kg.g.nodes["newco"]["market"], "unknown")
        self.assertIsNotNone(kg.g.nodes["newco"]["first_seen"])
        self.assertEqual(kg.g["airlines"]["newco"]["relation"], "member_of")
        kg.add_asset({"id": "newidx", "label": "New Index", "type": "index", "series": [], "kind": None}, sector="banks")
        self.assertEqual(kg.g["banks"]["newidx"]["relation"], "tracks")
        self.assertEqual(H.parent_sector(kg, "newco")["id"], "airlines")

    def test_articles_that_mention_a_node_are_recorded(self):
        a = Analyzer()
        a.analyze(TEXT, live=False, use_llm=False)
        self.assertEqual(len(a.kg.g.nodes["crude_oil"]["articles"]), 1)
        a.analyze(TEXT, live=False, use_llm=False)                  # the same article again is not counted twice
        self.assertEqual(len(a.kg.g.nodes["crude_oil"]["articles"]), 1)
        a.analyze("Gold rose 3% while crude oil slipped 2%.", live=False, use_llm=False)
        self.assertEqual(len(a.kg.g.nodes["crude_oil"]["articles"]), 2)

    def test_a_state_saved_before_these_properties_is_backfilled(self):
        kg = KnowledgeGraph()
        kg.add_asset({"id": "newco", "label": "NewCo", "type": "company", "series": [], "kind": None}, sector="airlines")
        want = {n: dict(d) for n, d in kg.g.nodes(data=True)}
        rel = {(u, v): e["relation"] for u, v, e in kg.g.edges(data=True)}
        for _, d in kg.g.nodes(data=True):
            for k in ("tier", "origin", "market", "first_seen", "articles"):
                d.pop(k, None)
        for _, _, e in kg.g.edges(data=True):
            e.pop("relation", None)
        self.assertGreater(H.ensure_properties(kg), 0)
        for n, d in kg.g.nodes(data=True):
            self.assertEqual((d["tier"], d["origin"], d["market"]), (want[n]["tier"], want[n]["origin"], want[n]["market"]), n)
        self.assertEqual({(u, v): e["relation"] for u, v, e in kg.g.edges(data=True)}, rel)
        self.assertEqual(H.ensure_properties(kg), 0)                # idempotent

    def test_a_link_without_a_stored_relation_is_still_understood(self):
        kg = KnowledgeGraph()
        del kg.g["airlines"]["delta"]["relation"]
        self.assertEqual(H.rel(kg.g, "airlines", "delta"), "member_of")


class NodePropertiesTests(unittest.TestCase):
    def setUp(self):
        self.kg = KnowledgeGraph()

    def test_unknown_node(self):
        self.assertIsNone(H.node_properties(self.kg, "nope"))

    def test_event_tier(self):
        p = H.node_properties(self.kg, "geopolitical_tension")
        self.assertEqual((p["tier"], p["is_policy_body"]), ("event", False))
        self.assertTrue(H.node_properties(self.kg, "fed")["is_policy_body"])
        self.assertTrue(p["affects"])

    def test_variable_tier(self):
        oil = H.node_properties(self.kg, "crude_oil")
        self.assertIn("percent return", oil["measure"])
        self.assertTrue(oil["has_market_data"])
        self.assertIn("percentage points", H.node_properties(self.kg, "us10y")["measure"])
        gdp = H.node_properties(self.kg, "gdp_growth")
        self.assertFalse(gdp["has_market_data"])
        self.assertIn("no market series", gdp["measure"])
        self.assertEqual([x["id"] for x in H.node_properties(self.kg, "gold")["tracked_by"]], ["gld"])

    def test_sector_tier(self):
        p = H.node_properties(self.kg, "airlines")
        self.assertEqual({m["id"] for m in p["members"]}, {"delta", "united", "indigo", "jets"})
        self.assertEqual({m["relation"] for m in p["members"]}, {"member_of", "tracks"})
        self.assertTrue(H.node_properties(self.kg, "banks")["weight_in"])

    def test_asset_tier(self):
        p = H.node_properties(self.kg, "delta")
        self.assertEqual((p["ticker"], p["parent_sector"]["id"], p["market"]), ("DAL", "airlines", "US"))
        self.assertEqual([x["id"] for x in H.node_properties(self.kg, "gld")["tracks"]], ["gold"])
        self.assertEqual(H.node_properties(self.kg, "reliance")["market"], "IN")

    def test_endpoint_and_graph_json(self):
        from fastapi.testclient import TestClient
        import server
        c = TestClient(server.app)
        r = c.get("/api/node/delta")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["parent_sector"]["id"], "airlines")
        self.assertEqual(c.get("/api/node/nope").status_code, 404)
        j = c.get("/api/graph").json()
        self.assertTrue(all(n["origin"] and n["market"] for n in j["nodes"]))
        self.assertTrue(all(l["relation"] in H.RELATIONS for l in j["links"]))
        self.assertIn("by_relation", c.get("/api/hierarchy").json()["audit"])


class PropagationUnchangedTests(unittest.TestCase):
    def test_relations_do_not_change_scores(self):
        a, b = Analyzer(), Analyzer()
        for _, _, e in b.kg.g.edges(data=True):
            e.pop("relation", None)
        ra, rb = a.analyze(TEXT, live=False, use_llm=False), b.analyze(TEXT, live=False, use_llm=False)
        self.assertEqual([(x["node"], x["direction"], x["confidence"]) for x in ra["assets"]],
                         [(x["node"], x["direction"], x["confidence"]) for x in rb["assets"]])


if __name__ == "__main__":
    unittest.main()
