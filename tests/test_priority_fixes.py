import sys
import unittest
from datetime import datetime, timedelta, timezone

from impactgraph.priority import Article, ArticlePriorityScorer, UNKNOWN_SPEED, select_primary_headline


class SpeedTests(unittest.TestCase):
    def setUp(self):
        self.s = ArticlePriorityScorer()
        self.now = datetime.now(timezone.utc)

    def test_missing_or_unreadable_timestamps_are_neutral_not_fresh(self):
        for ts in (None, "", "   ", "garbage", "not a date"):
            self.assertEqual(self.s.compute_speed_score(ts, self.now), UNKNOWN_SPEED, repr(ts))

    def test_a_fresh_dated_article_beats_an_undated_one_from_the_same_source(self):
        fresh = Article(id="a", source_name="Reuters", title="A reasonably long headline about markets today",
                        published_at=self.now - timedelta(minutes=20), body_text="x " * 100)
        undated = Article(id="b", source_name="Reuters", title="A reasonably long headline about markets today",
                          published_at=None, body_text="x " * 100)
        self.assertGreater(self.s.calculate_priority_score(fresh, self.now), self.s.calculate_priority_score(undated, self.now))
        self.assertEqual(select_primary_headline([undated, fresh], self.now).id, "a")

    def test_real_timestamps_still_decay(self):
        self.assertAlmostEqual(self.s.compute_speed_score(self.now - timedelta(hours=6), self.now), 0.5, places=2)
        self.assertEqual(self.s.compute_speed_score("Sun, 11 Oct 2026 08:00:00 GMT", datetime(2026, 10, 11, 8, 0, tzinfo=timezone.utc)), 1.0)
        self.assertEqual(self.s.compute_speed_score("2026-10-11T08:00:00Z", datetime(2026, 10, 11, 8, 0, tzinfo=timezone.utc)), 1.0)


class TrustTests(unittest.TestCase):
    def setUp(self):
        self.s = ArticlePriorityScorer()

    def test_a_short_name_does_not_borrow_a_longer_sources_authority(self):
        self.assertEqual(self.s.compute_trust_score("Times"), self.s.default_trust_score)
        self.assertEqual(self.s.compute_trust_score("ET"), self.s.default_trust_score)
        self.assertEqual(self.s.compute_trust_score("Random Blog"), self.s.default_trust_score)

    def test_known_sources_and_their_variants_still_match(self):
        self.assertEqual(self.s.compute_trust_score("Reuters"), 1.0)
        self.assertEqual(self.s.compute_trust_score("Moneycontrol News"), 1.0)
        self.assertEqual(self.s.compute_trust_score("NewsAPI/The Washington Post"), 0.5)
        self.assertEqual(self.s.compute_trust_score("CNBC Markets"), 0.85)
        self.assertEqual(self.s.compute_trust_score("ET Markets"), 0.90)

    def test_the_most_specific_name_wins(self):
        self.assertEqual(self.s.compute_trust_score("The Hindu BusinessLine"), 0.90)
        self.assertEqual(self.s.compute_trust_score("Times of India Business"), 0.80)


class Python39Tests(unittest.TestCase):
    def test_the_package_imports_on_this_python(self):
        import impactgraph  # noqa: F401  (priority.py once used dataclass(slots=True), which needs 3.10)
        self.assertTrue(hasattr(impactgraph, "ArticlePriorityScorer"))
        self.assertGreaterEqual(sys.version_info[:2], (3, 9))


if __name__ == "__main__":
    unittest.main()
