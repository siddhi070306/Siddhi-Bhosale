"""Priority Score and Headline Ranking for clustered news articles.

Computes a composite Priority Score (P) for news articles in a duplicate/event cluster
to determine which publisher should be displayed as the primary headline:

    P = (w1 * trust_score) + (w2 * speed_score) + (w3 * quality_score)

Factors:
1. Trustworthiness (trust_score): Pre-defined authority score of the publishing source
   (e.g., Moneycontrol = 1.0, Reuters = 1.0, NewsAPI aggregate = 0.5).
2. Speed (speed_score): Recency score calculated using exponential decay relative to
   current/reference time (newer articles score closer to 1.0).
3. Quality (quality_score): Content depth score based on article text length, presence of
   quotes/attribution, and rich formatting.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Dict, List, Optional, Sequence, Union


@dataclass(slots=True)
class Article:
    """Represents a news article in a duplicate/event cluster."""
    id: str
    source_name: str
    title: str
    body_text: str = ""
    summary: str = ""
    published_at: Optional[Union[datetime, str]] = None
    has_quotes: bool = False
    link: str = ""
    metadata: Optional[Dict[str, Any]] = None


def parse_timestamp(ts: Optional[Union[datetime, str, int, float]]) -> datetime:
    """Parse various timestamp formats (datetime, RFC 2822 RSS date, ISO string, epoch)."""
    if ts is None:
        return datetime.now(timezone.utc)
    if isinstance(ts, datetime):
        return ts if ts.tzinfo is not None else ts.replace(tzinfo=timezone.utc)
    if isinstance(ts, (int, float)):
        return datetime.fromtimestamp(ts, tz=timezone.utc)
    if isinstance(ts, str):
        s = ts.strip()
        if not s:
            return datetime.now(timezone.utc)
        # Try RFC 2822 (common in RSS feeds like pubDate: 'Sun, 11 Oct 2026 08:00:00 GMT')
        try:
            dt = parsedate_to_datetime(s)
            return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)
        except Exception:
            pass
        # Try ISO 8601 (common in NewsAPI / JSON APIs: '2026-10-11T08:00:00Z')
        try:
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
            return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)
        except Exception:
            pass
    return datetime.now(timezone.utc)


class ArticlePriorityScorer:
    """
    Computes priority scores for articles in a cluster to select the primary headline.
    All evaluations are lightweight and O(1) mathematical evaluations per article.
    """

    # Pre-defined authority scores normalized between 0.0 and 1.0
    DEFAULT_SOURCE_AUTHORITY: Dict[str, float] = {
        "moneycontrol": 1.0,
        "reuters": 1.0,
        "bloomberg": 1.0,
        "financial times": 1.0,
        "the hindu": 0.90,
        "the hindu businessline": 0.90,
        "economic times": 0.90,
        "et markets": 0.90,
        "et economy": 0.90,
        "et industry": 0.90,
        "livemint": 0.85,
        "business standard": 0.85,
        "cnbc": 0.85,
        "cnbc markets": 0.85,
        "marketwatch": 0.85,
        "times of india business": 0.80,
        "ndtv": 0.75,
        "ndtv profit": 0.75,
        "newsapi aggregate": 0.50,
        "newsapi": 0.50,
    }

    def __init__(
        self,
        w1_trust: float = 0.50,
        w2_speed: float = 0.20,
        w3_quality: float = 0.30,
        half_life_hours: float = 6.0,
        target_quality_word_count: int = 500,
        source_authority_map: Optional[Dict[str, float]] = None,
        default_trust_score: float = 0.40,
    ) -> None:
        """
        Sensible default weights:
        - w1 (Trust) = 0.50: Highest importance so established sources outrank aggregators.
        - w2 (Speed) = 0.20: Modest weight so fresh news scores well without letting scrapers win.
        - w3 (Quality) = 0.30: Rewards long-form reporting and direct quotes.
        """
        total = w1_trust + w2_speed + w3_quality
        if not math.isclose(total, 1.0, rel_tol=1e-5):
            self.w1 = w1_trust / total
            self.w2 = w2_speed / total
            self.w3 = w3_quality / total
        else:
            self.w1 = w1_trust
            self.w2 = w2_speed
            self.w3 = w3_quality

        self.half_life_seconds = half_life_hours * 3600.0
        self.decay_constant = 0.69314718056 / self.half_life_seconds  # ln(2) / half_life
        self.target_quality_word_count = target_quality_word_count
        self.default_trust_score = default_trust_score

        raw_map = source_authority_map or self.DEFAULT_SOURCE_AUTHORITY
        self.source_authority = {k.strip().lower(): float(v) for k, v in raw_map.items()}

    def compute_trust_score(self, source_name: str) -> float:
        """O(1) dictionary lookup for domain authority score [0.0, 1.0]."""
        clean_name = (source_name or "").strip().lower()
        if not clean_name:
            return self.default_trust_score
        if clean_name in self.source_authority:
            return self.source_authority[clean_name]
        # Partial match fallback (e.g. 'Moneycontrol News' -> 'moneycontrol')
        for key, score in self.source_authority.items():
            if key in clean_name or clean_name in key:
                return score
        return self.default_trust_score

    def compute_speed_score(
        self, published_at: Optional[Union[datetime, str]], reference_time: datetime
    ) -> float:
        """
        Recency score using exponential decay:
            speed_score = exp(-lambda * delta_seconds)
        Bounded in [0.0, 1.0].
        """
        dt = parse_timestamp(published_at)
        ref = reference_time if reference_time.tzinfo is not None else reference_time.replace(tzinfo=timezone.utc)
        age_seconds = max(0.0, (ref - dt).total_seconds())
        return math.exp(-self.decay_constant * age_seconds)

    def compute_quality_score(self, article: Article) -> float:
        """
        O(1) Quality evaluation score [0.0, 1.0]:
        - Length / Depth (up to target_quality_word_count words)
        - Quotes detection (quotes flag or quote marks in text/summary)
        - Formatting / Structure (headline richness)
        """
        content = (article.body_text or "").strip()
        if not content:
            content = (article.summary or "").strip()

        word_count = len(content.split()) if content else 0
        length_score = min(1.0, word_count / self.target_quality_word_count)

        has_quotes = article.has_quotes
        if not has_quotes and content:
            # Check for direct quotation marks or attribution verbs
            if '"' in content or '“' in content or "”" in content:
                has_quotes = True
            elif re.search(r'\b(said|stated|told|announced|commented)\b', content, re.IGNORECASE):
                has_quotes = True

        quote_score = 1.0 if has_quotes else 0.0
        headline_quality = 1.0 if len(article.title.strip()) >= 30 else 0.5

        # Weighted quality components: 60% depth, 30% quotes/attributions, 10% headline richness
        return (0.60 * length_score) + (0.30 * quote_score) + (0.10 * headline_quality)

    def calculate_priority_score(
        self, article: Article, reference_time: Optional[datetime] = None
    ) -> float:
        """
        Calculates normalized Priority Score P:
            P = (w1 * trust_score) + (w2 * speed_score) + (w3 * quality_score)
        """
        ref_time = reference_time or datetime.now(timezone.utc)
        t_score = self.compute_trust_score(article.source_name)
        s_score = self.compute_speed_score(article.published_at, ref_time)
        q_score = self.compute_quality_score(article)

        score = (self.w1 * t_score) + (self.w2 * s_score) + (self.w3 * q_score)
        return round(score, 4)

    def select_primary_headline(
        self, cluster: Sequence[Article], reference_time: Optional[datetime] = None
    ) -> Optional[Article]:
        """
        Returns the article with the highest priority score from a duplicate cluster.
        O(N) search with O(1) score evaluation per item.
        """
        if not cluster:
            return None

        ref_time = reference_time or datetime.now(timezone.utc)
        return max(
            cluster,
            key=lambda article: self.calculate_priority_score(article, ref_time),
        )

    def rank_cluster(
        self, cluster: Sequence[Article], reference_time: Optional[datetime] = None
    ) -> List[Dict[str, Any]]:
        """
        Returns all articles in the cluster sorted by priority score descending,
        along with breakdowns of trust, speed, and quality factors.
        """
        ref_time = reference_time or datetime.now(timezone.utc)
        ranked = []
        for art in cluster:
            t = self.compute_trust_score(art.source_name)
            s = self.compute_speed_score(art.published_at, ref_time)
            q = self.compute_quality_score(art)
            p = (self.w1 * t) + (self.w2 * s) + (self.w3 * q)
            ranked.append({
                "article": art,
                "priority_score": round(p, 4),
                "trust_score": round(t, 4),
                "speed_score": round(s, 4),
                "quality_score": round(q, 4),
            })
        ranked.sort(key=lambda x: x["priority_score"], reverse=True)
        return ranked


# Singleton default instance
default_scorer = ArticlePriorityScorer()


def select_primary_headline(
    cluster: Sequence[Article], reference_time: Optional[datetime] = None
) -> Optional[Article]:
    """Helper function to pick the primary headline from a cluster using default weights."""
    return default_scorer.select_primary_headline(cluster, reference_time)
