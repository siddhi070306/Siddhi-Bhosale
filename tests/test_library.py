"""The analysis library (every generated graph) and how the KG assistant reads it."""
import os
import shutil
import tempfile
import unittest
from unittest import mock

os.environ["ZENITH_REQUIRE_LLM"] = "0"

from impactgraph import assistant, cards as cardlib, library, llm
from impactgraph.service import SAMPLES, Analyzer

OIL = SAMPLES[0]["text"]
V = {"version": 7, "epoch": 0}


def analysed(text=OIL):
    a = Analyzer()
    a.guard.set_mode("static")
    return a, a.analyze(text, live=False, use_llm=False)


class RecordTests(unittest.TestCase):
    def setUp(self):
        self.a, self.res = analysed()

    def test_compact_keeps_reported_inferred_and_hypotheses_apart(self):
        rec = library.compact(self.res, title="Oil spike")
        self.assertEqual(rec["id"], self.res["article_id"])
        statuses = {e["status"] for e in rec["events"]}
        self.assertIn("observed", statuses)
        self.assertIn("expected", statuses)
        self.assertTrue(all(e["quote"] for e in rec["events"] if e["status"] == "observed"))
        self.assertTrue(rec["paths"] and rec["assets"])
        self.assertIn("crude_oil", rec["nodes"])
        self.assertEqual(rec["kb_version"], self.res["kb_version"])

    def test_nothing_drawn_means_nothing_filed(self):
        _, empty = analysed("The weather in Paris was pleasant today.")
        self.assertIsNone(library.compact(empty))
        self.assertIsNone(library.compact({"events": [{"trigger": "not_a_node", "direction": 1}]}))

    def test_card_says_what_was_reported_and_what_was_inferred(self):
        card = cardlib.analysis_card(library.compact(self.res, title="Oil spike"), V)
        self.assertEqual(card["id"], "a:" + self.res["article_id"])
        self.assertIn("REPORTED by the article", card["text"])
        self.assertIn("INFERRED by the model", card["text"])
        self.assertIn("Brent crude jumped 12%", card["text"])           # the quote, verbatim
        self.assertIn("graph has changed since", card["text"])           # analysed on another graph version


class LibraryTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.lib = library.AnalysisLibrary(self.dir)
        self.a, self.res = analysed()

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_record_persists_index_and_full_result_without_sparklines(self):
        rec = self.lib.record(self.res, title="Oil spike")
        again = library.AnalysisLibrary(self.dir)
        self.assertEqual([r["id"] for r in again.records], [rec["id"]])
        full = again.full(rec["id"])
        self.assertEqual(full["article_id"], self.res["article_id"])
        self.assertEqual(len(full["paths"]), len(self.res["paths"]))
        self.assertNotIn("sparks", full)
        self.assertTrue(all("spark" not in r for r in full["assets"]))

    def test_the_same_article_twice_is_one_record(self):
        self.lib.record(self.res)
        self.lib.record(self.res)
        self.assertEqual(len(self.lib.records), 1)
        self.assertEqual(self.lib.records[0]["runs"], 2)

    def test_oldest_records_are_dropped_beyond_the_limit(self):
        with mock.patch.object(library, "MAX_RECORDS", 2):
            for s in SAMPLES[:3]:
                self.lib.record(self.a.analyze(s["text"], live=False, use_llm=False))
        self.assertEqual(len(self.lib.records), 2)
        self.assertEqual(len([f for f in os.listdir(self.dir) if f.endswith(".gz")]), 2)

    def test_import_adds_new_keeps_existing_and_skips_junk(self):
        self.lib.record(self.res)
        fed = self.a.analyze(SAMPLES[1]["text"], live=False, use_llm=False)
        out = self.lib.import_items([{"result": self.res}, {"result": fed, "title": "Fed hike", "t": "2026-10-10 09:00:00"},
                                     {"result": {"events": []}}, {"nothing": 1}])
        self.assertEqual((out["imported"], out["already_in_library"], out["skipped"]), (1, 1, 2))
        imported = self.lib.get(fed["article_id"])
        self.assertEqual((imported["origin"], imported["title"]), ("import", "Fed hike"))

    def test_delete(self):
        rec = self.lib.record(self.res)
        self.assertTrue(self.lib.delete(rec["id"]))
        self.assertFalse(self.lib.delete(rec["id"]))
        self.assertIsNone(self.lib.full(rec["id"]))


class AssistantWithLibraryTests(unittest.TestCase):
    def setUp(self):
        self.lib = library.AnalysisLibrary(None)
        self.a, self.res = analysed()
        self.lib.record(self.res, title="Oil spike after Hormuz attack")
        self.kg = self.a.kg

    def test_a_question_about_the_news_retrieves_the_latest_analysis(self):
        with mock.patch.object(llm, "available", return_value=False):
            r = assistant.answer(self.kg, V, "What did the last article say?", library=self.lib)
        self.assertNotEqual(r["mode"], "none")
        self.assertEqual(r["analyses_considered"], 1)
        self.assertIn("a:" + self.res["article_id"], r["answer"])

    def test_the_last_article_means_the_newest_one(self):
        fed = self.a.analyze(SAMPLES[1]["text"], live=False, use_llm=False)
        self.lib.import_items([{"result": fed, "t": "2000-01-01 00:00:00"}])       # imported, older
        self.assertEqual([r["id"] for r in assistant.find_analyses(self.lib, "What did the last article report?", [])],
                         [self.res["article_id"]])
        both = assistant.find_analyses(self.lib, "Which articles did I analyse?", [])
        self.assertEqual([r["id"] for r in both], [self.res["article_id"], fed["article_id"]])

    def test_a_question_naming_an_entity_also_gets_the_analyses_that_touched_it(self):
        with mock.patch.object(llm, "available", return_value=False):
            r = assistant.answer(self.kg, V, "How does crude oil affect airlines?", library=self.lib)
            none = assistant.answer(self.kg, V, "How does wheat affect HUL?", library=self.lib)
        self.assertEqual(r["analyses_considered"], 1)
        self.assertEqual(none["analyses_considered"], 0)

    def test_without_entity_or_news_there_is_still_no_answer(self):
        with mock.patch.object(llm, "_chat") as chat:
            r = assistant.answer(self.kg, V, "what is the weather today?", library=self.lib)
        chat.assert_not_called()
        self.assertEqual(r["mode"], "none")

    def test_the_model_sees_the_analysis_card_and_may_cite_it(self):
        aid = "a:" + self.res["article_id"]
        reply = "The article reported that Brent crude jumped 12 percent [" + aid + "]."
        with mock.patch.object(llm, "available", return_value=True), mock.patch.object(llm, "_chat", return_value=reply) as chat:
            r = assistant.answer(self.kg, V, "What did the latest article report about oil?", library=self.lib)
        body = chat.call_args[0][1]
        self.assertIn(aid, body)
        self.assertIn("REPORTED by the article", body)
        self.assertEqual([(s["id"], s["kind"]) for s in r["sources"]], [(aid, "analysis")])


class DiversePathTests(unittest.TestCase):
    def test_one_topic_question_covers_several_channels(self):
        kg = Analyzer().kg
        ps = cardlib.find_paths(kg, "crude_oil", None, 4, diverse=True)
        firsts = [p["nodes"][1] for p in ps]
        self.assertEqual(len(firsts), len(set(firsts)))
        self.assertGreaterEqual(len(firsts), 3)
        self.assertTrue(any(kg.g.nodes[n]["tier"] == "variable" for p in ps for n in p["nodes"][1:-1]))
        self.assertEqual(cardlib.find_paths(kg, "crude_oil", None, 3)[0]["nodes"], ps[0]["nodes"])   # the strongest still leads


class EndpointTests(unittest.TestCase):
    def setUp(self):
        import server
        from fastapi.testclient import TestClient
        self.dir = tempfile.mkdtemp()
        self.server = server
        self.patches = [mock.patch.object(server, "LIB", library.AnalysisLibrary(self.dir)),
                        mock.patch.object(server, "analyzer", Analyzer()),
                        mock.patch.object(llm, "available", return_value=False)]
        for p in self.patches:
            p.start()
        self.c = TestClient(server.app)

    def tearDown(self):
        for p in self.patches:
            p.stop()
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_analyse_files_the_graph_and_it_can_be_listed_opened_cited_and_deleted(self):
        res = self.c.post("/api/analyze", json={"text": OIL, "title": "Oil spike"}).json()
        rid = res["library_id"]
        self.assertEqual(rid, res["article_id"])
        lst = self.c.get("/api/analyses").json()
        self.assertEqual((lst["total"], lst["items"][0]["id"], lst["items"][0]["title"]), (1, rid, "Oil spike"))
        got = self.c.get("/api/analyses/" + rid).json()
        self.assertEqual(got["result"]["article_id"], rid)
        self.assertEqual(self.c.get("/api/kg/cards/a:" + rid).json()["card"]["kind"], "analysis")
        cards = self.c.get("/api/kg/cards?kind=analysis").json()
        self.assertEqual((cards["matched"], cards["analysis_cards"]), (1, 1))
        self.assertEqual(self.c.post("/api/assistant", json={"question": "what did the last article say?"}).json()["analyses_considered"], 1)
        self.assertTrue(self.c.delete("/api/analyses/" + rid).json()["ok"])
        self.assertEqual(self.c.get("/api/analyses/" + rid).status_code, 404)

    def test_import_endpoint(self):
        _, res = analysed(SAMPLES[2]["text"])
        out = self.c.post("/api/analyses/import", json={"items": [{"result": res, "title": "RBI rules"}, {"result": {}}]}).json()
        self.assertEqual((out["imported"], out["skipped"], out["total"]), (1, 1, 1))
        self.assertEqual(self.c.post("/api/analyses/import", json={"items": [{}] * 101}).status_code, 400)


if __name__ == "__main__":
    unittest.main()
