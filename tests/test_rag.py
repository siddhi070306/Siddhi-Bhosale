"""The KG assistant always has something grounded to say: every entity and link of the live graph is findable (typos too), a
question about the open news graph is answered about THAT story, and when the graph's cards cannot answer, the specific article
is the backup."""
import os
import unittest
from unittest import mock

os.environ["ZENITH_REQUIRE_LLM"] = "0"

from impactgraph import assistant, cards as cardlib, library, llm, retrieval
from impactgraph.service import Analyzer

V = {"version": 1, "epoch": 0}
OIL = ("Brent crude jumped 12% on Monday after an attack on tankers in the Strait of Hormuz. Airline stocks fell sharply as fuel "
       "costs rose. Analysts said inflation could stay higher for longer.")
BANK = ("HDFC Bank opens 200 new branches across rural India. The lender said the expansion will add 4,000 jobs and focus on "
        "farm loans.")


def setup():
    a = Analyzer()
    lib = library.AnalysisLibrary(None)
    oil = a.analyze(OIL, live=False)
    lib.record(oil, title="Oil jumps 12% after Hormuz tanker attack")
    bank = a.analyze(BANK, live=False)
    lib.record(bank, title="HDFC Bank opens 200 rural branches")
    return a, lib, oil, bank


class EntityTests(unittest.TestCase):
    def setUp(self):
        self.kg = Analyzer().kg

    def test_typos_are_tolerated(self):
        self.assertEqual(retrieval.resolve_entities(self.kg, "how does oill affect airlnes"), ["crude_oil", "airlines"])
        self.assertEqual(retrieval.resolve_entities(self.kg, "what happens to infosis if the rupee falls")[:1], ["infosys"])

    def test_common_words_are_not_entities(self):
        self.assertEqual(retrieval.resolve_entities(self.kg, "the soil is dry"), [])
        self.assertEqual(retrieval.resolve_entities(self.kg, "what about fighter jets"), [])
        self.assertEqual(retrieval.resolve_entities(self.kg, "tell me about JETS"), ["jets"])

    def test_entities_learned_from_articles_are_known(self):
        a = Analyzer()
        a.kg.ingest("x1", "t", {"unlinked": [{"name": "Fusion CX", "sector_guess": "it_services", "by": "llm"}], "mentions": []})
        self.assertEqual(assistant.find_entities("what is fusion cx?", (), a.kg), ["ent_fusioncx"])
        ids = [c["id"] for c in assistant.build_cards(a.kg, ["ent_fusioncx"])]
        self.assertIn("n:ent_fusioncx", ids)
        self.assertIn("l:it_services>ent_fusioncx", ids)

    def test_every_node_and_link_has_a_findable_card(self):
        allc = cardlib.all_cards(self.kg)
        ids = {c["id"] for c in allc}
        for n in self.kg.g.nodes:
            self.assertIn("n:" + n, ids)
        for u, v in self.kg.g.edges:
            self.assertIn("l:%s>%s" % (u, v), ids)
        top = retrieval.rank_cards(self.kg, "what drives inflaton expectations")       # a typo, no exact name
        self.assertTrue(top and all("inflation_exp" in c["refs"] for c in top[:3]))


class WholeGraphTests(unittest.TestCase):
    def test_a_question_about_the_whole_graph_gets_the_overview_first(self):
        kg = Analyzer().kg
        with mock.patch.object(llm, "available", return_value=False):
            r = assistant.answer(kg, V, "which link is the strongest in the graph?")
        self.assertEqual(r["mode"], "cards")
        self.assertEqual(r["sources"][0]["id"], "o:graph")
        self.assertIn("Strongest cause-and-effect links", r["answer"])
        self.assertIsNotNone(cardlib.get_card(kg, "o:graph"))

    def test_off_topic_without_a_story_still_explains_itself_without_calling_the_model(self):
        with mock.patch.object(llm, "_chat") as chat:
            r = assistant.answer(Analyzer().kg, V, "what is the weather today?")
        chat.assert_not_called()
        self.assertEqual(r["mode"], "none")
        self.assertTrue(r["answer"])


class OpenStoryTests(unittest.TestCase):
    def setUp(self):
        self.a, self.lib, self.oil, self.bank = setup()

    def test_the_open_graph_is_the_story_asked_about(self):
        with mock.patch.object(llm, "available", return_value=False):
            r = assistant.answer(self.a.kg, V, "how many jobs will this add?", library=self.lib, analysis_id=self.bank["article_id"])
        self.assertEqual((r["focus"]["id"], r["focus"]["how"]), (self.bank["article_id"], "open"))
        self.assertIn("will add 4,000 jobs", r["answer"])              # the article's own sentence, found without any model
        self.assertNotIn("o:graph", r["answer"])

    def test_explain_this_graph_uses_the_open_storys_entities(self):
        with mock.patch.object(llm, "available", return_value=False):
            r = assistant.answer(self.a.kg, V, "explain this graph", library=self.lib, analysis_id=self.oil["article_id"])
        self.assertIn("crude_oil", [e["id"] for e in r["entities"]])
        self.assertIn("a:" + self.oil["article_id"], r["answer"])

    def test_a_story_is_found_by_its_headline(self):
        with mock.patch.object(llm, "available", return_value=False):
            r = assistant.answer(self.a.kg, V, "tell me about the hormuz tanker attack story", library=self.lib)
        self.assertEqual((r["focus"]["id"], r["focus"]["how"]), (self.oil["article_id"], "matched"))

    def test_an_open_story_missing_from_the_library_uses_the_text_the_app_sent(self):
        empty = library.AnalysisLibrary(None)
        with mock.patch.object(llm, "available", return_value=False):
            r = assistant.answer(self.a.kg, V, "how many jobs?", library=empty, analysis_id="abc123def0",
                                 story={"title": "HDFC Bank opens 200 rural branches", "text": BANK})
        self.assertEqual(r["focus"]["how"], "open")
        self.assertIn("will add 4,000 jobs", r["answer"])


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.a, self.lib, self.oil, self.bank = setup()

    def test_when_the_graph_does_not_say_the_article_answers(self):
        replies = ["The graph does not say how many jobs this adds [a:%s]." % self.bank["article_id"],
                   'The article says the expansion "will add 4,000 jobs and focus on farm loans".']
        with mock.patch.object(llm, "available", return_value=True), mock.patch.object(llm, "_chat", side_effect=replies) as chat:
            r = assistant.answer(self.a.kg, V, "how many jobs will this add?", library=self.lib, analysis_id=self.bank["article_id"])
        self.assertEqual(r["mode"], "article")
        self.assertIn("4,000 jobs", r["answer"])
        self.assertIn("from the article itself", r["note"])
        self.assertNotIn("could not all be matched", r["note"])
        self.assertEqual([s["id"] for s in r["sources"]], ["a:" + self.bank["article_id"]])
        sent = chat.call_args_list[1][0][1]                             # the backup got THIS story, not a random one
        self.assertIn("HDFC Bank opens 200 rural branches", sent)
        self.assertIn("will add 4,000 jobs", sent)
        self.assertNotIn("Hormuz", sent)

    def test_when_the_graph_call_fails_the_article_answers(self):
        replies = [None, 'The article reports that "Brent crude jumped 12% on Monday".']
        with mock.patch.object(llm, "available", return_value=True), mock.patch.object(llm, "_chat", side_effect=replies):
            r = assistant.answer(self.a.kg, V, "what happened?", library=self.lib, analysis_id=self.oil["article_id"])
        self.assertEqual(r["mode"], "article")

    def test_an_unverifiable_backup_is_retried_then_flagged(self):
        replies = ["The graph does not say [a:%s]." % self.bank["article_id"], 'It says "something not in the article at all".',
                   'Still "nothing like the article text here".']
        with mock.patch.object(llm, "available", return_value=True), mock.patch.object(llm, "_chat", side_effect=replies) as chat:
            r = assistant.answer(self.a.kg, V, "how many jobs?", library=self.lib, analysis_id=self.bank["article_id"])
        self.assertEqual(chat.call_count, 3)
        self.assertEqual(r["mode"], "article")
        self.assertIn("could not all be matched", r["note"])

    def test_a_graph_answer_is_kept_when_it_answers(self):
        reply = "Crude oil may push airlines down [l:crude_oil>airlines]."
        with mock.patch.object(llm, "available", return_value=True), mock.patch.object(llm, "_chat", return_value=reply) as chat:
            r = assistant.answer(self.a.kg, V, "how does oil affect airlines?", library=self.lib, analysis_id=self.oil["article_id"])
        self.assertEqual((r["mode"], chat.call_count), ("llm", 1))
        self.assertIn('story "Oil jumps 12% after Hormuz tanker attack"', chat.call_args[0][1])

    def test_every_model_call_failing_still_gives_an_answer(self):
        with mock.patch.object(llm, "available", return_value=True), mock.patch.object(llm, "_chat", return_value=None):
            r = assistant.answer(self.a.kg, V, "how many jobs will this add?", library=self.lib, analysis_id=self.bank["article_id"])
        self.assertEqual(r["mode"], "cards")
        self.assertIn("will add 4,000 jobs", r["answer"])


class EndpointTests(unittest.TestCase):
    def test_the_endpoint_passes_the_open_story(self):
        import server
        from fastapi.testclient import TestClient
        a, lib, oil, bank = setup()
        with mock.patch.object(server, "analyzer", a), mock.patch.object(server, "LIB", lib), \
                mock.patch.object(llm, "available", return_value=False):
            j = TestClient(server.app).post("/api/assistant", json={"question": "how many jobs?",
                                                                    "analysis_id": bank["article_id"]}).json()
        self.assertEqual(j["focus"]["id"], bank["article_id"])
        self.assertIn("4,000 jobs", j["answer"])


class ScenarioTests(unittest.TestCase):
    def setUp(self):
        self.kg = Analyzer().kg

    def scen(self, q):
        return [(x["node"], x["direction"]) for x in retrieval.detect_scenario(self.kg, q)]

    def test_events_and_their_direction(self):
        self.assertEqual(self.scen("what happens if there is an intrest hike"), [("rate_exp", 1)])
        self.assertEqual(self.scen("what if rbi cuts rates"), [("rbi", -1), ("rate_exp", -1)])
        self.assertEqual(self.scen("what if the rupee falls"), [("usdinr", 1)])        # rupee down = rupee weakness up
        self.assertEqual(self.scen("impact of a recession on banks"), [("gdp_growth", -1)])
        self.assertEqual(self.scen("what if oil prices crash"), [("crude_oil", -1)])
        self.assertEqual(self.scen("stock market crash impact"), [("risk_aversion", 1)])
        self.assertEqual(self.scen("what happens in a war"), [("geopolitical_tension", 1)])
        self.assertEqual(self.scen("jerome powell hikes rates"), [("fed", 1), ("rate_exp", 1)])
        self.assertEqual(self.scen("how does oil affect airlines"), [])            # no move stated: not a scenario

    def test_a_rate_cut_is_told_as_a_cut(self):
        with mock.patch.object(llm, "available", return_value=False):
            r = assistant.answer(self.kg, V, "what if rbi cuts rates")
        self.assertTrue(r["answer"].splitlines()[1].startswith("- If Reserve Bank of India turns dovish"))
        self.assertIn("Real Estate ↑", r["answer"])                               # a hike would push it down
        up = assistant.answer(self.kg, V, "what happens if there is an interest hike", use_llm=False)
        self.assertIn("Real Estate ↓", up["answer"])
        self.assertTrue(any(s["id"].startswith("q:") for s in r["sources"]))

    def test_a_follow_up_keeps_the_subject_and_takes_the_new_direction(self):
        with mock.patch.object(llm, "available", return_value=False):
            r = assistant.answer(self.kg, V, "and if it falls?", history=[{"role": "user", "text": "what if crude oil rises?"}])
        self.assertEqual([(x["node"], x["direction"]) for x in r["scenario"]], [("crude_oil", -1)])
        self.assertIn("Airlines ↑", r["answer"])


class NameLinkingTests(unittest.TestCase):
    def setUp(self):
        self.kg = Analyzer().kg

    def test_names_the_graph_does_not_contain_are_mapped_and_shown(self):
        link = [{"term": "Taylor Swift", "node": "consumer_spending", "direction": 1, "why": "tours lift spending"}]
        reply = "Taylor Swift is not in the graph, so this uses Consumer Spending [i:question]. It may lift Autos [q:consumer_spending-up]."
        with mock.patch.object(llm, "available", return_value=True), mock.patch.object(llm, "link_question", return_value=link) as lq,                 mock.patch.object(llm, "_chat", return_value=reply):
            r = assistant.answer(self.kg, V, "how will the Taylor Swift tour affect the economy?")
        lq.assert_called_once()
        self.assertEqual([(x["term"], x["node"]) for x in r["interpretation"]], [("Taylor Swift", "consumer_spending")])
        self.assertIn(("consumer_spending", 1), [(x["node"], x["direction"]) for x in r["scenario"]])
        self.assertEqual([s["id"] for s in r["sources"]], ["i:question", "q:consumer_spending-up"])

    def test_no_mapping_call_when_the_graph_knows_every_word(self):
        with mock.patch.object(llm, "available", return_value=True), mock.patch.object(llm, "link_question") as lq,                 mock.patch.object(llm, "_chat", return_value="Oil may push airlines down [l:crude_oil>airlines]."):
            assistant.answer(self.kg, V, "how does oill affect airlnes")
            assistant.answer(self.kg, V, "what happens if there is an intrest hike")
        lq.assert_not_called()

    def test_well_known_people_need_no_model(self):
        self.assertEqual(retrieval.resolve_entities(self.kg, "what did mukesh ambani announce"), ["reliance"])
        self.assertEqual(retrieval.resolve_entities(self.kg, "christine lagarde speech"), ["ecb"])

    def test_the_models_mapping_is_checked(self):
        llm._LINK_CACHE.clear()
        out = ('{"links":[{"term":"Elon Musk","node":"autos","direction":0,"why":"runs Tesla"},'
               '{"term":"Mars","node":"made_up","direction":1,"why":"x"},{"term":"not in question","node":"gold","direction":1,"why":"x"},'
               '{"term":"Tesla","node":"autos","direction":1,"why":"duplicate node"}]}')
        nodes = [(n, d["label"], d["type"]) for n, d in self.kg.g.nodes(data=True)]
        with mock.patch.object(llm, "_chat", return_value=out) as chat:
            res = llm.link_question("What if Elon Musk sells Tesla and goes to Mars?", nodes)
            again = llm.link_question("what if elon musk sells tesla and goes to mars?", nodes)
        self.assertEqual([(x["term"], x["node"], x["direction"]) for x in res], [("Elon Musk", "autos", 0)])
        self.assertEqual(again, res)
        self.assertEqual(chat.call_count, 1)                                         # cached


if __name__ == "__main__":
    unittest.main()
