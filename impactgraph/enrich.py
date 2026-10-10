"""Give a thin headline more to analyse, without inventing anything.

Fallback chain (cheapest and most trustworthy first):
  1. the description/snippet the feed already supplied;
  2. the same story in another feed, if that copy has a real summary (matched by title similarity, shown to the user);
  3. the article body, when the site's robots.txt allows reading it (see feeds.fetch_article);
  4. the page's own meta description, if the body could not be read.
Whatever comes out is labelled by quality: "article" > "description" > "headline_only". When nothing real is
found the caller may still ask the model for background (llm.suggest_themes), which is kept separate: it is never
mixed into the text that events and links are extracted from.
"""
import difflib
import re

from . import feeds

MIN_DESCRIPTION = 60       # characters of real text beyond the title for a story to count as "has a description"
SEEK_BETTER = 120          # below this we still look for a fuller summary elsewhere (typical NewsAPI snippets are 100-150)
MATCH_THRESHOLD = 0.85     # title similarity needed to treat two feed items as the same story


def norm_title(t):
    t = (t or "").lower()
    m = re.search(r"\s[-|–—]\s([^-|–—]{2,35})$", t)      # strip a trailing " - Publisher"
    if m:
        t = t[:m.start()]
    return " ".join(re.sub(r"[^a-z0-9% ]+", " ", t).split())


def similarity(a, b):
    return difflib.SequenceMatcher(None, norm_title(a) or "", norm_title(b) or "").ratio()


def real_chars(text, title):
    """Characters of text beyond the title itself."""
    t = (text or "").strip()
    if title and t.lower().startswith(title.strip().lower()):
        t = t[len(title.strip()):]
    return len(t.strip(" .\n"))


def cross_feed_summary(title, link, have_chars, pool=None):
    """Best summary for the same story from another feed item. -> dict or None. Needs a clear title match and a
    summary that is meaningfully longer than what we already have."""
    best = None
    for it in (pool if pool is not None else feeds.pool()):
        if it.get("link") and it["link"] == link:
            continue
        s = (it.get("summary") or "").strip()
        if len(s) < max(SEEK_BETTER, have_chars + 40):
            continue
        r = similarity(title, it["title"])
        if r >= MATCH_THRESHOLD and (best is None or r > best["similarity"]):
            best = {"summary": s, "source": it["source"], "similarity": round(r, 2), "title": it["title"]}
    return best


def build(title, text, link=None, full_text=False, pool=None):
    """-> {"text", "quality", "sources": [..], "note": str|None}. `text` is title + whatever snippet the feed gave."""
    title = (title or "").strip()
    out_text, sources, notes = text, [], []
    have = real_chars(text, title)
    if have:
        sources.append("feed description (%d characters)" % have)
    # 2. same story elsewhere (only when our own copy is thin)
    if have < SEEK_BETTER and title:
        m = cross_feed_summary(title, link, have, pool)
        if m:
            out_text = (out_text + " " + m["summary"]).strip()
            have = real_chars(out_text, title)
            sources.append("summary from %s (title match %.0f%%)" % (m["source"], m["similarity"] * 100))
    # 3 and 4. the article itself
    body, body_chars = False, 0
    if full_text and link:
        fa = feeds.fetch_article(link)
        if fa["ok"]:
            out_text = (out_text + "\n\n" + fa["text"]).strip()
            have = real_chars(out_text, title)
            body, body_chars = True, len(fa["text"])
            sources.append("article body (%d characters)" % len(fa["text"]))
        else:
            notes.append("Full article not used (%s)." % fa["reason"])
            meta = fa.get("meta") or ""
            if have < SEEK_BETTER and len(meta) >= 60 and meta.lower()[:60] not in out_text.lower():
                out_text = (out_text + " " + meta).strip()
                have = real_chars(out_text, title)
                sources.append("page meta description")
    quality = "article" if body else "description" if have >= MIN_DESCRIPTION else "headline_only"
    if quality == "headline_only":
        notes.append("Only the headline was available, so this analysis has low confidence.")
    return {"text": out_text, "quality": quality, "sources": sources, "note": " ".join(notes) or None,
            "article_chars": body_chars}
