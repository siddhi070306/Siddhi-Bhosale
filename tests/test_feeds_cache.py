import os
import threading
import time
import unittest

os.environ["ZENITH_REQUIRE_LLM"] = "0"

from impactgraph import feeds


class StaleWhileRevalidateTests(unittest.TestCase):
    def setUp(self):
        feeds._CACHE.clear()
        feeds._REFRESHING.clear()

    def test_first_call_waits_then_an_expired_value_is_returned_at_once_and_refreshed_behind(self):
        calls, gate = [], threading.Event()

        def slow():
            calls.append(1)
            if len(calls) > 1:
                gate.wait(5)                  # the refresh is slow
            return ["v%d" % len(calls)]

        self.assertEqual(feeds._cached("k", 0, slow), ["v1"])          # nothing cached yet: this call must wait
        t0 = time.time()
        self.assertEqual(feeds._cached("k", 0, slow), ["v1"])          # expired: served immediately, not after the slow fetch
        self.assertLess(time.time() - t0, 1.0)
        self.assertEqual(feeds._cached("k", 0, slow), ["v1"])          # a second request does not start a second refresh
        gate.set()
        for _ in range(50):
            if feeds._cached("k", 60, slow) == ["v2"]:
                break
            time.sleep(0.05)
        self.assertEqual(feeds._cached("k", 60, slow), ["v2"])
        self.assertEqual(len(calls), 2)

    def test_a_failed_refresh_keeps_the_old_value(self):
        feeds._cached("k", 0, lambda: ["good"])
        feeds._cached("k", 0, lambda: [])                              # refresh returns nothing
        time.sleep(0.2)
        self.assertEqual(feeds._cached("k", 60, lambda: ["never"]), ["good"])

    def test_a_fresh_value_is_not_refreshed(self):
        calls = []
        feeds._cached("k", 60, lambda: calls.append(1) or ["a"])
        feeds._cached("k", 60, lambda: calls.append(1) or ["b"])
        self.assertEqual(len(calls), 1)


class NewsApiQuotaTests(unittest.TestCase):
    def tearDown(self):
        feeds._NEWSAPI_BLOCKED_UNTIL[0] = 0.0

    def test_a_429_stops_further_calls_for_a_while_instead_of_retrying_every_page(self):
        from unittest import mock

        class R:
            status_code = 429
            def raise_for_status(self):
                raise RuntimeError("429")
            def json(self):
                return {}

        feeds._NEWSAPI_BLOCKED_UNTIL[0] = 0.0
        with mock.patch.dict(os.environ, {"NEWSAPI_KEY": "k"}), mock.patch.object(feeds.requests, "get", return_value=R()) as g:
            self.assertEqual(feeds.newsapi_headlines(5), [])
            first = g.call_count
            self.assertLessEqual(first, 2)                       # gave up at once, not 3 calls x 2 attempts
            self.assertEqual(feeds.newsapi_headlines(5), [])
            self.assertEqual(g.call_count, first)                # blocked: no new request at all


if __name__ == "__main__":
    unittest.main()

if __name__ == "__main__":
    unittest.main()
