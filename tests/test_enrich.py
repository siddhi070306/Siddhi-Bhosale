import os
import unittest
from unittest import mock

os.environ["ZENITH_REQUIRE_LLM"] = "0"

from impactgraph import feeds, llm
from impactgraph.service import Analyzer

ARTICLE_HTML = ("<html><head><title>Oil jumps</title></head><body><nav>menu</nav><article>"
                + "".join("<p>Paragraph %d: Brent crude jumped 12%% after an attack on tankers, so airline stocks fell and "
                          "inflation expectations rose as the rupee weakened.</p>" % i for i in range(6))
                + "</article><footer>footer text that is long enough to be a paragraph but is dropped</footer></body></html>")


class FakeResp:
    def __init__(self, status=200, body=b"", headers=None):
        self.status_code, self.headers, self.encoding = status, headers or {}, "utf-8"
        import io
        self.raw = io.BytesIO(body)
        self.raw.read_orig = self.raw.read
        self.raw.read = lambda n=-1, decode_content=True: self.raw.read_orig(n)

    def close(self):
        pass


class SafeFetchTests(unittest.TestCase):
    def setUp(self):
        feeds._ROBOTS.clear()

    def test_internal_and_odd_urls_are_refused_without_any_request(self):
        with mock.patch.object(feeds.requests, "get") as get:
            for url in ("http://127.0.0.1:8000/api/status", "http://localhost/x", "http://10.0.0.5/a",
                        "http://169.254.169.254/latest/meta-data", "http://192.168.1.1/", "file:///etc/passwd",
                        "ftp://example.com/a", "http://user:pw@example.com/", "https://example.com:8443/a"):
                r = feeds.fetch_article(url)
                self.assertFalse(r["ok"], url)
            get.assert_not_called()

    def test_redirect_to_a_private_address_is_refused(self):
        def fake_get(url, **k):
            if url.endswith("/robots.txt"):
                return FakeResp(404)
            return FakeResp(302, headers={"location": "http://127.0.0.1/secret"})
        with mock.patch.object(feeds, "_public_host", side_effect=lambda h: h != "127.0.0.1"), \
                mock.patch.object(feeds.requests, "get", side_effect=fake_get):
            r = feeds.fetch_article("https://news.example.com/a")
        self.assertFalse(r["ok"])
        self.assertIn("public", r["reason"])

    def test_robots_disallow_is_respected(self):
        def fake_get(url, **k):
            if url.endswith("/robots.txt"):
                return FakeResp(200, b"User-agent: *\nDisallow: /", {"content-type": "text/plain"})
            raise AssertionError("article must not be requested")
        with mock.patch.object(feeds, "_public_host", return_value=True), mock.patch.object(feeds.requests, "get", side_effect=fake_get):
            r = feeds.fetch_article("https://news.example.com/a")
        self.assertFalse(r["ok"])
        self.assertIn("robots", r["reason"])

    def test_unreachable_robots_means_refused_but_missing_robots_means_allowed(self):
        with mock.patch.object(feeds, "_public_host", return_value=True):
            with mock.patch.object(feeds.requests, "get", return_value=FakeResp(503)):
                self.assertFalse(feeds._robots_allow("https://a.example.com/x"))
            with mock.patch.object(feeds.requests, "get", return_value=FakeResp(404)):
                self.assertTrue(feeds._robots_allow("https://b.example.com/x"))

    def test_article_text_is_extracted_and_boilerplate_dropped(self):
        def fake_get(url, **k):
            if url.endswith("/robots.txt"):
                return FakeResp(404)
            return FakeResp(200, ARTICLE_HTML.encode(), {"content-type": "text/html; charset=utf-8"})
        with mock.patch.object(feeds, "_public_host", return_value=True), mock.patch.object(feeds.requests, "get", side_effect=fake_get):
            r = feeds.fetch_article("https://news.example.com/a")
        self.assertTrue(r["ok"], r)
        self.assertIn("Brent crude jumped 12%", r["text"])
        self.assertNotIn("footer text", r["text"])
        self.assertNotIn("menu", r["text"])
        self.assertLessEqual(len(r["text"]), feeds.MAX_ARTICLE_CHARS)

    def test_paywall_stub_is_reported_not_used(self):
        stub = b"<html><body><article><p>Subscribe to read the full story of this very long headline here.</p></article></body></html>"
        def fake_get(url, **k):
            return FakeResp(404) if url.endswith("/robots.txt") else FakeResp(200, stub, {"content-type": "text/html"})
        with mock.patch.object(feeds, "_public_host", return_value=True), mock.patch.object(feeds.requests, "get", side_effect=fake_get):
            r = feeds.fetch_article("https://news.example.com/a")
        self.assertFalse(r["ok"])
        self.assertIn("too little", r["reason"])

    def test_snippet_combines_description_and_content_without_duplicates(self):
        a = {"description": "Oil jumped on supply fears.", "content": "Oil jumped on supply fears. Airlines fell sharply as fuel costs rose… [+2410 chars]"}
        self.assertEqual(feeds.article_snippet(a), "Oil jumped on supply fears. Airlines fell sharply as fuel costs rose")
        self.assertEqual(feeds.article_snippet({"description": "Oil jumped.", "content": "Oil jumped. [+900 chars]"}), "Oil jumped.")
        b = {"description": "Oil jumped.", "content": "Airlines fell sharply as fuel costs rose and the rupee weakened… [+900 chars]"}
        self.assertEqual(feeds.article_snippet(b), "Oil jumped. Airlines fell sharply as fuel costs rose and the rupee weakened")
        self.assertEqual(feeds.article_snippet({"description": None, "content": None}), "")


class ServiceInputTests(unittest.TestCase):
    TITLE = "Rupee recovers after RBI intervention."

    def test_full_article_is_appended_when_allowed_and_reported(self):
        a = Analyzer()
        with mock.patch.object(feeds, "fetch_article", return_value={"ok": True, "text": "Brent crude jumped 12% on Monday.", "title": "", "reason": ""}):
            res = a.analyze(self.TITLE, live=False, link="https://news.example.com/a", full_text=True)
        self.assertTrue(res["input"]["full_article"])
        self.assertIn("Brent crude jumped 12%", res["text"])
        self.assertTrue([e for e in res["events"] if e["trigger"] == "crude_oil"])     # the body added an event the headline lacked

    def test_blocked_article_falls_back_to_snippet_with_a_note(self):
        a = Analyzer()
        with mock.patch.object(feeds, "fetch_article", return_value={"ok": False, "text": "", "title": "", "reason": "paywall"}):
            res = a.analyze(self.TITLE, live=False, link="https://news.example.com/a", full_text=True)
        self.assertFalse(res["input"]["full_article"])
        self.assertIn("paywall", res["input"]["note"])
        self.assertEqual(res["text"], self.TITLE)

    def test_full_text_off_never_fetches(self):
        a = Analyzer()
        with mock.patch.object(feeds, "fetch_article") as fa:
            a.analyze(self.TITLE, live=False, link="https://news.example.com/a", full_text=False)
        fa.assert_not_called()

    def test_pasted_internal_url_is_refused(self):
        res = Analyzer().analyze("http://127.0.0.1:8000/api/status", live=False)
        self.assertIn("Could not read that article", res["error"])


class LlmResilienceTests(unittest.TestCase):
    def setUp(self):
        self.env = mock.patch.dict(os.environ, {"GROQ_API_KEY": "g", "OPENROUTER_API_KEY": "o", "ZENITH_LLM_PROVIDER": ""})
        self.env.start()

    def tearDown(self):
        self.env.stop()

    @staticmethod
    def resp(status, content=None, headers=None):
        r = mock.Mock(status_code=status, headers=headers or {})
        r.json.return_value = {"choices": [{"message": {"content": content}}]}
        return r

    def test_rate_limited_primary_falls_back_to_next_provider_immediately(self):
        calls = []
        def post(url, **k):
            calls.append(url)
            return self.resp(429, headers={"x-ratelimit-reset-tokens": "40s"}) if "groq" in url else self.resp(200, '{"ok":1}')
        with mock.patch.object(llm.requests, "post", side_effect=post), mock.patch.object(llm.time, "sleep") as sl:
            out = llm._chat("s", "u", json_mode=True)
        self.assertEqual(out, '{"ok":1}')
        self.assertEqual(len(calls), 2)
        sl.assert_not_called()
        self.assertIsNone(llm.last_error())

    def test_all_limited_waits_the_shortest_limit_then_retries(self):
        seq = iter([self.resp(429, headers={"retry-after": "7"}), self.resp(429, headers={"x-ratelimit-reset-tokens": "1m2s"}),
                    self.resp(200, "done")])
        with mock.patch.object(llm.requests, "post", side_effect=lambda *a, **k: next(seq)), mock.patch.object(llm.time, "sleep") as sl:
            self.assertEqual(llm._chat("s", "u"), "done")
        self.assertAlmostEqual(sl.call_args[0][0], 7.5)

    def test_gives_up_with_a_reason_when_the_wait_is_too_long(self):
        r = self.resp(429, headers={"x-ratelimit-reset-tokens": "2m0s"})
        with mock.patch.object(llm.requests, "post", return_value=r), mock.patch.object(llm.time, "sleep") as sl:
            self.assertIsNone(llm._chat("s", "u"))
        sl.assert_not_called()
        self.assertIn("rate-limited", llm.last_error())
        self.assertIn("wait", llm.last_error())

    def test_extract_graph_keeps_only_verified_items(self):
        text = "Brent crude jumped 12% on Monday. Airline stocks fell sharply as fuel costs rose, the report said."
        payload = ('{"events":[{"trigger":"crude_oil","direction":1,"status":"observed","magnitude":"12%","type":"price_move",'
                   '"quote":"Brent crude jumped 12% on Monday."},'
                   '{"trigger":"crude_oil","direction":1,"status":"observed","quote":"A sentence that is not in the article at all."},'
                   '{"trigger":"nope","direction":1,"quote":"x"}],'
                   '"links":[{"src":"crude_oil","dst":"airlines","sign":-1,"mechanism":"fuel cost","quote":"Airline stocks fell sharply as fuel costs rose, the report said."},'
                   '{"src":"crude_oil","dst":"airlines","sign":-1,"quote":"invented supporting sentence not in text"},'
                   '{"src":"crude_oil","dst":"ghost","sign":1,"quote":"Airline stocks fell sharply as fuel costs rose"}]}')
        with mock.patch.object(llm, "_chat", return_value=payload):
            events, links = llm.extract_graph(text)
        self.assertEqual([e["trigger"] for e in events], ["crude_oil"])
        self.assertEqual([(l["src"], l["dst"]) for l in links], [("crude_oil", "airlines")])

    def test_extract_graph_reports_bad_json(self):
        with mock.patch.object(llm, "_chat", return_value="not json"):
            self.assertIsNone(llm.extract_graph("text"))
        self.assertIn("JSON", llm.last_error())


if __name__ == "__main__":
    unittest.main()
