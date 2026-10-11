import unittest
from datetime import datetime, timedelta, timezone

from impactgraph.priority import Article, ArticlePriorityScorer, select_primary_headline


class TestArticlePriorityScorer(unittest.TestCase):
    def setUp(self):
        self.scorer = ArticlePriorityScorer(
            w1_trust=0.50,
            w2_speed=0.20,
            w3_quality=0.30,
        )
        self.now = datetime(2026, 10, 11, 12, 0, 0, tzinfo=timezone.utc)

    def test_trust_score_authority_lookup(self):
        self.assertEqual(self.scorer.compute_trust_score("Moneycontrol"), 1.0)
        self.assertEqual(self.scorer.compute_trust_score("NewsAPI Aggregate"), 0.5)
        self.assertEqual(self.scorer.compute_trust_score("Random Unverified Blog"), 0.4)

    def test_speed_score_exponential_decay(self):
        # Current time gives 1.0
        score_now = self.scorer.compute_speed_score(self.now, self.now)
        self.assertAlmostEqual(score_now, 1.0, places=3)

        # 6 hours later (half-life) gives 0.5
        six_hours_ago = self.now - timedelta(hours=6)
        score_half_life = self.scorer.compute_speed_score(six_hours_ago, self.now)
        self.assertAlmostEqual(score_half_life, 0.5, places=2)

        # Future / same time is capped at 1.0
        future = self.now + timedelta(minutes=5)
        score_future = self.scorer.compute_speed_score(future, self.now)
        self.assertAlmostEqual(score_future, 1.0, places=3)

    def test_quality_score_length_and_quotes(self):
        short_article = Article(
            id="1",
            source_name="Moneycontrol",
            title="Short Title",
            body_text="Short update.",
            has_quotes=False,
        )
        long_article = Article(
            id="2",
            source_name="Moneycontrol",
            title="Full In-Depth Coverage of Market Volatility Across Sectors",
            body_text=" ".join(["Detailed financial analysis."] * 180),
            has_quotes=True,
        )
        q_short = self.scorer.compute_quality_score(short_article)
        q_long = self.scorer.compute_quality_score(long_article)
        self.assertGreater(q_long, q_short)
        self.assertAlmostEqual(q_long, 1.0, places=2)

    def test_trusted_quality_source_outranks_faster_aggregate(self):
        cluster = [
            # Aggregate feed published 2 minutes ago, but thin text and low trust
            Article(
                id="feed_aggregator",
                source_name="NewsAPI Aggregate",
                title="RBI holds repo rate unchanged at 6.5%",
                body_text="RBI holds repo rate unchanged today.",
                published_at=self.now - timedelta(minutes=2),
                has_quotes=False,
            ),
            # Moneycontrol published 20 minutes ago, but high authority and in-depth reporting with quotes
            Article(
                id="moneycontrol_primary",
                source_name="Moneycontrol",
                title="RBI Policy: Governor Das keeps repo rate steady at 6.5%, retains stance",
                body_text="The Reserve Bank of India Monetary Policy Committee decided to keep rates unchanged. " * 30,
                published_at=self.now - timedelta(minutes=20),
                has_quotes=True,
            ),
            # Random low quality blog
            Article(
                id="blog_scraper",
                source_name="CryptoFinanceDailyBlog",
                title="RBI announcement summary",
                body_text="Rates stayed unchanged.",
                published_at=self.now - timedelta(minutes=5),
                has_quotes=False,
            ),
        ]

        primary = self.scorer.select_primary_headline(cluster, reference_time=self.now)
        self.assertIsNotNone(primary)
        self.assertEqual(primary.id, "moneycontrol_primary")
        self.assertEqual(primary.source_name, "Moneycontrol")

    def test_rank_cluster_returns_sorted_breakdown(self):
        cluster = [
            Article(id="a1", source_name="NewsAPI Aggregate", title="Title 1", body_text="text"),
            Article(id="a2", source_name="Moneycontrol", title="Title 2 Long Enough Title For Richness", body_text="text " * 100, has_quotes=True),
        ]
        ranked = self.scorer.rank_cluster(cluster, reference_time=self.now)
        self.assertEqual(len(ranked), 2)
        self.assertGreater(ranked[0]["priority_score"], ranked[1]["priority_score"])
        self.assertEqual(ranked[0]["article"].id, "a2")


if __name__ == "__main__":
    unittest.main()
