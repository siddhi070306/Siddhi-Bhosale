"""On a host whose disk is wiped on restart (Render's free plan), the knowledge-base state, the analysis library and the
watchlist are kept in Upstash Redis and read back after a restart. Tested against an in-memory fake of the Upstash REST API."""
import os
import shutil
import tempfile
import unittest
from unittest import mock

os.environ["ZENITH_REQUIRE_LLM"] = "0"

from impactgraph import kbstate, library, quotes, store
from impactgraph.service import Analyzer

ON_RENDER = {"UPSTASH_REDIS_REST_URL": "https://fake-db.upstash.io", "UPSTASH_REDIS_REST_TOKEN": "t", "RENDER": "true"}
OIL = "Brent crude jumped 12% on Monday after an attack on tankers in the Strait of Hormuz. Airline stocks fell sharply."


class FakeUpstash:
    def __init__(self):
        self.db, self.calls, self.down = {}, [], False

    def __call__(self, method, url, headers=None, data=None, timeout=None):
        self.calls.append((method, url))
        if self.down:
            raise ConnectionError("down")
        assert headers["Authorization"] == "Bearer t"
        op, _, key = url.split("fake-db.upstash.io/")[1].partition("/")
        if op == "set":
            self.db[key] = data
            out = {"result": "OK"}
        elif op == "get":
            out = {"result": self.db.get(key)}
        else:
            out = {"result": int(self.db.pop(key, None) is not None)}
        r = mock.Mock(status_code=200)
        r.json.return_value = out
        return r


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.fake = FakeUpstash()
        self.tmp = tempfile.mkdtemp()
        p = mock.patch.object(store.requests, "request", self.fake)
        p.start()
        self.addCleanup(p.stop)
        self.addCleanup(shutil.rmtree, self.tmp, True)

    def test_off_on_a_laptop_even_with_the_keys(self):
        with mock.patch.dict(os.environ, {"UPSTASH_REDIS_REST_URL": "https://fake-db.upstash.io",
                                          "UPSTASH_REDIS_REST_TOKEN": "t"}, clear=False):
            os.environ.pop("RENDER", None)
            os.environ.pop("ZENITH_DURABLE_STORE", None)
            self.assertFalse(store.enabled())
            self.assertFalse(store.set_json("x", {"a": 1}))
        self.assertEqual(self.fake.calls, [])

    def test_round_trip_compressed(self):
        with mock.patch.dict(os.environ, ON_RENDER):
            self.assertTrue(store.set_json("x", {"a": [1, 2, 3]}))
            self.assertEqual(store.get_json("x"), {"a": [1, 2, 3]})
            self.assertTrue(list(self.fake.db)[0].startswith("zenith:"))
            self.assertIsNone(store.get_json("missing"))

    def test_the_knowledge_base_survives_a_wiped_disk(self):
        state = os.path.join(self.tmp, "kb_state.json")
        with mock.patch.dict(os.environ, ON_RENDER), mock.patch.object(kbstate, "STATE_FILE", state):
            a = Analyzer(persist=True)
            a.update_edge("crude_oil", "airlines", weight=-0.4)
            v = a.guard.version
            os.remove(state)                                      # the restart wipes the disk
            b = Analyzer(persist=True)
            self.assertEqual(b.guard.version, v)
            self.assertEqual(b.kg.g["crude_oil"]["airlines"]["strength"], 0.4)

    def test_the_library_survives_a_wiped_disk(self):
        d = os.path.join(self.tmp, "analyses")
        with mock.patch.dict(os.environ, ON_RENDER):
            res = Analyzer().analyze(OIL, live=False)
            lib = library.AnalysisLibrary(d)
            lib.record(res, title="Oil jumps")
            shutil.rmtree(d)
            again = library.AnalysisLibrary(d)
            self.assertEqual([r["id"] for r in again.records], [res["article_id"]])
            self.assertEqual(again.full(res["article_id"])["text"], res["text"])

    def test_the_watchlist_survives_a_wiped_disk(self):
        f = os.path.join(self.tmp, "watch.json")
        with mock.patch.dict(os.environ, ON_RENDER):
            q = quotes.QuoteHub(fetcher=lambda syms: {}, watch_file=f, threaded=False)
            q.watch = ["AAPL"]
            q._save_watch()
            os.remove(f)
            self.assertIn("AAPL", quotes.QuoteHub(fetcher=lambda syms: {}, watch_file=f, threaded=False).watch)

    def test_an_outage_never_breaks_saving(self):
        state = os.path.join(self.tmp, "kb_state.json")
        self.fake.down = True
        with mock.patch.dict(os.environ, ON_RENDER), mock.patch.object(kbstate, "STATE_FILE", state):
            a = Analyzer(persist=True)
            r = a.update_edge("crude_oil", "airlines", weight=-0.4)
            self.assertTrue(r["ok"])
            self.assertTrue(os.path.exists(state))                # the local file is still written
            self.assertIn("unreachable", store.last_error())


if __name__ == "__main__":
    unittest.main()
