"""A story that names companies but states no move still gets a graph: a context graph (where the companies sit, their peers,
the index, what usually moves their sector) that claims no direction or impact."""
import os
import unittest
from unittest import mock

os.environ["ZENITH_REQUIRE_LLM"] = "0"

from impactgraph import context, library, llm
from impactgraph.graph import KnowledgeGraph
from impactgraph.service import Analyzer

IPO = ("Fusion CX IPO opens for subscription today. The customer-experience firm plans to raise Rs 1,000 crore "
       "through a fresh issue of shares, and the price band has been set at Rs 250 to Rs 270.")
FUSION = {"name": "Fusion CX", "sector": "it_services", "event": "ipo", "direction": 0, "status": "observed",
          "quote": "Fusion CX IPO opens for subscription today."}


def run(text, companies, mode="dynamic", themes=None):
    a = Analyzer()
    a.guard.set_mode(mode)
    with mock.patch.object(llm, "available", return_value=True), \
            mock.patch.object(llm, "extract_graph", return_value=([], [], companies)), \
            mock.patch.object(llm, "suggest_themes", return_value=themes), \
            mock.patch.object(llm, "summarise", return_value=None):
        res = a.analyze(text, live=False, use_llm=True)
    return a, res


class ContextGraphTests(unittest.TestCase):
    def test_ipo_story_gets_a_context_graph_not_an_empty_screen(self):
        a, res = run(IPO, [FUSION])
        self.assertTrue(res["context_only"])
        self.assertEqual(res["context_only"]["focus"], ["Fusion CX"])
        self.assertTrue(res["paths"])                       # conditional chains: how Fusion CX is usually affected
        for p in res["paths"]:
            self.assertTrue(p["conditional"] and p["story"]["conditional"])
            self.assertEqual(p["nodes"][-1], "ent_fusioncx")
            self.assertIn("does not say", p["story"]["opening"])
            self.assertIn("no impact is claimed", p["story"]["conclusion"])
        roles = {n["id"]: n["role"] for n in res["graph"]["nodes"]}
        self.assertEqual(roles["ent_fusioncx"], "focus")
        self.assertEqual(roles["it_services"], "peer")
        self.assertIn("infosys", roles)                     # sector peers
        self.assertIn("nifty50", roles)                     # the index the sector weighs in
        self.assertTrue([n for n, r in roles.items() if r == "driver"])
        for n in res["graph"]["nodes"]:
            self.assertIsNone(n["direction"])               # no direction claimed anywhere
        ids = set(roles)
        self.assertTrue(all(n in ids for p in res["paths"] for n in p["nodes"]))   # every chain is drawn
        for l in res["graph"]["links"]:
            self.assertEqual(l["kind"], "context")
            self.assertIn(l["source"], roles)
            self.assertIn(l["target"], roles)
        self.assertIn("no impact is claimed", res["summary"])
        self.assertIn("IT Services", res["summary"])
        ev = [e for e in res["events"] if e["type"] == "ipo"]
        self.assertEqual(len(ev), 1)
        self.assertEqual(ev[0]["direction"], 0)
        self.assertEqual(ev[0]["label"], "Fusion CX: IPO")

    def test_dynamic_mode_learns_the_company_in_its_sector(self):
        a, res = run(IPO, [FUSION])
        self.assertIn("ent_fusioncx", a.kg.g)
        self.assertTrue(a.kg.g.has_edge("it_services", "ent_fusioncx"))
        self.assertEqual(a.kg.g["it_services"]["ent_fusioncx"]["relation"], "member_of")
        self.assertIn("language model", a.kg.g["it_services"]["ent_fusioncx"]["mechanism"])

    def test_static_mode_uses_a_virtual_node_and_learns_nothing(self):
        a, res = run(IPO, [FUSION], mode="static")
        self.assertNotIn("ent_fusioncx", a.kg.g)
        focus = [n for n in res["graph"]["nodes"] if n["role"] == "focus"]
        self.assertEqual([n["id"] for n in focus], ["new_fusioncx"])
        link = [l for l in res["graph"]["links"] if l["target"] == "new_fusioncx"][0]
        self.assertEqual((link["source"], link["provenance"]), ("it_services", ["inferred"]))
        self.assertIsNone(res["events"][0]["trigger"])

    def test_a_stated_share_move_becomes_a_normal_event(self):
        text = "Fusion CX shares jumped 12% on listing day after a strong debut."
        a, res = run(text, [dict(FUSION, direction=1, event=None, quote="Fusion CX shares jumped 12% on listing day after a strong debut.")])
        self.assertNotIn("context_only", res)
        ev = [e for e in res["events"] if e["trigger"] == "ent_fusioncx"]
        self.assertEqual((ev[0]["type"], ev[0]["direction"]), ("price_move", 1))

    def test_non_financial_story_stays_empty(self):
        a, res = run("The home side won the cup final 3-1 and the captain lifted the trophy in front of a full stadium.", [])
        self.assertNotIn("context_only", res)
        self.assertEqual(res["graph"]["nodes"], [])
        self.assertTrue(res["empty_reason"])

    def test_context_analyses_are_kept_in_the_library(self):
        _, res = run(IPO, [FUSION])
        rec = library.compact(res)
        self.assertIsNotNone(rec)
        self.assertEqual(rec["context_only"]["focus"], ["Fusion CX"])
        _, res = run(IPO, [FUSION], mode="static")
        self.assertIsNotNone(library.compact(res))


class EntityContextTests(unittest.TestCase):
    def test_company_in_the_graph(self):
        ctx = context.entity_context(KnowledgeGraph(), ["infosys"])
        roles = {n["id"]: n["role"] for n in ctx["nodes"]}
        self.assertEqual(roles["infosys"], "focus")
        self.assertEqual(roles["it_services"], "peer")
        self.assertIn("tcs", roles)
        self.assertIn("Infosys sits in the IT Services sector", ctx["summary"])

    def test_variable_focus_shows_the_sectors_it_moves(self):
        ctx = context.entity_context(KnowledgeGraph(), ["crude_oil"])
        self.assertTrue([n for n in ctx["nodes"] if n["type"] == "sector"])

    def test_company_without_a_sector_gives_nothing(self):
        self.assertIsNone(context.entity_context(KnowledgeGraph(), [{"id": "new_x", "label": "X Ltd", "type": "company", "sector": None}]))

    def test_read_only(self):
        kg = KnowledgeGraph()
        before = (kg.g.number_of_nodes(), kg.g.number_of_edges())
        context.entity_context(kg, ["infosys", {"id": "new_x", "label": "X", "type": "company", "sector": "banks"}])
        self.assertEqual((kg.g.number_of_nodes(), kg.g.number_of_edges()), before)


class ValidCompaniesTests(unittest.TestCase):
    def test_validation(self):
        text = "Fusion CX IPO opens today. HDFC Bank was the lead banker. Acme shares fell 4%."
        out = llm._valid_companies([
            {"name": "Fusion CX", "sector": "it_services", "event": "ipo", "quote": "Fusion CX IPO opens today."},
            {"name": "Ghost Corp", "sector": "banks"},                         # not in the text
            {"name": "HDFC Bank", "sector": "banks"},                          # already a graph node
            {"name": "Acme", "sector": "made_up", "direction": -1, "event": "weird", "quote": "invented"},
            {"name": "fusion cx"},                                             # duplicate
        ], text)
        self.assertEqual([c["name"] for c in out], ["Fusion CX", "Acme"])
        self.assertEqual((out[0]["sector"], out[0]["event"], out[0]["direction"]), ("it_services", "ipo", 0))
        self.assertEqual((out[1]["sector"], out[1]["event"], out[1]["direction"], out[1]["quote"]), (None, None, -1, None))


if __name__ == "__main__":
    unittest.main()
