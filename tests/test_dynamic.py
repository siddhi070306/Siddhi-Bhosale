import json
import os
import tempfile
import time
import unittest

os.environ["ZENITH_REQUIRE_LLM"] = "0"

import pandas as pd

from impactgraph import kb, kbstate, quotes
from impactgraph.graph import KnowledgeGraph
from impactgraph.kbstate import KBGuard, health
from impactgraph.service import Analyzer, SAMPLES

OIL = SAMPLES[0]["text"]


def fake_fetch(symbols):
    now = time.time()
    return {s: {"symbol": s, "price": 100.0 + i, "prev_close": 99.0, "change": 1.0 + i, "change_pct": 1.0,
                "asof": "2026-10-09", "fetched": now, "source": quotes.SOURCE} for i, s in enumerate(symbols)}


def failing_fetch(symbols):
    raise RuntimeError("Yahoo Finance returned no data")


class GuardTests(unittest.TestCase):
    def setUp(self):
        self.kg = KnowledgeGraph()
        self.guard = KBGuard(self.kg)

    def test_fresh_graph_is_healthy(self):
        h = health(self.kg)
        self.assertTrue(h["ok"], [c for c in h["checks"] if not c["ok"]])

    def test_flipped_prior_is_rolled_back(self):
        before = self.guard.begin()
        self.kg.g["crude_oil"]["airlines"]["sign"] = 1                     # a bad change to a curated link
        rep = self.guard.finish(before, "bad edit")
        self.assertTrue(rep["rolled_back"])
        self.assertEqual(self.kg.g["crude_oil"]["airlines"]["sign"], -1)   # restored
        self.assertEqual(self.guard.version, 0)
        self.assertEqual(self.guard.log[0]["action"], "rollback")

    def test_flooding_the_graph_is_rolled_back(self):
        before = self.guard.begin()
        ids = list(kb.STATIC_IDS)
        n = 0
        for u in ids:
            for v in ids:
                if u != v and not self.kg.g.has_edge(u, v) and n < 20:
                    self.kg.g.add_edge(u, v, sign=1, strength=0.35, base_strength=0.35, lag=1, mechanism="x",
                                       provenance=["llm_proposed"], evidence=[], validation=None, inferred=True)
                    n += 1
        rep = self.guard.finish(before, "flood")
        self.assertTrue(rep["rolled_back"])
        self.assertEqual(self.kg.g.number_of_edges(), len(kb.EDGES))

    def test_regression_check_catches_silent_drift(self):
        before = self.guard.begin()
        for u, v, e in self.kg.g.edges(data=True):          # same signs, but the strong links are gutted
            if e["strength"] >= 0.7:
                e["strength"] = 0.02
        rep = self.guard.finish(before, "drift")
        self.assertTrue(rep["rolled_back"])
        self.assertTrue(any("regression" in c["name"] for c in rep["failed"]))

    def test_good_change_commits_and_can_be_undone(self):
        before = self.guard.begin()
        self.kg.g["crude_oil"]["airlines"]["strength"] = 0.82
        self.assertFalse(self.guard.finish(before, "small reinforcement")["rolled_back"])
        self.assertEqual(self.guard.version, 1)
        self.guard.revert("previous")
        self.assertEqual(self.kg.g["crude_oil"]["airlines"]["strength"], 0.8)

    def test_revert_static_removes_everything_learned(self):
        a = Analyzer()
        a.analyze(OIL, live=False)
        a.analyze("Infosys Technologies Inc raised guidance.", live=False)
        a.add_asset("XYZ", name="Xyz Oil Corp", sector="oil_gas_producers", verify=False)
        self.assertGreater(a.kg.stats()["articles_ingested"], 0)
        self.assertIn("u_xyz", kb.NODES)
        a.reset()
        s = a.kg.stats()
        self.assertEqual((s["nodes"], s["edges"], s["articles_ingested"]), (len(kb.STATIC_IDS), len(kb.EDGES), 0))
        self.assertNotIn("u_xyz", kb.NODES)

    def test_heal_prunes_only_contradicted_llm_links(self):
        g = self.kg.g
        for u, v, prov in [("gold", "airlines", ["llm_proposed"]), ("gold", "banks", ["user_added", "inferred"])]:
            g.add_edge(u, v, sign=1, strength=0.35, base_strength=0.35, lag=1, mechanism="x", provenance=prov, evidence=[],
                       validation={"verdict": "contradicted", "simulated": False}, inferred=True)
        g["crude_oil"]["airlines"]["validation"] = {"verdict": "contradicted", "simulated": False}   # a curated prior
        pruned = self.guard.heal()
        self.assertEqual(len(pruned), 1)
        self.assertFalse(g.has_edge("gold", "airlines"))
        self.assertTrue(g.has_edge("gold", "banks"))
        self.assertTrue(g.has_edge("crude_oil", "airlines"))

    def test_persistence_roundtrip_and_tamper_rejection(self):
        with tempfile.TemporaryDirectory() as d:
            old = kbstate.STATE_FILE
            kbstate.STATE_FILE = os.path.join(d, "kb.json")
            try:
                a = Analyzer(persist=True)
                a.add_asset("XYZ", name="Xyz Oil Corp", sector="oil_gas_producers", verify=False)
                a.kg.g["crude_oil"]["airlines"]["strength"] = 0.83
                a.guard.save()
                b = Analyzer(persist=True)                                        # restart
                self.assertIn("u_xyz", b.kg.g)
                self.assertAlmostEqual(b.kg.g["crude_oil"]["airlines"]["strength"], 0.83)
                with open(kbstate.STATE_FILE) as f:                               # corrupt a curated sign on disk
                    data = json.load(f)
                links = data["graph"].get("links") if "links" in data["graph"] else data["graph"].get("edges", [])
                for l in links:
                    if l.get("source") == "crude_oil" and l.get("target") == "airlines":
                        l["sign"] = 1
                with open(kbstate.STATE_FILE, "w") as f:
                    json.dump(data, f)
                c = Analyzer(persist=True)
                self.assertEqual(c.kg.g["crude_oil"]["airlines"]["sign"], -1)     # rejected, baseline used
                self.assertNotIn("u_xyz", c.kg.g)
                self.assertEqual(c.guard.log[0]["action"], "load-rejected")
            finally:
                kbstate.STATE_FILE = old
                kb.drop_dynamic_nodes()
                KBGuard._nodes_changed()

    def tearDown(self):
        kb.drop_dynamic_nodes()
        KBGuard._nodes_changed()


class AssetTests(unittest.TestCase):
    def setUp(self):
        self.old = quotes.HUB.fetcher
        quotes.HUB.fetcher = fake_fetch
        quotes.HUB.cache.clear()
        self.a = Analyzer()

    def tearDown(self):
        quotes.HUB.fetcher = self.old
        kb.drop_dynamic_nodes()
        KBGuard._nodes_changed()

    def test_added_asset_flows_through_analysis_with_live_ticker(self):
        r = self.a.add_asset("XYZ", name="Xyz Oil Corp", sector="oil_gas_producers")
        self.assertNotIn("error", r)
        self.assertTrue(r["linked"])
        res = self.a.analyze(OIL, live=False)
        row = next(x for x in res["assets"] if x["node"] == "u_xyz")
        self.assertEqual(row["ticker"], "XYZ")
        self.assertTrue(row["user_added"])
        self.assertEqual(row["direction"], 1)             # oil up -> producers up -> member up

    def test_added_asset_is_recognised_in_text(self):
        self.a.add_asset("XYZ", name="Xyz Oil Corp", sector="oil_gas_producers")
        res = self.a.analyze("Xyz Oil Corp shares jumped 8% on Tuesday.", live=False)
        self.assertIn("u_xyz", [m["node"] for m in res["mentions"]])

    def test_unverifiable_ticker_is_rejected_and_graph_unchanged(self):
        quotes.HUB.fetcher = failing_fetch
        before = self.a.kg.stats()
        r = self.a.add_asset("NOPE", sector="airlines")
        self.assertIn("Could not verify", r["error"])
        self.assertEqual(self.a.kg.stats(), before)

    def test_bad_input_and_duplicates(self):
        self.assertIn("error", self.a.add_asset("bad ticker!"))
        self.assertIn("already in the graph", self.a.add_asset("DAL")["error"])
        self.assertIn("unknown sector", self.a.add_asset("XYZ", sector="nope")["error"])

    def test_static_mode_blocks_learning_and_asset_adds(self):
        self.a.guard.set_mode("static")
        before = self.a.kg.stats()
        res = self.a.analyze(OIL, live=False)
        self.assertEqual(self.a.kg.stats(), before)
        self.assertEqual(res["kb_guard"]["mode"], "static")
        self.assertIn("static mode", self.a.add_asset("XYZ", sector="airlines")["error"])
        self.a.guard.set_mode("dynamic")
        self.a.analyze(OIL, live=False)
        self.assertEqual(self.a.kg.stats()["articles_ingested"], 1)

    def test_only_user_assets_removable(self):
        self.a.add_asset("XYZ", sector="airlines")
        self.assertIn("error", self.a.remove_asset("delta"))
        self.assertTrue(self.a.remove_asset("u_xyz")["ok"])
        self.assertNotIn("u_xyz", self.a.kg.g)

    def test_asset_without_sector_is_tracked_but_unlinked(self):
        r = self.a.add_asset("QQQQ", name="Qq Fund")
        if not r["linked"]:
            self.assertIn("will not appear", r["note"])
        self.assertEqual(r["sector_source"] in ("none", "matched from the name", "suggested by the LLM"), True)


class QuoteTests(unittest.TestCase):
    def test_watchlist_validates_with_a_real_quote(self):
        hub = quotes.QuoteHub(fetcher=fake_fetch, watch_file=None, threaded=False)
        self.assertIn("quote", hub.add_watch("aapl"))
        self.assertEqual(hub.watch, ["AAPL"])
        self.assertIn("already", hub.add_watch("AAPL")["error"])
        self.assertIn("not a valid", hub.add_watch("a b")["error"])
        hub.fetcher = lambda s: {x: {"symbol": x, "error": "no data for this symbol on Yahoo Finance", "fetched": time.time()} for x in s}
        self.assertIn("no data", hub.add_watch("ZZZZ")["error"])
        self.assertEqual(hub.watch, ["AAPL"])

    def test_failure_keeps_last_good_quote_flagged(self):
        hub = quotes.QuoteHub(fetcher=fake_fetch, watch_file=None, threaded=False)
        hub.get(["AAPL"])
        hub.fetcher = failing_fetch
        hub.fetch_now(["AAPL"])
        q = hub.snapshot(["AAPL"])["quotes"]["AAPL"]
        self.assertEqual(q["price"], 100.0)
        self.assertIn("no data", q["error"])

    def test_stream_yields_snapshot_then_updates(self):
        hub = quotes.QuoteHub(fetcher=fake_fetch, watch_file=None, threaded=False, poll=1)
        gen = hub.stream(["AAPL"], heartbeat=0.2)
        first = next(gen)                                          # sent immediately, possibly before the first fetch lands
        self.assertTrue(first.startswith("event: quotes"))
        got = [first] + [next(gen) for _ in range(3)]              # the background fetch shows up in the first frame or as an update
        self.assertTrue(any('"AAPL"' in g and g.startswith("event: quotes") for g in got), got)
        hub.fetch_now(["AAPL"])                                    # every later update is pushed too
        self.assertTrue(any(g.startswith("event: quotes") for g in [next(gen) for _ in range(2)]))

    def test_websocket_tick_updates_cache_and_beats_stale_poll(self):
        hub = quotes.QuoteHub(fetcher=fake_fetch, watch_file=None, threaded=False)
        hub.fetch_now(["AAPL"])                                       # poll: price 100, prev close 99
        hub._on_tick({"id": "AAPL", "price": 105.0, "time": str(int(time.time() * 1000)), "change": 6.0})
        q = hub.cache["AAPL"]
        self.assertEqual(q["price"], 105.0)
        self.assertAlmostEqual(q["change_pct"], (105 / 99 - 1) * 100)
        self.assertIn("WebSocket", q["source"])
        hub.fetch_now(["AAPL"])                                       # next poll must not roll back to the older bar
        self.assertEqual(hub.cache["AAPL"]["price"], 105.0)
        self.assertTrue(hub.snapshot(["AAPL"])["quotes"]["AAPL"]["live_tick"])
        hub._on_tick({"id": "AAPL", "price": "garbage"})              # malformed messages are ignored
        hub._on_tick({"price": 1.0})
        self.assertEqual(hub.cache["AAPL"]["price"], 105.0)

    def test_unknown_symbol_is_not_a_transport_failure(self):
        import yfinance
        class SharedMock:
            _ERRORS = {}
        had_shared = hasattr(yfinance, "shared")
        if not had_shared:
            yfinance.shared = SharedMock()
        old, old_err = yfinance.download, dict(getattr(yfinance.shared, "_ERRORS", {}))
        try:
            yfinance.download = lambda *a, **k: pd.DataFrame()
            yfinance.shared._ERRORS.clear()
            yfinance.shared._ERRORS["ZZZ"] = "YFPricesMissingError('possibly delisted; no price data found')"
            for _ in range(4):                                        # typos must never trip the circuit breaker
                self.assertIn("check the ticker", quotes.download(["ZZZ"])["ZZZ"]["error"])
            self.assertEqual(quotes.ts._YF_FAILS, [0, 0.0])
            yfinance.shared._ERRORS["ZZZ"] = "YFRateLimitError('Too Many Requests')"
            with self.assertRaises(RuntimeError):                     # a rate limit is a transport failure
                quotes.download(["ZZZ"])
        finally:
            yfinance.download = old
            if hasattr(yfinance, "shared"):
                yfinance.shared._ERRORS.clear()
                yfinance.shared._ERRORS.update(old_err)
                if not had_shared:
                    delattr(yfinance, "shared")
            quotes.ts._YF_FAILS[:] = [0, 0.0]

    def test_download_parses_both_yfinance_layouts(self):
        import yfinance
        idx = pd.to_datetime(["2026-10-07", "2026-10-08", "2026-10-09"])
        multi = pd.concat({"AAA": pd.DataFrame({"Close": [10.0, 11.0, 12.0]}, index=idx),
                           "BBB": pd.DataFrame({"Close": [20.0, 19.0, 18.0]}, index=idx)}, axis=1)
        single = pd.concat({"Price": pd.DataFrame({"Close": [10.0, 11.0, 12.0]}, index=idx)}, axis=1)
        single.columns = pd.MultiIndex.from_tuples([("Close", "AAA")])
        old = yfinance.download
        try:
            yfinance.download = lambda *a, **k: multi
            out = quotes.download(["AAA", "BBB"])
            self.assertAlmostEqual(out["AAA"]["change_pct"], (12 / 11 - 1) * 100)
            self.assertEqual(out["BBB"]["price"], 18.0)
            self.assertEqual(out["AAA"]["asof"], "2026-10-09")
            yfinance.download = lambda *a, **k: single
            self.assertEqual(quotes.download(["AAA"])["AAA"]["price"], 12.0)
            same = pd.concat({"AAA": pd.DataFrame({"Close": [10.0, 11.0, 12.0]}, index=idx),
                              "BBB": pd.DataFrame({"Close": [10.0, 11.0, 12.0]}, index=idx)}, axis=1)
            yfinance.download = lambda *a, **k: same                 # identical series = mix-up
            out = quotes.download(["AAA", "BBB"])
            self.assertIn("discarded", out["AAA"]["error"])
            yfinance.download = lambda *a, **k: multi
            self.assertIn("no data", quotes.download(["AAA", "CCC"])["CCC"]["error"])
        finally:
            yfinance.download = old
            quotes.ts._YF_FAILS[:] = [0, 0.0]


if __name__ == "__main__":
    unittest.main()
