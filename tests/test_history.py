import copy
import json
import os
import tempfile
import unittest
from unittest import mock

os.environ["ZENITH_REQUIRE_LLM"] = "0"

from impactgraph import changelog, hierarchy, kb, kbstate
from impactgraph.graph import KnowledgeGraph
from impactgraph.service import Analyzer

TEXT = "Brent crude jumped 12% on Monday after an attack on tankers. Airline stocks fell sharply, Delta Air Lines fell most."


def fresh():
    return Analyzer()


def add_user_asset(a, nid="u_newco", sector="airlines", typ="company"):
    spec = {"id": nid, "label": "NewCo", "type": typ, "aliases": [], "series": [], "kind": None}
    before = a.guard.begin()
    kb.NODES[nid] = spec
    kbstate.KBGuard._nodes_changed()
    a.kg.add_asset(spec, sector)
    return a.guard.finish(before, "added asset NewCo", actor="user", action="add_asset")


class DiffTests(unittest.TestCase):
    def test_diff_reports_added_removed_and_changed(self):
        old = KnowledgeGraph().g
        new = copy.deepcopy(old)
        new["crude_oil"]["airlines"]["strength"] = 0.5
        new["crude_oil"]["airlines"]["sign"] = 1
        new.remove_edge("gold", "gld")
        new.add_node("zz", label="ZZ", type="company", tier="asset")
        new.add_edge("airlines", "zz", sign=1, strength=0.5, lag=0, mechanism="m", provenance=["user_added"], evidence=[],
                     relation="member_of")
        d = changelog.diff_graphs(old, new)
        self.assertEqual(d["counts"], {"nodes_added": 1, "nodes_removed": 0, "links_added": 1, "links_removed": 1, "links_changed": 1})
        ch = d["links_changed"][0]
        fields = {f["field"]: (f["before"], f["after"]) for f in ch["fields"]}
        self.assertEqual(fields["sign"], (-1, 1))
        self.assertEqual(fields["strength"][1], 0.5)
        self.assertEqual(d["links_added"][0]["relation"], "member_of")
        self.assertTrue(changelog.is_empty(changelog.diff_graphs(old, copy.deepcopy(old))))


class EditThroughTheGuardTests(unittest.TestCase):
    def test_an_edit_is_one_recorded_versioned_change(self):
        a = fresh()
        v0 = a.guard.version
        res = a.update_edge("crude_oil", "airlines", weight=-0.5, reason="testing the jet fuel link")
        self.assertTrue(res["ok"])
        self.assertEqual(a.guard.version, v0 + 1)
        e = a.guard.history[-1]
        self.assertEqual((e["actor"], e["action"], e["version"], e["parent"]), ("user", "edit_link", v0 + 1, v0))
        self.assertEqual(e["reason"], "testing the jet fuel link")
        self.assertEqual(e["tiers"], ["variable", "sector"])
        f = {x["field"]: x for x in e["diff"]["links_changed"][0]["fields"]}
        self.assertEqual((f["strength"]["before"], f["strength"]["after"]), (0.8, 0.5))
        self.assertIn("user_edited", f["provenance"]["after"])

    def test_a_deliberate_sign_flip_of_a_curated_link_is_allowed_and_flagged(self):
        a = fresh()
        res = a.update_edge("crude_oil", "oil_gas_producers", weight=-0.85)
        self.assertTrue(res["ok"], res)
        self.assertEqual(a.kg.g["crude_oil"]["oil_gas_producers"]["sign"], -1)
        self.assertEqual(a.guard.status()["edited_links"], 1)
        names = {c["name"]: c["ok"] for c in a.guard.last_health["checks"]}
        self.assertTrue(names["curated links intact (same sign)"])
        self.assertTrue(names["baseline regression"])

    def test_the_guard_still_rolls_back_a_structurally_bad_edit(self):
        a = fresh()
        before = a.guard.begin()
        a.kg.g.add_edge("delta", "crude_oil", sign=1, strength=0.5, lag=1, mechanism="bogus", provenance=["llm_proposed"],
                        evidence=[], inferred=True, relation="causes")
        rep = a.guard.finish(before, "bad", actor="user", action="add_link", user_edit=True)
        self.assertTrue(rep["rolled_back"])
        self.assertFalse(a.kg.g.has_edge("delta", "crude_oil"))

    def test_undo_marks_the_change_undone_and_keeps_it_in_the_history(self):
        a = fresh()
        a.update_edge("crude_oil", "airlines", weight=-0.5)
        v = a.guard.version
        a.guard.revert("previous")
        self.assertEqual(a.guard.version, v - 1)
        self.assertEqual(a.kg.g["crude_oil"]["airlines"]["strength"], 0.8)
        acts = [(e["action"], e["undone"]) for e in a.guard.history]
        self.assertEqual(acts, [("edit_link", True), ("undo", False)])


class RestoreTests(unittest.TestCase):
    def test_restore_is_a_new_forward_version_and_nothing_is_erased(self):
        a = fresh()
        a.update_edge("crude_oil", "airlines", weight=-0.5)          # v1
        a.update_edge("crude_oil", "airlines", weight=-0.3)          # v2
        e = a.guard.restore_version(1, "back to 0.5")
        self.assertEqual(a.guard.version, 3)
        self.assertEqual(a.kg.g["crude_oil"]["airlines"]["strength"], 0.5)
        self.assertEqual(e["action"], "restore")
        self.assertEqual(len(a.guard.history), 3)
        self.assertEqual(a.guard.history[-1]["reason"], "back to 0.5")

    def test_unknown_or_old_versions_are_refused_with_the_restorable_list(self):
        a = fresh()
        with self.assertRaises(ValueError) as cm:
            a.guard.restore_version(99)
        self.assertIn("restorable", str(cm.exception))

    def test_only_the_last_30_versions_are_restorable(self):
        a = fresh()
        for i in range(35):
            a.update_edge("crude_oil", "airlines", weight=-(0.3 + (i % 5) * 0.1))
        self.assertEqual(len(a.guard.restorable_versions()), 30)
        self.assertEqual(len(a.guard.history), 35)


class AddAndRemoveLinkTests(unittest.TestCase):
    def test_rules_for_a_new_link(self):
        a = fresh()
        k = a.kg
        self.assertIn("unknown node", hierarchy.check_link(k, "nope", "delta")["errors"][0])
        self.assertFalse(hierarchy.check_link(k, "delta", "delta")["ok"])
        self.assertIn("already exists", hierarchy.check_link(k, "crude_oil", "airlines")["errors"][0])
        up = hierarchy.check_link(k, "delta", "crude_oil")
        self.assertFalse(up["ok"])
        self.assertIn("up the hierarchy from an asset", up["errors"][0])
        skip = hierarchy.check_link(k, "copper", "spx")
        self.assertTrue(skip["ok"])
        self.assertIn("skips a tier", skip["warnings"][0])
        self.assertIn("goes back up", hierarchy.check_link(k, "banks", "usd")["warnings"][0])
        self.assertFalse(hierarchy.check_link(k, "crude_oil", "delta", relation="member_of")["ok"])
        self.assertFalse(hierarchy.check_link(k, "crude_oil", "delta", relation="bogus")["ok"])

    def test_adding_a_link_is_recorded_and_flagged_as_the_users(self):
        a = fresh()
        res = a.add_link("copper", "spx", 1, 0.4, 5, "Copper demand signals industrial growth, which lifts equities", reason="my view")
        self.assertTrue(res["ok"], res)
        self.assertIn("skips a tier", res["warnings"][0])
        e = a.kg.g["copper"]["spx"]
        self.assertEqual((e["relation"], e["provenance"], e["strength"]), ("causes", ["user_added"], 0.4))
        h = a.guard.history[-1]
        self.assertEqual((h["actor"], h["action"], h["reason"]), ("user", "add_link", "my view"))
        self.assertEqual(h["diff"]["counts"]["links_added"], 1)

    def test_a_link_needs_a_mechanism_a_valid_sign_and_passes_the_tier_rule(self):
        a = fresh()
        self.assertIn("mechanism", a.add_link("copper", "spx", 1, 0.4, 5, "short")["error"])
        self.assertIn("sign", a.add_link("copper", "spx", 0, 0.4, 5, "long enough sentence here")["error"])
        self.assertIn("hierarchy", a.add_link("delta", "crude_oil", 1, 0.4, 5, "long enough sentence here")["error"])
        self.assertFalse(a.kg.g.has_edge("copper", "spx"))

    def test_only_a_link_the_user_added_can_be_removed(self):
        a = fresh()
        a.add_link("copper", "spx", 1, 0.4, 5, "Copper demand signals industrial growth")
        self.assertTrue(a.remove_link("copper", "spx", reason="changed my mind")["ok"])
        self.assertFalse(a.kg.g.has_edge("copper", "spx"))
        self.assertEqual(a.guard.history[-1]["action"], "remove_link")
        self.assertIn("only links you added", a.remove_link("crude_oil", "airlines")["error"])


class MoveAssetTests(unittest.TestCase):
    def test_a_user_asset_can_move_between_sectors(self):
        a = fresh()
        self.assertFalse(add_user_asset(a)["rolled_back"])
        self.assertEqual(hierarchy.parent_sector(a.kg, "u_newco")["id"], "airlines")
        res = a.move_asset("u_newco", "banks", "it is a bank")
        self.assertTrue(res["ok"], res)
        self.assertEqual(hierarchy.parent_sector(a.kg, "u_newco")["id"], "banks")
        self.assertFalse(a.kg.g.has_edge("airlines", "u_newco"))
        h = a.guard.history[-1]
        self.assertEqual((h["action"], h["diff"]["counts"]["links_added"], h["diff"]["counts"]["links_removed"]), ("move_asset", 1, 1))
        self.assertIn("already in that sector", a.move_asset("u_newco", "banks")["error"])

    def test_curated_memberships_are_not_moved_and_only_sectors_accept_assets(self):
        a = fresh()
        self.assertIn("curated", a.move_asset("delta", "banks")["error"])
        add_user_asset(a)
        self.assertIn("sector", a.move_asset("u_newco", "crude_oil")["error"])


class ExportImportTests(unittest.TestCase):
    def test_round_trip(self):
        a = fresh()
        a.update_edge("crude_oil", "airlines", weight=-0.5)
        data = json.loads(json.dumps(a.guard.export_state(), default=str))
        b = fresh()
        self.assertEqual(b.kg.g["crude_oil"]["airlines"]["strength"], 0.8)
        res = b.guard.import_state(data, "load my graph")
        self.assertTrue(res["ok"], res)
        self.assertEqual(b.kg.g["crude_oil"]["airlines"]["strength"], 0.5)
        self.assertEqual(b.guard.history[-1]["action"], "import")
        self.assertEqual(b.guard.history[-1]["reason"], "load my graph")

    def test_rejects_things_that_are_not_an_export_and_exports_that_break_the_rules(self):
        a = fresh()
        self.assertFalse(a.guard.import_state({"hello": 1})["ok"])
        data = json.loads(json.dumps(a.guard.export_state(), default=str))
        data["graph"]["links"].append({"source": "delta", "target": "crude_oil", "sign": 1, "strength": 0.5, "lag": 1,
                                       "mechanism": "bogus", "provenance": ["llm_proposed"], "evidence": [],
                                       "inferred": True, "relation": "causes"})
        res = a.guard.import_state(data)
        self.assertFalse(res["ok"])
        self.assertTrue(any("hierarchy" in f for f in res["failed"]))
        self.assertFalse(a.kg.g.has_edge("delta", "crude_oil"))


class PersistenceAndVersionTests(unittest.TestCase):
    def test_history_survives_a_restart(self):
        tmp = os.path.join(tempfile.mkdtemp(), "kb_state.json")
        with mock.patch.object(kbstate, "STATE_FILE", tmp):
            a = Analyzer(persist=True)
            a.update_edge("crude_oil", "airlines", weight=-0.5, reason="persist me")
            b = Analyzer(persist=True)
            self.assertEqual(b.guard.version, 1)
            self.assertEqual([(e["action"], e["reason"]) for e in b.guard.history], [("edit_link", "persist me")])
            self.assertEqual(b.guard.seq, 1)
            b.update_edge("crude_oil", "airlines", weight=-0.4)
            self.assertEqual([e["seq"] for e in b.guard.history], [1, 2])

    def test_reset_starts_a_new_epoch_and_keeps_the_old_history(self):
        a = fresh()
        a.update_edge("crude_oil", "airlines", weight=-0.5)
        a.reset()
        self.assertEqual((a.guard.version, a.guard.epoch), (0, 1))
        self.assertEqual([e["action"] for e in a.guard.history], ["edit_link", "reset"])
        self.assertEqual(a.kg.g["crude_oil"]["airlines"]["strength"], 0.8)

    def test_an_analysis_records_the_graph_version_it_ran_on(self):
        a = fresh()
        r = a.analyze(TEXT, live=False, use_llm=False)
        self.assertEqual(r["kb_version"], {"version": a.guard.version, "epoch": a.guard.epoch})
        r2 = a.analyze("Gold rose 3% while copper slipped 2%.", live=False, use_llm=False)
        self.assertGreaterEqual(r2["kb_version"]["version"], r["kb_version"]["version"])

    def test_an_article_that_changes_nothing_adds_no_history_entry(self):
        a = fresh()
        a.analyze(TEXT, live=False, use_llm=False)
        n = len(a.guard.history)
        a.analyze(TEXT, live=False, use_llm=False)
        self.assertEqual(len(a.guard.history), n)


class ApiTests(unittest.TestCase):
    def setUp(self):
        import server
        from fastapi.testclient import TestClient
        self.server = server
        self.patch = mock.patch.object(server, "analyzer", Analyzer())
        self.patch.start()
        self.c = TestClient(server.app)

    def tearDown(self):
        self.patch.stop()

    def test_edit_history_restore_flow(self):
        r = self.c.post("/api/kb/edge", json={"source": "crude_oil", "target": "airlines", "weight": -0.5, "reason": "api test"})
        self.assertEqual(r.status_code, 200, r.text)
        h = self.c.get("/api/kb/history").json()
        self.assertEqual((h["total"], h["entries"][0]["action"], h["entries"][0]["reason"]), (1, "edit_link", "api test"))
        self.assertIn("diff_counts", h["entries"][0])
        full = self.c.get("/api/kb/history/%d" % h["entries"][0]["seq"]).json()
        self.assertEqual(full["diff"]["counts"]["links_changed"], 1)
        self.assertEqual(self.c.get("/api/kb/history/999").status_code, 404)
        rr = self.c.post("/api/kb/restore", json={"version": 0})
        self.assertEqual(rr.status_code, 200, rr.text)
        self.assertEqual(self.server.analyzer.kg.g["crude_oil"]["airlines"]["strength"], 0.8)
        self.assertEqual(self.c.post("/api/kb/restore", json={"version": 77}).status_code, 400)

    def test_link_check_add_remove_move_export_import(self):
        s = self.c
        chk = s.post("/api/kb/link/check", json={"source": "delta", "target": "crude_oil", "sign": 1}).json()
        self.assertFalse(chk["ok"])
        body = {"source": "copper", "target": "spx", "sign": 1, "strength": 0.4, "lag": 5,
                "mechanism": "Copper demand signals industrial growth"}
        self.assertEqual(s.post("/api/kb/link", json=body).status_code, 200)
        self.assertEqual(s.post("/api/kb/link", json=body).status_code, 400)
        exp = s.get("/api/kb/export").json()
        self.assertEqual(exp["format"], "apex-zenith-kg")
        self.assertEqual(s.post("/api/kb/link/remove", json={"source": "copper", "target": "spx"}).status_code, 200)
        self.assertFalse(self.server.analyzer.kg.g.has_edge("copper", "spx"))
        self.assertEqual(s.post("/api/kb/import", json=exp).status_code, 200)
        self.assertTrue(self.server.analyzer.kg.g.has_edge("copper", "spx"))
        self.assertEqual(s.post("/api/kb/import", json={"nope": 1}).status_code, 400)
        self.assertEqual(s.post("/api/kb/move-asset", json={"asset": "delta", "sector": "banks"}).status_code, 400)


if __name__ == "__main__":
    unittest.main()
