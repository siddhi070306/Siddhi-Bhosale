import os
import unittest
from unittest import mock

os.environ["ZENITH_REQUIRE_LLM"] = "0"

from impactgraph import context, enrich, feeds, kb, llm
from impactgraph import propagate as pg
from impactgraph.graph import KnowledgeGraph
from impactgraph.service import Analyzer, SAMPLES

OIL = SAMPLES[0]["text"]


def edge_snapshot(kg):
    return {(u, v): (e["sign"], round(e["strength"], 4)) for u, v, e in kg.g.edges(data=True)}


class UpstreamTests(unittest.TestCase):
    def test_drivers_of_a_rising_index_have_the_right_required_direction(self):
        kg = KnowledgeGraph()
        paths = pg.upstream_paths(kg, "spx", 1)
        req = {}
        for p in paths:
            req.setdefault(p["nodes"][0], p["required"])
        self.assertEqual(req["risk_aversion"], -1)     # risk aversion falling would lift equities
        self.assertEqual(req["gdp_growth"], 1)
        self.assertEqual(req["rate_exp"], -1)
        for p in paths:                                  # every path really ends at the target and uses real edges
            self.assertEqual(p["nodes"][-1], "spx")
            for u, v in p["edges"]:
                self.assertTrue(kg.g.has_edge(u, v))

    def test_required_direction_flips_with_the_observed_direction(self):
        kg = KnowledgeGraph()
        up = {p["nodes"][0]: p["required"] for p in pg.upstream_paths(kg, "spx", 1)}
        dn = {p["nodes"][0]: p["required"] for p in pg.upstream_paths(kg, "spx", -1)}
        for n in up:
            if n in dn:
                self.assertEqual(up[n], -dn[n])

    def test_search_is_read_only(self):
        kg = KnowledgeGraph()
        before = edge_snapshot(kg)
        pg.upstream_paths(kg, "airlines", -1)
        self.assertEqual(edge_snapshot(kg), before)


class ContextExpansionTests(unittest.TestCase):
    def test_effect_only_headline_gets_possible_drivers(self):
        a = Analyzer()
        res = a.analyze("The S&P 500 rose 1.5% on Friday.", live=False)
        self.assertEqual([s["trigger"] for s in res["sources"]], ["spx"])
        ctx = res["context"]
        self.assertTrue(ctx["drivers"])
        self.assertIn("hypotheses", ctx["reason"])
        for d in ctx["drivers"]:
            self.assertNotIn(kb.NODES[d["node"]]["type"], ("company", "index", "instrument"))
            self.assertIn(d["required_direction"], (1, -1))
            self.assertTrue(d["chain"].endswith("S&P 500"))
        roles = {n["id"]: n.get("role") for n in res["graph"]["nodes"]}
        self.assertEqual(roles["risk_aversion"], "driver")
        ctx_links = [l for l in res["graph"]["links"] if l.get("kind") == "context"]
        self.assertTrue(ctx_links)
        self.assertTrue(all(l["provenance"] == ["hypothesis"] and l["inferred"] for l in ctx_links))
        self.assertGreater(len(res["graph"]["nodes"]), 8)          # was a single node before
        spx = next(n for n in res["graph"]["nodes"] if n["id"] == "spx")     # the stated move itself is on the canvas
        self.assertTrue(spx["source"] and spx["observed"])
        self.assertTrue([l for l in res["graph"]["links"] if l["target"] == "spx" and l.get("kind") == "context"])

    def test_expansion_never_touches_the_knowledge_graph(self):
        a = Analyzer()
        a.analyze("The S&P 500 rose 1.5% on Friday.", live=False)
        base = edge_snapshot(a.kg)
        kg2 = KnowledgeGraph()
        graph = {"nodes": [{"id": "spx", "type": "index"}], "links": []}
        context.expand(kg2, [{"trigger": "spx", "direction": 1}], graph)
        self.assertEqual(edge_snapshot(kg2), edge_snapshot(KnowledgeGraph()))
        self.assertTrue(base)

    def test_company_headline_gets_its_sector_and_peers(self):
        a = Analyzer()
        res = a.analyze("Delta Air Lines shares fell 5% on Tuesday.", live=False)
        peers = res["context"]["peers"]
        self.assertEqual(peers[0]["sector"], "airlines")
        self.assertEqual(peers[0]["kind"], "peers")
        self.assertIn("United Airlines", peers[0]["members"])
        roles = {n["id"]: n.get("role") for n in res["graph"]["nodes"]}
        self.assertEqual(roles["airlines"], "peer")
        self.assertEqual(roles["united"], "peer")
        drivers = {d["node"]: d["required_direction"] for d in res["context"]["drivers"]}
        self.assertEqual(drivers.get("crude_oil"), 1)               # airlines down <- oil up

    def test_a_rich_graph_is_left_alone(self):
        res = Analyzer().analyze(OIL, live=False)
        self.assertNotIn("context", res)
        self.assertFalse([n for n in res["graph"]["nodes"] if n.get("role")])


class HypothesisTests(unittest.TestCase):
    TEXT = "Google unveils new cloud-based AI agent to compete with Meta and OpenAI."

    def run_with(self, themes, background="Google is a large technology company."):
        a = Analyzer()
        before = (a.kg.g.number_of_nodes(), a.kg.g.number_of_edges())
        with mock.patch.object(llm, "available", return_value=True), \
                mock.patch.object(llm, "extract_graph", return_value=([], [])), \
                mock.patch.object(llm, "suggest_themes", return_value={"background": background, "themes": themes}), \
                mock.patch.object(llm, "summarise", return_value=None):
            res = a.analyze(self.TEXT, live=False, use_llm=True)
        return a, res, before

    def test_themes_become_labelled_hypotheses_and_are_never_learned(self):
        a, res, before = self.run_with([{"node": "it_services", "direction": 1, "why": "AI demand", "quote": "cloud-based AI agent"}])
        ev = [e for e in res["events"] if e["status"] == "hypothesis"]
        self.assertEqual(len(ev), 1)
        self.assertEqual(ev[0]["source"], "llm_hypothesis")
        self.assertFalse([e for e in res["events"] if e["status"] == "observed"])
        self.assertTrue(res["graph"]["nodes"])
        self.assertTrue(res["hypothesis"]["themes"])
        self.assertEqual(res["hypothesis"]["background"], "Google is a large technology company.")
        self.assertEqual((a.kg.g.number_of_nodes(), a.kg.g.number_of_edges()), before)    # nothing learned
        self.assertEqual(res["graph_changes"], [])
        self.assertIn("hypothes", res["summary"].lower())

    def test_no_themes_gives_an_honest_empty_state(self):
        a, res, _ = self.run_with([])
        self.assertEqual(res["graph"]["nodes"], [])
        self.assertIn("No known market entity", res["empty_reason"])
        self.assertTrue(res["empty_hint"])
        self.assertEqual(res["hypothesis"], {"background": "Google is a large technology company.", "themes": []})

    def test_without_an_llm_the_empty_state_still_explains_itself(self):
        res = Analyzer().analyze(self.TEXT, live=False)
        self.assertEqual(res["graph"]["nodes"], [])
        self.assertIn("nothing to trace", res["empty_reason"])
        self.assertIsNone(res["hypothesis"])

    def test_suggest_themes_drops_unknown_nodes_and_fabricated_quotes(self):
        text = "Google unveils a new AI agent for the cloud market."
        payload = ('{"background":"  Large tech firm. ","themes":['
                   '{"node":"it_services","direction":1,"why":"x","quote":"a new AI agent for the cloud market"},'
                   '{"node":"it_services","direction":1,"why":"dup","quote":"a new AI agent"},'
                   '{"node":"nope","direction":1,"why":"x","quote":null},'
                   '{"node":"gold","direction":1,"why":"x","quote":"a sentence that is not in the text at all"},'
                   '{"node":"usd","direction":0,"why":"x","quote":null},'
                   '{"node":"spx","direction":-1,"why":"y","quote":"cloud market"},'
                   '{"node":"tlt","direction":1,"why":"no supporting phrase","quote":null}]}')
        with mock.patch.object(llm, "_chat", return_value=payload):
            out = llm.suggest_themes(text)
        self.assertEqual([t["node"] for t in out["themes"]], ["it_services", "spx"])
        self.assertEqual(out["background"], "Large tech firm.")


POOL = [
    {"source": "CNBC Markets", "title": "Rupee recovers to 96.73 vs dollar after RBI intervention - CNBC", "link": "https://c/1",
     "summary": "The Indian rupee gained against the dollar on Friday after the central bank sold dollars to curb volatility, "
                "traders said, although demand for the greenback persisted among importers."},
    {"source": "MarketWatch", "title": "Oil prices climb on Middle East supply worries", "link": "https://m/2",
     "summary": "Crude rose as traders weighed supply risks. " * 4},
    {"source": "Yahoo Finance", "title": "Rupee recovers to 96.73 vs dollar after RBI intervention", "link": "https://y/3", "summary": "short"},
]


class EnrichTests(unittest.TestCase):
    TITLE = "Rupee recovers to 96.73 vs US dollar after RBI intervention, but dollar demand persists - Times of India"

    def test_title_normalisation_ignores_the_publisher_suffix(self):
        self.assertEqual(enrich.norm_title("Oil jumps 5% - Reuters"), enrich.norm_title("Oil jumps 5%"))
        self.assertGreater(enrich.similarity("Oil jumps 5% - Reuters", "Oil jumps 5%"), 0.95)

    def test_same_story_in_another_feed_supplies_the_summary(self):
        m = enrich.cross_feed_summary("Rupee recovers to 96.73 vs dollar after RBI intervention", "https://own/1", 0, POOL)
        self.assertEqual(m["source"], "CNBC Markets")
        self.assertGreaterEqual(m["similarity"], enrich.MATCH_THRESHOLD)

    def test_unrelated_stories_and_short_summaries_are_not_matched(self):
        self.assertIsNone(enrich.cross_feed_summary("Federal Reserve raises rates by 50 basis points", "https://own/1", 0, POOL))
        pool = [POOL[2]]                                                     # same title but a useless summary
        self.assertIsNone(enrich.cross_feed_summary("Rupee recovers to 96.73 vs dollar after RBI intervention", "https://own/1", 0, pool))

    def test_the_item_itself_is_not_its_own_match(self):
        self.assertIsNone(enrich.cross_feed_summary("Rupee recovers to 96.73 vs dollar after RBI intervention", "https://c/1", 0, [POOL[0]]))

    def test_chain_uses_cross_feed_then_reports_quality(self):
        title = "Rupee recovers to 96.73 vs dollar after RBI intervention"
        with mock.patch.object(feeds, "pool", return_value=POOL):
            r = enrich.build(title, title, "https://own/1", full_text=False)
        self.assertEqual(r["quality"], "description")
        self.assertTrue(any("CNBC Markets" in s for s in r["sources"]))
        self.assertIn("central bank sold dollars", r["text"])

    def test_blocked_article_falls_back_to_the_page_meta_description(self):
        fa = {"ok": False, "text": "", "title": "", "reason": "HTTP 403",
              "meta": "Rupee gains after the central bank steps in to support the currency, but dollar demand from importers persists, traders say."}
        with mock.patch.object(feeds, "pool", return_value=[]), mock.patch.object(feeds, "fetch_article", return_value=fa):
            r = enrich.build("Some bare headline about the rupee", "Some bare headline about the rupee", "https://own/1", full_text=True)
        self.assertEqual(r["quality"], "description")
        self.assertIn("page meta description", r["sources"])
        self.assertIn("Full article not used", r["note"])

    def test_a_typical_one_sentence_snippet_is_a_description_not_headline_only(self):
        title = "Fed officials see another hike coming, but no sign as to when"
        snippet = title + ". Policymakers signalled one more increase is likely but gave no timing for it."   # ~85 chars beyond the title
        self.assertGreaterEqual(enrich.real_chars(snippet, title), enrich.MIN_DESCRIPTION)
        self.assertLess(enrich.real_chars(snippet, title), enrich.SEEK_BETTER)
        with mock.patch.object(feeds, "pool", return_value=[]):
            r = enrich.build(title, snippet, "https://own/1", full_text=False)
        self.assertEqual(r["quality"], "description")           # was wrongly "headline only" at the old 120-char bar
        self.assertIsNone(r["note"])

    def test_nothing_found_is_headline_only_with_a_warning(self):
        fa = {"ok": False, "text": "", "title": "", "reason": "paywall", "meta": ""}
        with mock.patch.object(feeds, "pool", return_value=[]), mock.patch.object(feeds, "fetch_article", return_value=fa):
            r = enrich.build("Some bare headline", "Some bare headline", "https://own/1", full_text=True)
        self.assertEqual(r["quality"], "headline_only")
        self.assertIn("low confidence", r["note"])

    def test_article_body_wins_and_is_reported(self):
        fa = {"ok": True, "text": "Body " * 100, "title": "", "reason": "", "meta": ""}
        with mock.patch.object(feeds, "pool", return_value=[]), mock.patch.object(feeds, "fetch_article", return_value=fa):
            r = enrich.build("Headline", "Headline. A decent description of the story that is comfortably long enough to count "
                             "as a description on its own, ok.", "https://own/1", full_text=True)
        self.assertEqual(r["quality"], "article")
        self.assertEqual(r["article_chars"], len(fa["text"]))

    def test_analysis_reports_the_enrichment(self):
        a = Analyzer()
        with mock.patch.object(feeds, "pool", return_value=POOL):
            res = a.analyze("Rupee recovers to 96.73 vs dollar after RBI intervention", live=False, title="Rupee recovers to 96.73 vs dollar after RBI intervention",
                            link="https://own/1", full_text=False)
        self.assertEqual(res["input"]["quality"], "description")
        self.assertTrue(res["input"]["sources"])


class FeedHelperTests(unittest.TestCase):
    def test_rss_items_are_interleaved_across_feeds(self):
        def xml(prefix, n):
            return ("<rss><channel>" + "".join("<item><title>%s %d</title><description>d</description><link>l%s%d</link></item>" % (prefix, i, prefix, i)
                                               for i in range(n)) + "</channel></rss>").encode()
        bodies = {"https://a.test/rss": xml("A", 3), "https://b.test/rss": xml("B", 1), "https://c.test/rss": xml("C", 2)}
        def fake_get(url, **k):
            r = mock.Mock(content=bodies[url])
            r.raise_for_status = lambda: None
            return r
        feeds._CACHE.clear()
        with mock.patch.object(feeds, "RSS_FEEDS", [("A", "https://a.test/rss"), ("B", "https://b.test/rss"), ("C", "https://c.test/rss")]),                 mock.patch.object(feeds.requests, "get", side_effect=fake_get):
            titles = [i["title"] for i in feeds.rss_items()]
        feeds._CACHE.clear()
        self.assertEqual(titles, ["A 0", "B 0", "C 0", "A 1", "C 1", "A 2"])

    def test_one_dead_feed_does_not_hide_the_others(self):
        def fake_get(url, **k):
            if "dead" in url:
                raise feeds.requests.ConnectionError("down")
            r = mock.Mock(content=b"<rss><channel><item><title>Alive</title><description>x</description><link>l</link></item></channel></rss>")
            r.raise_for_status = lambda: None
            return r
        feeds._CACHE.clear()
        with mock.patch.object(feeds, "RSS_FEEDS", [("Dead", "https://dead.test/rss"), ("Live", "https://live.test/rss")]),                 mock.patch.object(feeds.requests, "get", side_effect=fake_get):
            titles = [i["title"] for i in feeds.rss_items()]
        feeds._CACHE.clear()
        self.assertEqual(titles, ["Alive"])

    def test_failures_are_not_cached(self):
        calls = []
        def flaky():
            calls.append(1)
            return [] if len(calls) == 1 else ["ok"]
        feeds._CACHE.clear()
        self.assertEqual(feeds._cached("k", 60, flaky), [])
        self.assertEqual(feeds._cached("k", 60, flaky), ["ok"])
        self.assertEqual(feeds._cached("k", 60, flaky), ["ok"])
        self.assertEqual(len(calls), 2)


if __name__ == "__main__":
    unittest.main()
