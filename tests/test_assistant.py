import os
import unittest
from unittest import mock

os.environ["ZENITH_REQUIRE_LLM"] = "0"

from impactgraph import assistant, llm
from impactgraph.service import Analyzer

V = {"version": 0, "epoch": 0}


class RetrievalTests(unittest.TestCase):
    def setUp(self):
        self.kg = Analyzer().kg

    def test_entities_come_from_the_question_then_from_the_previous_turn(self):
        self.assertEqual(assistant.find_entities("How does crude oil affect Delta?"), ["crude_oil", "delta"])
        hist = [{"role": "user", "text": "Tell me about Delta Air Lines"}]
        self.assertEqual(assistant.find_entities("and who are its peers?", hist), ["delta"])
        self.assertEqual(assistant.find_entities("what is the weather?"), [])
        # an unrelated question must not borrow the previous subject
        self.assertEqual(assistant.find_entities("what is the weather in Paris?", hist), [])
        self.assertEqual(assistant.find_entities("how is the weather in Paris?", hist), [])
        self.assertEqual(assistant.find_entities("and what about it?", hist), ["delta"])
        self.assertEqual(assistant.find_entities("how does it compare?", hist), ["delta"])

    def test_two_entities_give_node_link_and_path_cards_with_stable_ids(self):
        cards = assistant.build_cards(self.kg, ["crude_oil", "airlines"])
        ids = [c["id"] for c in cards]
        self.assertIn("n:crude_oil", ids)
        self.assertIn("l:crude_oil>airlines", ids)
        self.assertTrue(any(i.startswith("p:crude_oil>airlines") for i in ids))
        link = next(c for c in cards if c["id"] == "l:crude_oil>airlines")
        self.assertIn("pushes Airlines DOWN", link["text"])
        self.assertIn("analyst prior", link["text"])
        self.assertIn("Mechanism:", link["text"])

    def test_card_facts_equal_the_graph(self):
        e = self.kg.g["crude_oil"]["airlines"]
        link = next(c for c in assistant.build_cards(self.kg, ["crude_oil", "airlines"]) if c["id"] == "l:crude_oil>airlines")
        self.assertIn("Stored strength %.2f" % e["strength"], link["text"])
        self.assertIn("lag %d days" % e["lag"], link["text"])

    def test_a_pair_with_no_path_says_so_instead_of_inventing_one(self):
        cards = assistant.build_cards(self.kg, ["wheat", "delta"])
        gap = [c for c in cards if c["kind"] == "gap"]
        self.assertTrue(gap or any(c["kind"] == "path" for c in cards))
        if gap:
            self.assertIn("does not say", gap[0]["text"])

    def test_one_entity_gives_its_downstream_paths_and_its_sector_members(self):
        cards = assistant.build_cards(self.kg, ["airlines"])
        node = next(c for c in cards if c["id"] == "n:airlines")
        self.assertIn("Delta Air Lines", node["text"])
        cards = assistant.build_cards(self.kg, ["crude_oil"])
        self.assertTrue(any(c["kind"] == "path" for c in cards))
        self.assertLessEqual(len(cards), assistant.MAX_CARDS)


class AnswerTests(unittest.TestCase):
    def setUp(self):
        self.kg = Analyzer().kg

    def test_no_entity_means_no_answer_and_no_llm_call(self):
        with mock.patch.object(llm, "_chat") as chat:
            r = assistant.answer(self.kg, V, "what is the weather today?")
        chat.assert_not_called()
        self.assertFalse(r["grounded"])
        self.assertEqual(r["mode"], "none")
        self.assertTrue(r["suggestions"]["sectors"])

    def test_a_cited_llm_answer_is_kept_and_its_sources_are_returned(self):
        reply = ("Crude oil may push airlines down because fuel is a large cost [l:crude_oil>airlines]. "
                 "This is an analyst prior [l:crude_oil>airlines] [l:made>up].")
        with mock.patch.object(llm, "available", return_value=True), mock.patch.object(llm, "_chat", return_value=reply) as chat:
            r = assistant.answer(self.kg, V, "How does crude oil affect airlines?")
        self.assertEqual(r["mode"], "llm")
        self.assertTrue(r["grounded"])
        self.assertEqual([s["id"] for s in r["sources"]], ["l:crude_oil>airlines"])
        self.assertNotIn("l:made>up", r["answer"])             # an invented citation is stripped
        sys_prompt, user = chat.call_args[0][0], chat.call_args[0][1]
        self.assertIn("ONLY the numbered cards", sys_prompt)
        self.assertIn("[l:crude_oil>airlines]", user)
        self.assertEqual(r["graph_version"], V)

    def test_an_answer_with_no_valid_citation_is_replaced_by_the_graphs_own_facts(self):
        with mock.patch.object(llm, "available", return_value=True), \
                mock.patch.object(llm, "_chat", return_value="Oil hurts airlines, trust me."):
            r = assistant.answer(self.kg, V, "How does crude oil affect airlines?")
        self.assertEqual(r["mode"], "cards")
        self.assertTrue(r["grounded"])
        self.assertIn("cited no card", r["note"])
        self.assertIn("[l:crude_oil>airlines]", r["answer"])

    def test_without_an_llm_it_answers_from_the_cards(self):
        with mock.patch.object(llm, "available", return_value=False):
            r = assistant.answer(self.kg, V, "Which companies are in the airlines sector?")
        self.assertEqual(r["mode"], "cards")
        self.assertIn("Delta Air Lines", " ".join(s["text"] for s in r["sources"]) + r["answer"])
        self.assertIn("No language model", r["note"])

    def test_answering_never_changes_the_graph(self):
        a = Analyzer()
        before = (a.kg.g.number_of_nodes(), a.kg.g.number_of_edges(), a.guard.version, len(a.kg.articles),
                  {(u, v): dict(e) for u, v, e in a.kg.g.edges(data=True)}["crude_oil", "airlines"]["strength"])
        with mock.patch.object(llm, "available", return_value=False):
            assistant.answer(a.kg, V, "How does crude oil affect airlines?")
        after = (a.kg.g.number_of_nodes(), a.kg.g.number_of_edges(), a.guard.version, len(a.kg.articles),
                 a.kg.g["crude_oil"]["airlines"]["strength"])
        self.assertEqual(before, after)

    def test_a_user_edit_shows_up_in_the_next_answer(self):
        a = Analyzer()
        a.update_edge("crude_oil", "airlines", weight=-0.5, reason="mine")
        card = next(c for c in assistant.build_cards(a.kg, ["crude_oil", "airlines"]) if c["id"] == "l:crude_oil>airlines")
        self.assertIn("Stored strength 0.50", card["text"])
        self.assertIn("weight edited by a user", card["text"])


class EndpointTests(unittest.TestCase):
    def test_endpoint_is_read_only_and_reports_the_version(self):
        import server
        from fastapi.testclient import TestClient
        a = Analyzer()
        with mock.patch.object(server, "analyzer", a), mock.patch.object(llm, "available", return_value=False):
            c = TestClient(server.app)
            v0, arts = a.guard.version, len(a.kg.articles)
            r = c.post("/api/assistant", json={"question": "How does crude oil affect Delta?"})
            self.assertEqual(r.status_code, 200, r.text)
            j = r.json()
            self.assertEqual(j["graph_version"], {"version": v0, "epoch": 0})
            self.assertEqual((a.guard.version, len(a.kg.articles)), (v0, arts))
            self.assertTrue(j["grounded"])
            self.assertEqual(c.post("/api/assistant", json={"question": "  "}).status_code, 400)


if __name__ == "__main__":
    unittest.main()
