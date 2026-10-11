"""Question answering over the knowledge graph (read only).

How an answer is produced
  1. Find the graph entities in the question (the same alias matcher the article extractor uses; if the question names none,
     the previous question is searched, so "and what about Delta?" works).
  2. Retrieve *cards* from the graph, tier-aware and deterministic (no embeddings): a card per entity, per link between
     entities, per path between them (or the strongest paths out of one), and the sector-to-members view. A card is plain text
     plus a stable id, and every fact in it comes straight from the graph: sign, strength, lag, mechanism, the basis of the
     link (analyst prior, article-observed, LLM-proposed, data-validated, user-added), the data check, and any evidence quote.
  3. Ask the LLM to answer from the cards only, citing card ids. Citations are verified; an answer with no valid citation is
     replaced by a plain answer built from the cards.
  4. Return the answer, the cards it cites, and the graph version it was answered from.

Saved analyses. Every graph the Knowledge Graph Generator produced is kept in the analysis library (library.py). A question that
names an entity also retrieves the most recent analyses that touched it, and a question about the news ("what did the last article
say?") retrieves the latest ones, as analysis cards (a:<id>). An analysis card keeps apart what the article REPORTED, what the model
INFERRED (at a stated graph version) and the model's HYPOTHESES, and the answer must say which is which.

For a one-entity question the paths retrieved are diversified: one per first link (see cards.find_paths), so "what happens if oil
rises?" covers producers, inflation and rates, airlines, not three variants of the strongest branch.

Nothing here changes the graph. A question is never ingested as an article.
"""
from __future__ import annotations

import re

from . import extract as ex
from . import cards as cardlib, kb, llm
from .cards import label as _label

MAX_CARDS = 9                 # graph cards
MAX_ANALYSIS_CARDS = 3        # saved-analysis cards, on top of the graph cards
MAX_CARD_CHARS = 900
MAX_ANALYSIS_CHARS = 1600
FOLLOW_UP = re.compile(r"^\s*(and|also|what about|how about|then)\b|\b(it|its|they|them|their|those|these|that one|the same)\b", re.I)
CITE = re.compile(r"\[([a-z]:[^\]\s]+)\]")
NEWS = re.compile(r"\b(articles?|news|stor(?:y|ies)|headlines?|analys[ie]s|analysed|analyzed|reported|reports?|generated|"
                  r"generator|chats?)\b", re.I)
LATEST = re.compile(r"\b(last|latest|most recent|newest|this|current|just)\b", re.I)


def find_entities(question, history=()):
    """Graph nodes named in the question, in order; falls back to the previous user turns if it names none."""
    def nodes_in(text):
        out = []
        for m in ex.find_mentions(text):
            if m["node"] not in out and m["node"] in kb.NODES:
                out.append(m["node"])
        return out

    found = nodes_in(question)
    if not found and FOLLOW_UP.search(question):         # only a real follow-up borrows the previous turn's subject
        for turn in reversed([h for h in history if h.get("role") == "user"][-2:]):
            found = nodes_in(turn.get("text", ""))
            if found:
                break
    return found[:4]


def build_cards(kg, entities):
    g = kg.g
    cards, ids = [], set()

    def add(c):
        if c["id"] not in ids and len(cards) < MAX_CARDS:
            ids.add(c["id"])
            cards.append(c)

    for n in entities:
        add(cardlib.node_card(kg, n))
    for i, a in enumerate(entities):                      # direct links and paths between the named entities
        for b in entities[i + 1:]:
            for u, v in ((a, b), (b, a)):
                if g.has_edge(u, v):
                    add(cardlib.link_card(kg, u, v))
            found = False
            for u, v in ((a, b), (b, a)):
                for p in cardlib.find_paths(kg, u, v, 2):
                    found = True
                    add(cardlib.path_card(kg, p))
            if not found and not g.has_edge(a, b) and not g.has_edge(b, a):
                add(cardlib.gap_card(kg, a, b))
                shared = cardlib.shared_drivers_card(kg, a, b)   # no effect either way, but what moves both?
                if shared:
                    add(shared)
    if len(entities) == 1:                                # one entity: what it drives (one chain per channel), and what drives it
        n = entities[0]
        for p in cardlib.find_paths(kg, n, None, 5, diverse=True):
            add(cardlib.path_card(kg, p))
        for u, v in sorted(g.in_edges(n), key=lambda uv: -kg.eff_strength(*uv))[:2]:
            add(cardlib.link_card(kg, u, v))
    return cards


SYSTEM = (
    "You answer questions about a financial knowledge graph using ONLY the numbered cards provided. Rules: "
    "1) Use only facts in the cards; if the cards do not answer the question, say that the graph does not say. "
    "2) Cite every factual sentence with the card id in square brackets exactly as given, for example [l:crude_oil>airlines]. "
    "3) Say what kind of basis supports a claim: an analyst prior, something observed in an article, something an LLM proposed, "
    "or something market data supported; never present a prior as an observation. "
    "4) Scores and strengths are plausibility, not probabilities, elasticities or price moves; never state a percentage price move. "
    "5) Use hedged language (may, plausibly). No advice and no price targets. "
    "6) Cards whose id starts with a: are records of earlier analyses of specific articles. What they list as REPORTED was stated "
    "by that article (say so, with its date); what they list as INFERRED was the model's inference at that time; HYPOTHESES are "
    "hypotheses. Never present an inference or a hypothesis as something an article reported, and prefer the other cards for how "
    "the graph works now. "
    "7) A card whose id starts with d: lists drivers shared by two entities: say that they can move together (or opposite) "
    "because of these common causes, and never call it an effect of one on the other. "
    "8) Never name an entity, fund or market that does not appear in the cards. "
    "9) Answer in 3-6 plain sentences."
)


def find_analyses(library, question, entities, limit=MAX_ANALYSIS_CARDS):
    """Saved analyses relevant to the question, newest first: those touching the named entities and, for a question about the
    news, the latest ones. "The last / latest / this article" means exactly the newest one (matching the named entities, if any)."""
    if library is None or not library.records:
        return []
    news = NEWS.search(question)
    out = library.mentioning(entities, limit) if entities else []
    if news and LATEST.search(question):
        return out[:1] if out else library.latest(1)
    if news and len(out) < limit:
        out += [r for r in library.latest(limit) if r not in out][:limit - len(out)]
    return sorted(out, key=lambda r: r.get("t") or "", reverse=True)


def _fallback(question, cards, entities, g):
    if not cards:
        return ""
    lines = ["Here is what the graph holds (answered from the graph directly, without the language model):"]
    for c in cards:
        lines.append("- %s [%s]" % (c["brief"], c["id"]))
    return "\n".join(lines)


def _suggestions(kg):
    g = kg.g
    pick = lambda tier, k: [d["label"] for n, d in g.nodes(data=True) if d.get("tier") == tier and d.get("origin") == "curated"][:k]
    return {"variables": pick("variable", 5), "sectors": pick("sector", 5), "assets": pick("asset", 5)}


def answer(kg, version, question, history=(), use_llm=True, library=None):
    question = (question or "").strip()
    if not question:
        return {"error": "empty question"}
    ents = find_entities(question, history)
    g = kg.g
    base = {"graph_version": version, "entities": [{"id": n, "label": _label(g, n), "tier": g.nodes[n].get("tier")} for n in ents]}
    saved = [cardlib.analysis_card(r, version) for r in find_analyses(library, question, ents)]
    if not ents and not saved:
        return dict(base, answer="I could not find any entity from the graph in that question, so I have nothing to ground an "
                                 "answer in. Try naming a commodity, indicator, sector, company or index, or ask about an "
                                 "article you analysed.",
                    grounded=False, mode="none", sources=[], suggestions=_suggestions(kg), analyses_considered=0)
    cards = build_cards(kg, ents) + saved
    by_id = {c["id"]: c for c in cards}
    text, mode, note = "", "cards", None
    if use_llm and llm.available():
        body = "Graph version %s.%s\n\nQuestion: %s\n\nCards:\n%s" % (
            version.get("version"), " Article analyses (a: cards) are listed newest first." if saved else "",
            question, "\n\n".join("[%s] %s\n%s" % (
                c["id"], c["title"], c["text"][:MAX_ANALYSIS_CHARS if c["kind"] == "analysis" else MAX_CARD_CHARS]) for c in cards))
        out = llm._chat(SYSTEM, body, max_tokens=900)
        if out and not any(c in by_id for c in CITE.findall(out)):
            # one retry: the model is shown its own uncited answer and asked to cite the cards (an uncited answer is never shown)
            retry = llm._chat(SYSTEM, body + "\n\nYour previous answer, below, cited no card id. Rewrite it using only facts from the "
                                      "cards, and end every factual sentence with the id of the card that supports it in square "
                                      "brackets, exactly as given (for example [%s]).\n\nPrevious answer:\n%s" % (cards[0]["id"], out),
                              max_tokens=900)
            out = retry or out
        if out:
            cited = [c for c in CITE.findall(out) if c in by_id]
            if cited:
                text = CITE.sub(lambda m: m.group(0) if m.group(1) in by_id else "", out).strip()
                mode = "llm"
            else:
                note = "The language model's answer cited no card, even when asked again, so it was replaced by the graph's own facts."
        else:
            note = "The language model was unavailable (%s), so this is answered from the graph directly." % (llm.last_error() or "no reason given")
    elif use_llm:
        note = "No language model is configured, so this is answered from the graph directly."
    if not text:
        text = _fallback(question, cards, ents, g)
    cited_ids = []
    for cid in CITE.findall(text):
        if cid in by_id and cid not in cited_ids:
            cited_ids.append(cid)
    sources = [{"id": c["id"], "kind": c["kind"], "title": c["title"], "text": c["text"]} for c in cards if c["id"] in cited_ids]
    return dict(base, answer=text, grounded=bool(sources), mode=mode, sources=sources, note=note, cards_considered=len(cards),
                analyses_considered=len(saved))
