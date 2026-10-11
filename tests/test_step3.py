import os
import unittest
from unittest import mock

os.environ["ZENITH_REQUIRE_LLM"] = "0"

from impactgraph import cards, hierarchy
from impactgraph.graph import KnowledgeGraph
from impactgraph.service import Analyzer

TEXT = "Brent crude jumped 12% on Monday after an attack on tankers. Airline stocks fell sharply, Delta Air Lines fell most."


def step(frm, to, to_layer, prov, val=None):
    return {"from": frm, "to": to, "to_layer": to_layer, "provenance": prov, "validation": val}


class TierSentenceTests(unittest.TestCase):
    def test_format_and_event_prefix(self):
        chain = [{"label": "Crude Oil", "tier": "variable", "direction": 1}, {"label": "Airlines", "tier": "sector", "direction": -1},
                 {"label": "Delta", "tier": "asset", "direction": -1}]
        self.assertEqual(hierarchy.tier_sentence(chain, "Crude Oil up 12%"),
                         "Event: Crude Oil up 12% → Variable: Crude Oil ↑ → Sector: Airlines ↓ → Asset: Delta ↓")
        self.assertEqual(hierarchy.tier_sentence(chain), "Variable: Crude Oil ↑ → Sector: Airlines ↓ → Asset: Delta ↓")
        ev = [{"label": "Geopolitical Tension", "tier": "event", "direction": 1}] + chain[:1]
        self.assertEqual(hierarchy.tier_sentence(ev, "attack").count("Event:"), 1)       # no duplicate Event prefix

    def test_every_path_and_asset_row_carries_a_sentence_that_matches_its_headline(self):
        r = Analyzer().analyze(TEXT, live=False, use_llm=False)
        for p in r["paths"]:
            self.assertEqual(len(p["chain"]), len(p["nodes"]))
            for c, node_text in zip(p["chain"], p["headline"].split(" → ")):
                self.assertIn("%s %s" % (c["label"], "↑" if c["direction"] > 0 else "↓"), p["tier_sentence"])
                self.assertEqual(node_text, "%s %s" % (c["label"], "↑" if c["direction"] > 0 else "↓"))
            self.assertEqual([c["tier"] for c in p["chain"]], p["layers"])
        for a in r["assets"]:
            self.assertTrue(a["tier_sentence"].endswith("%s %s" % (a["label"], "↑" if a["direction"] > 0 else "↓")), a["tier_sentence"])
        w = Analyzer().whatif("crude_oil", 10)
        self.assertTrue(all(a["tier_sentence"] for a in w["assets"]))


class EvidenceMixTests(unittest.TestCase):
    def test_hand_counted_mix_each_link_counted_once_under_its_strongest_basis(self):
        sim = {"verdict": "supported", "simulated": True}
        real_ok = {"verdict": "supported", "simulated": False}
        real_bad = {"verdict": "contradicted", "simulated": False}
        p1 = {"steps": [step("a", "b", "sector", ["prior"]),
                        step("b", "c", "asset", ["prior", "observed", "validated"]),
                        step("b", "d", "asset", ["prior"], real_ok)]}
        p2 = {"steps": [step("a", "b", "sector", ["prior"]),                       # the same link again: not counted twice
                        step("b", "e", "asset", ["prior", "llm_proposed"]),
                        step("b", "f", "asset", ["prior"], sim),                   # simulated data is ignored
                        step("b", "g", "asset", ["prior", "validated"], real_bad),  # contradicted wins
                        step("a", "h", "variable", ["prior", "user_edited"])]}
        m = hierarchy.evidence_mix([p1, p2])
        self.assertEqual({k: m["asset"][k] for k in hierarchy.BASIS_ORDER},
                         {"user": 0, "contradicted": 1, "observed": 1, "validated": 1, "llm": 1, "prior_only": 1})
        self.assertEqual(m["asset"]["total"], 5)
        self.assertEqual((m["sector"]["prior_only"], m["sector"]["total"]), (1, 1))
        self.assertEqual((m["variable"]["user"], m["variable"]["total"]), (1, 1))
        self.assertEqual(m["event"]["total"], 0)

    def test_link_basis_priority(self):
        lb = hierarchy.link_basis
        self.assertEqual(lb(["prior"], None), "prior_only")
        self.assertEqual(lb(["prior", "validated"], None), "validated")
        self.assertEqual(lb(["prior", "observed", "validated"], None), "observed")
        self.assertEqual(lb(["user_added", "observed"], {"verdict": "contradicted"}), "user")

    def test_analysis_totals_equal_the_distinct_links_on_its_paths(self):
        r = Analyzer().analyze(TEXT, live=False, use_llm=False)
        links = {(s["from"], s["to"]): s["to_layer"] for p in r["paths"] for s in p["steps"]}
        by_tier = {}
        for t in links.values():
            by_tier[t] = by_tier.get(t, 0) + 1
        for l in r["hierarchy"]["layers"]:
            if l["id"] == "event":
                self.assertEqual(l["evidence"]["kind"], "events")
                self.assertEqual(l["evidence"]["total"], len(r["sources"]))
                continue
            ev = l["evidence"]
            self.assertEqual(ev["total"], by_tier.get(l["id"], 0))
            self.assertEqual(sum(ev[b] for b in hierarchy.BASIS_ORDER), ev["total"])
        self.assertIn("evidence", Analyzer().whatif("crude_oil", 10)["hierarchy"]["layers"][1])

    def test_without_live_data_nothing_is_called_validated_unless_it_was_before(self):
        r = Analyzer().analyze(TEXT, live=False, use_llm=False)
        for l in r["hierarchy"]["layers"]:
            if l["evidence"]["kind"] == "links":
                self.assertEqual(l["evidence"]["contradicted"], 0)


class CardTests(unittest.TestCase):
    def setUp(self):
        self.kg = Analyzer().kg

    def test_one_card_per_node_link_sector_and_tier_with_stable_ids(self):
        a, b = cards.all_cards(self.kg), cards.all_cards(self.kg)
        self.assertEqual([c["id"] for c in a], [c["id"] for c in b])
        self.assertEqual(cards.fingerprint(a), cards.fingerprint(b))
        by = {}
        for c in a:
            by.setdefault(c["kind"], []).append(c)
        self.assertEqual(len(by["node"]), self.kg.g.number_of_nodes())
        self.assertEqual(len(by["link"]), self.kg.g.number_of_edges())
        self.assertEqual(len(by["tier"]), 4)
        self.assertEqual(len(by["sector"]), sum(1 for _, d in self.kg.g.nodes(data=True) if d["tier"] == "sector"))
        self.assertEqual(len({c["id"] for c in a}), len(a))
        for c in a:
            self.assertTrue(c["text"] and c["brief"] and c["tiers"] and c["refs"], c["id"])

    def test_card_facts_come_from_the_graph(self):
        e = self.kg.g["crude_oil"]["airlines"]
        c = cards.get_card(self.kg, "l:crude_oil>airlines")
        self.assertIn("Stored strength %.2f" % e["strength"], c["text"])
        self.assertIn("lag %d days" % e["lag"], c["text"])
        s = cards.get_card(self.kg, "s:airlines")
        for m in ("Delta Air Lines", "United Airlines", "IndiGo", "JETS"):
            self.assertIn(m, s["text"])
        self.assertIn("Tier 2", cards.get_card(self.kg, "t:sector")["text"])

    def test_the_fingerprint_changes_exactly_when_the_graph_changes(self):
        a = Analyzer()
        before = cards.fingerprint(cards.all_cards(a.kg))
        self.assertEqual(before, cards.fingerprint(cards.all_cards(a.kg)))
        a.update_edge("crude_oil", "airlines", weight=-0.5)
        self.assertNotEqual(before, cards.fingerprint(cards.all_cards(a.kg)))

    def test_filters(self):
        allc = cards.all_cards(self.kg)
        sec = cards.select(allc, tier="sector")
        self.assertTrue(sec and all("sector" in c["tiers"] for c in sec))
        d = cards.select(allc, node="delta")
        self.assertTrue(any(c["id"] == "n:delta" for c in d) and any(c["id"] == "s:airlines" for c in d))
        self.assertTrue(all(c["kind"] == "link" for c in cards.select(allc, kind="link")))
        self.assertEqual(cards.select(allc, tier="sector", node="crude_oil", kind="node"), [])

    def test_path_cards_can_be_rebuilt_from_their_id_and_match_the_search(self):
        paths = cards.find_paths(self.kg, "crude_oil", "delta", 3)
        self.assertTrue(paths)
        for p in paths:
            card = cards.path_card(self.kg, p)
            again = cards.get_card(self.kg, card["id"])
            self.assertEqual(again["text"], card["text"])                      # same plausibility, lag and steps
            rebuilt = cards.path_from_nodes(self.kg, p["nodes"])
            self.assertAlmostEqual(rebuilt["score"], p["score"], places=6)
            self.assertEqual((rebuilt["lag"], rebuilt["sign"]), (p["lag"], p["sign"]))
        self.assertIsNone(cards.path_from_nodes(self.kg, ["crude_oil", "delta"]))   # no such direct link
        self.assertIsNone(cards.get_card(self.kg, "p:crude_oil>delta"))

    def test_unknown_ids(self):
        for bad in ("n:nope", "l:a>b", "s:crude_oil", "t:nope", "zz:1", "nonsense"):
            self.assertIsNone(cards.get_card(self.kg, bad), bad)

    def test_the_chatbot_and_the_export_use_the_same_text(self):
        from impactgraph import assistant
        ac = {c["id"]: c for c in assistant.build_cards(self.kg, ["crude_oil", "airlines"])}
        self.assertEqual(ac["l:crude_oil>airlines"]["text"], cards.get_card(self.kg, "l:crude_oil>airlines")["text"])
        self.assertEqual(ac["n:airlines"]["text"], cards.get_card(self.kg, "n:airlines")["text"])


class EndpointTests(unittest.TestCase):
    def setUp(self):
        import server
        from fastapi.testclient import TestClient
        self.a = Analyzer()
        self.p = mock.patch.object(server, "analyzer", self.a)
        self.p.start()
        self.c = TestClient(server.app)

    def tearDown(self):
        self.p.stop()

    def test_cards_endpoint(self):
        j = self.c.get("/api/kg/cards?limit=5").json()
        self.assertEqual(j["graph_version"], {"version": self.a.guard.version, "epoch": 0})
        self.assertEqual(len(j["cards"]), 5)
        self.assertEqual(j["total_cards"], len(cards.all_cards(self.a.kg)))
        self.assertEqual(len(j["fingerprint"]), 16)
        page2 = self.c.get("/api/kg/cards?limit=5&offset=5").json()["cards"]
        self.assertNotEqual([c["id"] for c in page2], [c["id"] for c in j["cards"]])
        t = self.c.get("/api/kg/cards?tier=sector&kind=sector&limit=100").json()
        self.assertTrue(t["matched"] and all(c["kind"] == "sector" for c in t["cards"]))
        n = self.c.get("/api/kg/cards?node=delta&limit=100").json()
        self.assertIn("n:delta", [c["id"] for c in n["cards"]])
        self.assertEqual(self.c.get("/api/kg/cards?limit=0").status_code, 422)

    def test_card_endpoint_including_ids_with_arrows(self):
        r = self.c.get("/api/kg/cards/l:crude_oil>airlines")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["card"]["id"], "l:crude_oil>airlines")
        self.assertEqual(self.c.get("/api/kg/cards/n:delta").json()["card"]["tiers"], ["asset"])
        self.assertEqual(self.c.get("/api/kg/cards/n:nope").status_code, 404)

    def test_paths_endpoint(self):
        j = self.c.get("/api/kg/paths?src=crude_oil&dst=delta&limit=2").json()
        self.assertTrue(j["cards"] and all(c["kind"] == "path" for c in j["cards"]))
        gap = self.c.get("/api/kg/paths?src=wheat&dst=delta").json()["cards"]
        self.assertTrue(gap[0]["kind"] in ("gap", "path"))
        self.assertEqual(self.c.get("/api/kg/paths?src=nope").status_code, 404)

    def test_the_export_reflects_an_edit_through_a_new_fingerprint(self):
        f0 = self.c.get("/api/kg/cards?limit=1").json()["fingerprint"]
        self.c.post("/api/kb/edge", json={"source": "crude_oil", "target": "airlines", "weight": -0.5})
        self.assertNotEqual(f0, self.c.get("/api/kg/cards?limit=1").json()["fingerprint"])


if __name__ == "__main__":
    unittest.main()
