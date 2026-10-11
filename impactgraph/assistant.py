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

Nothing here changes the graph. A question is never ingested as an article.
"""
from __future__ import annotations

import re

from . import extract as ex
from . import cards as cardlib, kb, llm
from .cards import label as _label

MAX_CARDS = 9
MAX_CARD_CHARS = 900
FOLLOW_UP = re.compile(r"^\s*(and|also|what about|how about|then)\b|\b(it|its|they|them|their|those|these|that one|the same)\b", re.I)
CITE = re.compile(r"\[([a-z]:[^\]\s]+)\]")


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
    if len(entities) == 1:                                # one entity: what it drives, and what drives it
        n = entities[0]
        for p in cardlib.find_paths(kg, n, None, 3):
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
    "6) Answer in 3-6 plain sentences."
)


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


def answer(kg, version, question, history=(), use_llm=True):
    question = (question or "").strip()
    if not question:
        return {"error": "empty question"}
    ents = find_entities(question, history)
    g = kg.g
    base = {"graph_version": version, "entities": [{"id": n, "label": _label(g, n), "tier": g.nodes[n].get("tier")} for n in ents]}
    if not ents:
        return dict(base, answer="I could not find any entity from the graph in that question, so I have nothing to ground an "
                                 "answer in. Try naming a commodity, indicator, sector, company or index.",
                    grounded=False, mode="none", sources=[], suggestions=_suggestions(kg))
    cards = build_cards(kg, ents)
    by_id = {c["id"]: c for c in cards}
    text, mode, note = "", "cards", None
    if use_llm and llm.available():
        body = "Graph version %s.\n\nQuestion: %s\n\nCards:\n%s" % (
            version.get("version"), question, "\n\n".join("[%s] %s\n%s" % (c["id"], c["title"], c["text"][:MAX_CARD_CHARS]) for c in cards))
        out = llm._chat(SYSTEM, body, max_tokens=900)
        if out:
            cited = [c for c in CITE.findall(out) if c in by_id]
            if cited:
                text = CITE.sub(lambda m: m.group(0) if m.group(1) in by_id else "", out).strip()
                mode = "llm"
            else:
                note = "The language model's answer cited no card, so it was replaced by the graph's own facts."
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
    return dict(base, answer=text, grounded=bool(sources), mode=mode, sources=sources, note=note, cards_considered=len(cards))
