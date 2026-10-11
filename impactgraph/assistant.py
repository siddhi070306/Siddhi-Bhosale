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
from . import cards as cardlib, kb, llm, retrieval
from .cards import label as _label

MAX_CARDS = 9                 # graph cards
MAX_ANALYSIS_CARDS = 3        # saved-analysis cards, on top of the graph cards
MAX_CARD_CHARS = 900
MAX_ANALYSIS_CHARS = 1600
MAX_TOTAL_CARDS = 12          # entity cards plus the best keyword matches
ARTICLE_CHARS = 6000          # article text sent to the backup
FOLLOW_UP = re.compile(r"^\s*(and|also|what about|how about|then)\b|\b(it|its|they|them|their|those|these|that one|the same)\b", re.I)
CITE = re.compile(r"\[([a-z]:[^\]\s]+)\]")
NEWS = re.compile(r"\b(articles?|news|stor(?:y|ies)|headlines?|analys[ie]s|analysed|analyzed|reported|reports?|generated|"
                  r"generator|chats?)\b", re.I)
LATEST = re.compile(r"\b(last|latest|most recent|newest|this|current|just)\b", re.I)


def find_entities(question, history=(), kg=None):
    """Graph nodes named in the question, in order; falls back to the previous user turns if it names none. With the live graph
    (kg), every node is known, including entities learned from articles and assets users added, and typos are tolerated."""
    def nodes_in(text):
        out = []
        for m in ex.find_mentions(text):
            if m["node"] not in out and m["node"] in kb.NODES:
                out.append(m["node"])
        if kg is not None:
            for n in retrieval.resolve_entities(kg, text):
                if n not in out:
                    out.append(n)
        return out

    found = nodes_in(question)
    if not found and FOLLOW_UP.search(question):         # only a real follow-up borrows the previous turn's subject
        for turn in reversed([h for h in history if h.get("role") == "user"][-2:]):
            found = nodes_in(turn.get("text", ""))
            if found:
                break
    return found[:4]


def build_cards(kg, entities, directions=None):
    """directions: {node: +1/-1} for moves the question describes ("a rate cut"); chains from those nodes are told that way."""
    g = kg.g
    dirs = directions or {}
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
                    add(cardlib.path_card(kg, p, dirs.get(u, 1)))
            if not found and not g.has_edge(a, b) and not g.has_edge(b, a):
                add(cardlib.gap_card(kg, a, b))
                shared = cardlib.shared_drivers_card(kg, a, b)   # no effect either way, but what moves both?
                if shared:
                    add(shared)
    if len(entities) == 1:                                # one entity: what it drives (one chain per channel), and what drives it
        n = entities[0]
        for p in cardlib.find_paths(kg, n, None, 5, diverse=True):
            add(cardlib.path_card(kg, p, dirs.get(n, 1)))
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
    "8b) A card whose id starts with q: is the scenario the question describes (for example an interest-rate hike) run through the "
    "graph: answer the what-if from it, in the direction it states, and call it the graph's inference for a hypothetical. "
    "8c) A card whose id is i:question says how names in the question that the graph does not contain were mapped onto it. Then "
    "do NOT stop at 'the graph does not say': say in one short clause that the graph has no entry for that name itself and uses "
    "the mapped entity instead (for example: Tesla is not in the graph, so this uses Autos), then answer from the mapped entity's "
    "cards: the q: scenario card if there is one (what the graph infers if it moves that way), otherwise what drives the mapped "
    "entity and what it affects. "
    "9) A card whose id is o:graph describes the whole graph (sizes, strongest and weakest links, data checks); use it for "
    "questions about the graph as a whole. "
    "10) If the request names a specific story, answer about that story first. "
    "11) Answer in 3-6 plain sentences."
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


def _fallback(question, cards, entities, g, article=None):
    """An answer from the graph's own facts (and the article's best-matching sentences), with no language model."""
    lines = []
    if article:                                     # the story the question is about comes first
        cards = sorted(cards, key=lambda c: c["id"] != "a:%s" % article[0]["id"])
    if cards:
        lines.append("Here is what the graph holds (answered from the graph directly, without the language model):")
        for c in cards[:8]:
            lines.append("- %s [%s]" % (c["text"] if c["kind"] == "overview" else c["brief"], c["id"]))
    if article:
        rec, text = article
        sents = retrieval.article_sentences(text, question, k=2)
        if sents:
            lines.append('From the article "%s" [a:%s]:' % (rec["title"][:90], rec["id"]))
            lines += ['- "%s"' % s[:300] for s in sents]
    return "\n".join(lines)


def _suggestions(kg):
    g = kg.g
    pick = lambda tier, k: [d["label"] for n, d in g.nodes(data=True) if d.get("tier") == tier and d.get("origin") == "curated"][:k]
    return {"variables": pick("variable", 5), "sectors": pick("sector", 5), "assets": pick("asset", 5)}


ARTICLE_SYSTEM = (
    "You answer a question about ONE news article using only the article below (its headline, description and text) and the "
    "summary of the impact graph drawn from it. Rules: 1) Support every claim with a short exact quote from the article in double "
    "quotes. 2) If the article does not answer the question, say so plainly, then give what the article says that is closest. "
    "3) Say which statements the article reports and which are the graph's inference. 4) No advice, no price targets, no invented "
    "numbers. 5) Answer in 2-5 plain sentences."
)
GRAPH_WORDS = re.compile(r"(graph|links?|relationships?|entit(?:y|ies)|nodes?|edges?|sectors?|tiers?)", re.I)
NOT_ANSWERED = re.compile(r"graph does not say|cards do not|do(?:es)? not (?:say|contain|mention|cover|provide|include|answer)|"
                          r"no information|cannot (?:answer|determine|tell)|not enough information", re.I)
QUOTE = re.compile(r"\"([^\"]{8,})\"|“([^”]{8,})”")


def _quotes_ok(answer_text, article):
    norm = lambda s: " ".join(re.sub(r"[^a-z0-9]+", " ", s.lower()).split())
    art = norm(article)
    qs = [a or b for a, b in QUOTE.findall(answer_text)]
    return bool(qs) and any(norm(q) and norm(q) in art for q in qs)


def _article_answer(question, rec, text, history):
    """The backup: the language model answers from the specific article the question is about."""
    prev = [h for h in history if h.get("role") == "user"][-2:]
    body = "Headline: %s\nAnalysed: %s\nImpact graph summary: %s\n\nArticle text:\n%s\n\n%sQuestion: %s" % (
        rec["title"], rec["t"][:16], rec.get("summary") or "none", text[:ARTICLE_CHARS] or "(only the headline is available)",
        ("Earlier questions: %s\n" % " | ".join(h.get("text", "")[:160] for h in prev)) if prev else "", question)
    out = llm._chat(ARTICLE_SYSTEM, body, max_tokens=700)
    if out and text and not _quotes_ok(out, text):
        retry = llm._chat(ARTICLE_SYSTEM, body + "\n\nYour previous answer, below, quoted nothing that appears in the article. "
                          "Rewrite it, quoting the article's exact words in double quotes.\n\nPrevious answer:\n" + out, max_tokens=700)
        if retry:
            out = retry
    return out, bool(out and text and _quotes_ok(out, text))


def _story_record(analysis_id, story):
    """A minimal analysis record for an open story the library does not hold (its text came with the question)."""
    if not isinstance(story, dict) or not (story.get("text") or story.get("title")):
        return None
    clip = lambda s, n: re.sub(r"\s+", " ", str(s or "")).strip()[:n]
    return {"id": re.sub(r"[^0-9a-zA-Z_-]", "", str(analysis_id or "open"))[:40] or "open", "title": clip(story.get("title"), 200) or "The open story",
            "t": "", "events": [], "paths": [], "nodes": [], "assets": [], "sectors": [], "comparison": [], "hypotheses": [],
            "excerpt": str(story.get("text") or "")[:ARTICLE_CHARS], "summary": clip(story.get("summary"), 700), "kb_version": None}


def answer(kg, version, question, history=(), use_llm=True, library=None, analysis_id=None, story=None):
    """Answer from, in order: the graph's cards (language model, citations checked) -> the specific article the question is
    about (language model, quotes checked) -> the graph's own facts and the article's best sentences (no language model)."""
    question = (question or "").strip()
    if not question:
        return {"error": "empty question"}
    history = list(history or [])
    g = kg.g
    focus, how = retrieval.pick_analysis(library, question, analysis_id)
    if analysis_id and (focus is None or (how != "open" and not (library and library.get(analysis_id)))):
        rec = _story_record(analysis_id, story)     # the open story is not in the library: use the text the app sent
        if rec and (focus is None or how != "matched"):
            focus, how = rec, "open"
    ents = find_entities(question, history, kg)
    if not ents and focus:                          # "explain this graph": the open story's own starting points
        ents = [n for n in [e.get("trigger") for e in focus.get("events") or []] + list(focus.get("nodes") or []) if n in g]
        ents = list(dict.fromkeys(ents))[:2]
    base = {"graph_version": version, "entities": [{"id": n, "label": _label(g, n), "tier": g.nodes[n].get("tier")} for n in ents],
            "focus": {"id": focus["id"], "title": focus["title"], "how": how} if focus else None}

    # ---- retrieve: the scenario the question describes, entity cards, keyword search over every card, the overview, the analyses
    scenario = retrieval.detect_scenario(kg, question)
    if not scenario and FOLLOW_UP.search(question):      # "and if it falls?" refers to the previous question's subject
        words = retrieval._norm(question).split()
        ups = sum(1 for w in words if w in retrieval.UP_WORDS)
        downs = sum(1 for w in words if w in retrieval.DOWN_WORDS)
        if ups != downs and ents:                        # the subject from before, the direction from this question
            scenario = [{"node": ents[0], "direction": 1 if ups > downs else -1, "phrase": question[:60]}]
    # names and terms the graph does not contain ("Elon Musk", "Taylor Swift's tour"): the language model maps each to the closest
    # graph node, from general knowledge, with its reason; the answer shows this reading and labels it an interpretation
    links = []
    if use_llm and llm.available():
        unk = retrieval.unknown_terms(kg, question)
        if unk["names"]:
            links = llm.link_question(question, [(n, d["label"], d["type"]) for n, d in g.nodes(data=True)]) or []
    for l in links:
        if l["node"] not in ents:
            ents.append(l["node"])
        if l["direction"] and l["node"] not in [s_["node"] for s_ in scenario]:
            scenario.append({"node": l["node"], "direction": l["direction"], "phrase": l["term"]})
    for s_ in scenario:
        if s_["node"] not in ents:
            ents.append(s_["node"])
    ents = ents[:4]
    base["entities"] = [{"id": n, "label": _label(g, n), "tier": g.nodes[n].get("tier")} for n in ents]
    base["scenario"] = [dict(s_, label=_label(g, s_["node"])) for s_ in scenario]
    base["interpretation"] = [dict(l, label=_label(g, l["node"])) for l in links]
    reading = [{"id": "i:question", "kind": "interpretation", "tiers": [], "refs": [l["node"] for l in links],
                "title": "How the question was read",
                "text": "How the question was read (by the language model from general knowledge: an interpretation, not a fact in "
                        "the graph): " + "; ".join('"%s" -> %s (%s)' % (l["term"], _label(g, l["node"]), l["why"]) for l in links) + ".",
                "brief": "Read as: " + "; ".join('"%s" -> %s' % (l["term"], _label(g, l["node"])) for l in links)}] if links else []
    cards = reading + ([retrieval.scenario_card(kg, scenario)] if scenario else []) + build_cards(kg, ents, {s_["node"]: s_["direction"] for s_ in scenario})
    have = {c["id"] for c in cards}
    for c in retrieval.rank_cards(kg, question, limit=MAX_TOTAL_CARDS):
        if len(cards) >= MAX_TOTAL_CARDS:
            break
        if c["id"] not in have:
            cards.append(c)
            have.add(c["id"])
    # "how many jobs will this add?" about an open story is not a question about the whole graph
    is_global = bool(retrieval.GLOBAL.search(question)) and (not focus or bool(GRAPH_WORDS.search(question)))
    if is_global and not ents:                      # a question about the graph as a whole: the overview answers it first
        cards.insert(0, retrieval.overview_card(kg))
    elif is_global or (not ents and not focus):
        cards.append(retrieval.overview_card(kg))
    saved = []
    if focus:
        saved.append(cardlib.analysis_card(focus, version))
    for r in find_analyses(library, question, ents):
        if not focus or r["id"] != focus["id"]:
            saved.append(cardlib.analysis_card(r, version))
    saved = saved[:MAX_ANALYSIS_CARDS]
    graph_hits = bool(ents) or any(c["kind"] != "overview" for c in cards)
    if not graph_hits and not saved and not is_global:
        return dict(base, answer="That question does not name anything in the knowledge graph, and no analysed story matches it. "
                                 "Try naming a commodity, indicator, sector, company or index, or open a news graph and ask about it.",
                    grounded=False, mode="none", sources=[], suggestions=_suggestions(kg), analyses_considered=0, note=None)
    cards = cards + saved
    by_id = {c["id"]: c for c in cards}
    art_text = retrieval.article_text(library, focus) if focus else ""
    text, mode, note = "", "cards", None

    # ---- 1. the graph's cards, through the language model
    llm_ok = use_llm and llm.available()
    if llm_ok:
        about = (' The question is about the story "%s" (card a:%s).' % (focus["title"], focus["id"])) if focus else (
            " Article analyses (a: cards) are listed newest first." if saved else "")
        body = "Graph version %s.%s\n\nQuestion: %s\n\nCards:\n%s" % (
            version.get("version"), about, question, "\n\n".join("[%s] %s\n%s" % (
                c["id"], c["title"], c["text"][:MAX_ANALYSIS_CHARS if c["kind"] in ("analysis", "overview") else MAX_CARD_CHARS])
                for c in cards))
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

    # ---- 2. the backup: the specific article the question is about, through the language model
    if focus and llm_ok and (not text or NOT_ANSWERED.search(text)):
        out, verified = _article_answer(question, focus, art_text, history)
        if out:
            text = re.sub(r"\s*【[^】]*】", "", out).strip()     # some models add 【source】 marks
            mode = "article"
            note = ("The graph's cards did not answer this, so the answer comes from the article itself" +
                    ("" if verified else "; its quotes could not all be matched to the article text, so check them") + ".")

    # ---- 3. no language model (or every call failed): the graph's own facts and the article's best sentences
    if not text:
        text = _fallback(question, cards, ents, g, (focus, art_text) if focus else None)
        mode = "cards"
    cited_ids = []
    for cid in CITE.findall(text) + (["a:%s" % focus["id"]] if focus and mode == "article" else []):
        if cid in by_id and cid not in cited_ids:
            cited_ids.append(cid)
    sources = [{"id": c["id"], "kind": c["kind"], "title": c["title"], "text": c["text"]} for c in cards if c["id"] in cited_ids]
    return dict(base, answer=text, grounded=bool(sources), mode=mode, sources=sources, note=note, cards_considered=len(cards),
                analyses_considered=len(saved))
