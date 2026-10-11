import unittest
from datetime import datetime, timedelta, timezone

from impactgraph.priority import (
    Article,
    ArticlePriorityScorer,
    cluster_articles,
    deduplicate_and_rank_headlines,
    norm_title,
    select_primary_headline,
    title_similarity,
)


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

    def test_refined_quotes_detection_heuristics(self):
        # 1. Genuine paired quotes should be detected
        art_paired = Article(
            id="q1",
            source_name="Reuters",
            title="Fed Chair speaks on economic outlook today",
            body_text='Governor Powell stated "we remain steadfast in our commitment to bring inflation to 2%".',
        )
        score_paired = self.scorer.compute_quality_score(art_paired)
        # 2. Smart quotes should be detected
        art_smart = Article(
            id="q2",
            source_name="Bloomberg",
            title="Central Bank holds rates steady in meeting",
            body_text='“Our monetary policy stance remains appropriately calibrated,” said committee members.',
        )
        score_smart = self.scorer.compute_quality_score(art_smart)
        # 3. Direct attribution phrasing
        art_attr = Article(
            id="q3",
            source_name="ET Markets",
            title="Treasury briefing indicates steady liquidity",
            body_text='The spokesperson told reporters that banking liquidity is in surplus.',
        )
        score_attr = self.scorer.compute_quality_score(art_attr)

        # 4. Bare words like 'announced' or single quotes should NOT trigger quote bonus
        art_false1 = Article(
            id="f1",
            source_name="NewsAPI",
            title="Ministry announced quarterly incentives",
            body_text='The Ministry announced fresh incentives for domestic manufacturing today.',
            has_quotes=False,
        )
        score_false1 = self.scorer.compute_quality_score(art_false1)

        art_false2 = Article(
            id="f2",
            source_name="NewsAPI",
            title="Hardware supplier ships 15 inch monitors",
            body_text='The company launched a 15" screen laptop series for retail markets.',
            has_quotes=False,
        )
        score_false2 = self.scorer.compute_quality_score(art_false2)

        # Articles with genuine quotes must outscore equivalent text without quotes
        self.assertGreater(score_paired, score_false1)
        self.assertGreater(score_smart, score_false2)
        self.assertGreater(score_attr, score_false1)

    def test_title_normalization_and_similarity(self):
        t1 = "RBI keeps repo rate unchanged at 6.5% - Reuters"
        t2 = "RBI keeps repo rate unchanged at 6.5% | Livemint"
        self.assertEqual(norm_title(t1), "rbi keeps repo rate unchanged at 6 5%")
        self.assertAlmostEqual(title_similarity(t1, t2), 1.0, places=2)

        # Similar phrasing reporting the same event
        t3 = "RBI Policy: Governor Das holds repo rate steady at 6.5%"
        sim = title_similarity(t1, t3)
        self.assertGreater(sim, 0.60)

        # Completely unrelated event
        t_unrelated = "Crude oil plunges 4% amid Middle East demand concerns"
        sim_unrelated = title_similarity(t1, t_unrelated)
        self.assertLess(sim_unrelated, 0.30)

    def test_cluster_articles_groups_duplicates(self):
        articles = [
            Article(id="1", source_name="Reuters", title="RBI holds repo rate unchanged at 6.5% - Reuters"),
            Article(id="2", source_name="ET Markets", title="RBI Policy: Governor Das keeps repo rate steady at 6.5%"),
            Article(id="3", source_name="CNBC", title="Crude oil drops 3% on rising inventories"),
            Article(id="4", source_name="MarketWatch", title="Oil prices fall 3% as US crude inventories rise"),
            Article(id="5", source_name="Livemint", title="Apple supplier foxconn expands plant in southern India"),
        ]
        clusters = cluster_articles(articles, similarity_threshold=0.60)
        self.assertEqual(len(clusters), 3)

        # Find the RBI cluster
        rbi_cluster = next(c for c in clusters if any("rbi" in a.title.lower() for a in c))
        self.assertEqual(len(rbi_cluster), 2)
        # Find the Oil cluster
        oil_cluster = next(c for c in clusters if any("oil" in a.title.lower() for a in c))
        self.assertEqual(len(oil_cluster), 2)

    def test_deduplicate_and_rank_headlines_pipeline(self):
        raw_items = [
            {
                "id": "raw_1",
                "source": "NewsAPI Aggregate",
                "title": "RBI holds repo rate unchanged at 6.5%",
                "summary": "Short snippet.",
                "published": "2026-10-11T11:58:00Z",
                "link": "https://example.com/agg",
            },
            {
                "id": "raw_2",
                "source": "Reuters",
                "title": "RBI keeps repo rate unchanged at 6.5% - Reuters",
                "summary": "Detailed coverage of the monetary policy committee decision.",
                "body_text": 'Governor Das stated "we remain focused on the withdrawal of accommodation" to ensure inflation aligns with the target. ' * 10,
                "published": "2026-10-11T11:45:00Z",
                "link": "https://reuters.com/rbi",
                "has_quotes": True,
            },
            {
                "id": "raw_3",
                "source": "ET Markets",
                "title": "Crude oil drops 3% on rising inventories",
                "summary": "Crude benchmarks declined following inventory reports.",
                "published": "2026-10-11T11:30:00Z",
                "link": "https://economictimes.com/oil",
            },
        ]

        deduped = deduplicate_and_rank_headlines(raw_items, similarity_threshold=0.60, reference_time=self.now)
        # raw_1 and raw_2 report the same RBI story; they must collapse into 1 cluster
        self.assertEqual(len(deduped), 2)

        # Primary headline for the RBI story should be Reuters (higher authority 1.0 + quality depth)
        rbi_story = next(item for item in deduped if "rbi" in item["title"].lower())
        self.assertEqual(rbi_story["source"], "Reuters")
        self.assertEqual(rbi_story["cluster_size"], 2)
        self.assertIn("NewsAPI Aggregate", rbi_story["sources"])
        self.assertIn("Reuters", rbi_story["sources"])
        self.assertEqual(len(rbi_story["duplicates"]), 1)
        self.assertEqual(rbi_story["duplicates"][0]["source"], "NewsAPI Aggregate")

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

