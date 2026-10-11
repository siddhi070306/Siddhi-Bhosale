"""Retrieval for the KG assistant: find what a question is about, in the WHOLE live graph and in the right article.

  resolve_entities  every node of the live graph (curated, learned from articles, user-added) by its label, id and aliases,
                    with typo tolerance ("infosis" finds Infosys)
  rank_cards        keyword search over a text card for every node, link, sector and tier, so a question that names no
                    entity ("which link is the strongest?") still retrieves the cards that answer it
  overview_card     the graph as a whole: size per tier, sectors, strongest links, links the data contradicts, learned entities
  pick_analysis     which analysed news story the question is about: the graph open in the app, else one whose headline the
                    question echoes, else (for "the latest article") the newest
  article_sentences the sentences of that article that best match the question (an answer without any language model)

Deterministic and read only: no embeddings, no network, nothing written to the graph.
"""
from __future__ import annotations

import difflib
import math
import re

from . import cards as cardlib, hierarchy, kb

STOP = set("""a an the and or but if of to in on at by for with from into onto about as is are was were be been being do does did
done has have had having it its this that these those there here what which who whom whose when where why how will would
can could should may might must shall than then so such not no yes any all each every some more most less least very much
many few i me my we our you your he she they them their his her him us also just only over under up down out off again
between among per via vs versus tell show give explain please describe list say says said know known graph does doing
happen happens happened affect affects affected effect effects impact impacts impacted link links relationship relationships
entity entities strongest weakest strong weak biggest largest""".split())
GLOBAL = re.compile(r"\b(strongest|weakest|most|least|biggest|largest|all|list|how many|overall|entire|whole|summary|summari[sz]e|"
                    r"overview|contradict\w*|validated|learned|learnt|new compan\w*|every|which|top)\b", re.I)


def _norm(s):
    return " ".join(re.sub(r"[^a-z0-9&]+", " ", (s or "").lower()).split())


def _stem(t):
    for suf in ("ing", "ies", "es", "ed", "s"):
        if len(t) > len(suf) + 3 and t.endswith(suf):
            return t[: -len(suf)] + ("y" if suf == "ies" else "")
    return t


def tokens(s):
    return [_stem(t) for t in _norm(s).split() if len(t) > 2 and t not in STOP]


# ---- entities --------------------------------------------------------------------------------------------------------
CASE_ONLY = {"JETS"}          # an alias that is also a common word: matched only when written exactly like this


def node_names(kg, text=""):
    """(normalised name, node id) for every node in the live graph: label, id and the curated aliases."""
    out = []
    for n, d in kg.g.nodes(data=True):
        names = {d.get("label") or "", n.replace("_", " ")}
        if n.startswith("ent_") or (n.upper() in CASE_ONLY and n.upper() not in text):
            names.discard(n.replace("_", " "))
        for a in (kb.NODES.get(n) or {}).get("aliases", []):
            if a.lstrip("!") in CASE_ONLY and a.lstrip("!") not in text:
                continue
            names.add(a.lstrip("!"))
        names.update(CONCEPT_ALIASES.get(n, []))
        for nm in names:
            nm = _norm(nm)
            if len(nm) >= 2:
                out.append((nm, n))
    out.sort(key=lambda x: -len(x[0]))
    return out


def resolve_entities(kg, text, limit=4):
    """Graph nodes named in the text, in order of appearance. Exact names first (longest wins), then near misses for words the
    exact pass did not use (typos): a short name (3-4 letters) only with one extra letter at the end ("oill"), a longer one by
    spelling similarity ("infosis", "intrest hike"). Event words count too ("recession", "war", "rate cut"; see CONCEPT_ALIASES)."""
    out = []
    for _, _, n, _ in _matches(kg, text):
        if n not in out:
            out.append(n)
    return out[:limit]


# ---- whole-graph overview ----------------------------------------------------------------------------------------------
def overview_card(kg):
    g = kg.g
    lab = lambda n: g.nodes[n]["label"]
    tiers = {}
    for n in g.nodes:
        t = cardlib._tier(g, n) or "other"
        tiers[t] = tiers.get(t, 0) + 1
    sectors = sorted(lab(n) for n in g.nodes if g.nodes[n]["type"] == "sector")
    causal = lambda uv: hierarchy.rel(g, *uv) not in ("member_of", "tracks", "weight_in")
    edges = sorted((uv for uv in g.edges if causal(uv)), key=lambda uv: (-kg.eff_strength(*uv), uv))
    strongest = ["%s → %s (%s%.2f)" % (lab(u), lab(v), "+" if g[u][v]["sign"] > 0 else "-", kg.eff_strength(u, v)) for u, v in edges[:6]]
    weakest = ["%s → %s (%.2f)" % (lab(u), lab(v), kg.eff_strength(u, v)) for u, v in edges[-3:]]
    contra = ["%s → %s" % (lab(u), lab(v)) for u, v in g.edges if (g[u][v].get("validation") or {}).get("verdict") == "contradicted"]
    supported = sum(1 for u, v in g.edges if (g[u][v].get("validation") or {}).get("verdict") == "supported")
    learned = sorted(lab(n) for n, d in g.nodes(data=True) if d.get("origin") in ("learned", "user") or n.startswith("ent_"))
    hubs = sorted(g.nodes, key=lambda n: (-g.degree(n), n))[:5]
    text = ("The knowledge graph has %d entities and %d links. Entities per tier: %s. Sectors: %s. Strongest cause-and-effect links: %s. "
            "Weakest cause-and-effect links: %s. Links checked against market data: %d supported, %d contradicted%s. Most connected entities: %s. %s") % (
        g.number_of_nodes(), g.number_of_edges(), ", ".join("%s %d" % (t, c) for t, c in sorted(tiers.items())),
        ", ".join(sectors), "; ".join(strongest), "; ".join(weakest), supported, len(contra),
        (" (%s)" % "; ".join(contra[:6])) if contra else "", ", ".join("%s (%d links)" % (lab(n), g.degree(n)) for n in hubs),
        ("Entities learned from articles or added by users: %s." % ", ".join(learned[:12])) if learned else
        "No entities have been learned from articles yet.")
    return {"id": "o:graph", "kind": "overview", "tiers": [], "refs": [], "title": "The whole knowledge graph", "text": text,
            "brief": "%d entities, %d links; strongest: %s" % (g.number_of_nodes(), g.number_of_edges(), "; ".join(strongest[:3]))}


# ---- keyword search over every card ------------------------------------------------------------------------------------
def rank_cards(kg, question, limit=6, pool=None):
    """Cards ranked by how many of the question's words (typos tolerated) they contain, weighted by rarity."""
    pool = pool if pool is not None else cardlib.all_cards(kg)
    docs = [set(tokens(c["title"] + " " + c["text"])) for c in pool]
    titles = [set(tokens(c["title"])) for c in pool]
    vocab = set().union(*docs) if docs else set()
    df = {}
    for d in docs:
        for t in d:
            df[t] = df.get(t, 0) + 1
    qs = []
    for t in dict.fromkeys(tokens(question)):
        if t in vocab:
            qs.append(t)
        elif len(t) >= 5:
            close = difflib.get_close_matches(t, vocab, n=1, cutoff=0.84)
            if close:
                qs.append(close[0])
    if not qs:
        return []
    n = len(pool)
    scored = []
    for c, d, ti in zip(pool, docs, titles):
        s = sum(math.log(1 + n / df[t]) * (2.0 if t in ti else 1.0) for t in qs if t in d)
        if s > 0:
            scored.append((s, c))
    scored.sort(key=lambda x: (-x[0], x[1]["id"]))
    return [c for _, c in scored[:limit]]


# ---- which analysed story --------------------------------------------------------------------------------------------
NEWS = re.compile(r"\b(articles?|news|stor(?:y|ies)|headlines?|analys[ie]s|analysed|analyzed|reported|reports?|this graph|"
                  r"the graph you drew|generated|generator|chats?)\b", re.I)
LATEST = re.compile(r"\b(last|latest|most recent|newest|this|current|just|that)\b", re.I)


def pick_analysis(library, question, analysis_id=None):
    """-> (record, how) with how in "open" | "matched" | "latest", or (None, None)."""
    if library is None or not library.records:
        return None, None
    qt = set(tokens(question))

    def overlap(rec):
        return len(qt & set(tokens(rec.get("title") or "")))

    best = max(library.records, key=lambda r: (overlap(r), r.get("t") or ""))
    open_rec = library.get(analysis_id) if analysis_id else None
    if open_rec:
        if best is not open_rec and overlap(best) >= 3 and overlap(best) > overlap(open_rec) + 1:
            return best, "matched"                     # the question clearly names another story's headline
        return open_rec, "open"
    if overlap(best) >= 2 and overlap(best) >= 0.4 * max(1, len(set(tokens(best.get("title") or "")))):
        return best, "matched"
    if NEWS.search(question) and LATEST.search(question):
        return library.latest(1)[0], "latest"
    return None, None


def article_text(library, rec):
    full = library.full(rec["id"]) if library is not None else None
    return ((full or {}).get("text") or rec.get("excerpt") or "").strip()


def article_sentences(text, question, k=2):
    """The k sentences of the article that share the most question words (rarer words count more)."""
    sents = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", text or "") if len(s.strip()) > 25]
    qt = set(tokens(question))
    if not sents or not qt:
        return sents[:1]
    scored = sorted(((len(qt & set(tokens(s))), -i, s) for i, s in enumerate(sents)), reverse=True)
    top = [s for sc, _, s in scored[:k] if sc > 0]
    return top or sents[:1]


# ---- events and concepts in a question ("an interest hike", "a recession", "the rupee falls") -------------------------
# words for an economic event that the graph models as a node, beyond the curated aliases
CONCEPT_ALIASES = {
    "rate_exp": ["interest", "interest hike", "interest hikes", "rate hike", "rate hikes", "rate cut", "rate cuts", "rate rise",
                 "hike in rates", "cut in rates", "monetary tightening", "monetary easing"],
    "gdp_growth": ["recession", "slowdown", "downturn", "contraction", "economic boom", "the economy", "economy"],
    "geopolitical_tension": ["war", "wars", "conflict", "invasion", "sanctions", "military strike", "ceasefire", "peace deal"],
    "risk_aversion": ["market crash", "stock market crash", "sell-off", "selloff", "panic", "turmoil", "risk-on"],
    "inflation_exp": ["deflation", "disinflation", "stagflation", "price rise", "price rises"],
    "usd": ["strong dollar", "weak dollar"],
    "fed": ["jerome powell", "fed chair", "fed chairman"],
    "rbi": ["sanjay malhotra", "shaktikanta das", "rbi governor"],
    "ecb": ["christine lagarde"],
    "reliance": ["mukesh ambani", "ambani", "jio"],
    "tatamotors": ["jaguar land rover", "jlr", "n chandrasekaran"],
    "infosys": ["nandan nilekani", "narayana murthy"],
    "hdfcbank": ["sashidhar jagdishan"],
    "jpm": ["jamie dimon"],
    "opec_supply_cut": ["saudi aramco", "abdulaziz bin salman"],
}
# a word that carries its own direction
FIXED_DIR = {"recession": -1, "slowdown": -1, "downturn": -1, "contraction": -1, "economic boom": 1,
             "war": 1, "wars": 1, "conflict": 1, "invasion": 1, "sanctions": 1, "military strike": 1, "ceasefire": -1, "peace deal": -1,
             "market crash": 1, "stock market crash": 1, "crash": 1, "sell off": 1, "selloff": 1, "panic": 1, "turmoil": 1, "risk on": -1,
             "deflation": -1, "disinflation": -1, "stagflation": 1, "price rise": 1, "price rises": 1,
             "interest hike": 1, "interest hikes": 1, "rate hike": 1, "rate hikes": 1, "rate rise": 1, "hike in rates": 1,
             "rate cut": -1, "rate cuts": -1, "cut in rates": -1, "monetary tightening": 1, "monetary easing": -1,
             "strong dollar": 1, "weak dollar": -1}
UP_WORDS = set("""hike hikes hiked hiking raise raises raised raising rise rises rising rose risen increase increases increased
higher high up surge surges surged spike spikes spiked jump jumps jumped soar soars soared climb climbs climbed tighten tightens
tightened tightening hawkish strong stronger strengthen strengthens strengthened rally rallies boom booms shock shocks gain gains
gained escalate escalates escalation""".split())
DOWN_WORDS = set("""cut cuts cutting lower lowers lowered low fall falls falling fell fallen drop drops dropped decline declines declined
decrease decreases decreased slump slumps slumped plunge plunges plunged crash crashes crashed ease eases eased easing dovish weak
weaker weaken weakens weakened tumble tumbles tumbled collapse collapses collapsed slide slides slid sink sinks sank down""".split())
INVERTED = {"rupee", "indian rupee"}       # the rupee falling is "USD/INR (rupee weakness)" rising


def _matches(kg, text):
    """(first word, number of words, node, name) for every entity matched in the text (see resolve_entities)."""
    q = _norm(text)
    if not q:
        return []
    words = q.split()
    used = [False] * len(words)
    found = []
    names = node_names(kg, text)
    for nm, n in names:                              # exact, on word boundaries, longest first, non-overlapping
        k = len(nm.split())
        for i in range(len(words) - k + 1):
            if not any(used[i:i + k]) and " ".join(words[i:i + k]) == nm:
                for j in range(i, i + k):
                    used[j] = True
                found.append((i, k, n, nm))
    have = {f[2] for f in found}
    for nm, n in names:                              # typo tolerance
        if n in have or len(nm.replace(" ", "")) < 3:
            continue
        k = len(nm.split())
        for i in range(len(words) - k + 1):
            win = words[i:i + k]
            if any(used[i:i + k]) or all(w in STOP for w in win):
                continue
            cand = " ".join(win)
            short = len(nm) <= 4
            ok = (cand.startswith(nm) and len(cand) - len(nm) <= 1) if short else (
                abs(len(cand) - len(nm)) <= 2 and difflib.SequenceMatcher(None, cand, nm).ratio() >= 0.84)
            if ok:
                for j in range(i, i + k):
                    used[j] = True
                found.append((i, k, n, nm))
                have.add(n)
                break
    found.sort()
    return found


def detect_scenario(kg, text):
    """The moves a question describes: [{node, direction, phrase}]. A direction comes from the event word itself ("recession",
    "rate cut") or from a direction word next to the entity ("the rupee falls", "if oil prices surge", "a strong dollar");
    an entity with no direction word is not a scenario."""
    words = _norm(text).split()
    out = {}
    for i, k, n, nm in _matches(kg, text):
        d = FIXED_DIR.get(nm)
        if d is None:
            near = words[max(0, i - 2):i] + words[i + k:i + k + 3]
            ups = sum(1 for w in near if w in UP_WORDS)
            downs = sum(1 for w in near if w in DOWN_WORDS)
            if ups == downs:
                continue
            d = 1 if ups > downs else -1
            if nm in INVERTED:
                d = -d
        if n not in out:
            out[n] = {"node": n, "direction": d, "phrase": " ".join(words[max(0, i - 2):i + k + 2])}
    # a central bank that hikes or cuts moves rate expectations the same way
    for n in list(out):
        if kg.g.nodes[n]["type"] == "institution" and kg.g.has_edge(n, "rate_exp") and "rate_exp" not in out:
            out["rate_exp"] = {"node": "rate_exp", "direction": out[n]["direction"], "phrase": out[n]["phrase"]}
    return list(out.values())


def scenario_card(kg, scenario, limit=8):
    """What the graph infers for the moves a question describes: the most affected sectors and companies, each with its best
    chain. A hypothetical, never a forecast."""
    from . import propagate as pg
    g = kg.g
    lab = lambda n: g.nodes[n]["label"]

    def move(n, d):
        if g.nodes[n]["type"] == "institution":
            return "a %s move by %s" % ("hawkish" if d > 0 else "dovish", lab(n))
        return "%s %s" % (lab(n), "rising" if d > 0 else "falling")

    # a central bank acts through rate expectations: run it alone rather than counting that channel twice
    via_bank = any(g.nodes[s["node"]]["type"] == "institution" and g.has_edge(s["node"], "rate_exp") for s in scenario)
    sources = [{"id": "q%d" % i, "trigger": s["node"], "direction": s["direction"], "intensity": 1.0, "anchor": False}
               for i, s in enumerate(scenario) if not (via_bank and s["node"] == "rate_exp")]
    paths = pg.propagate(kg, sources)
    agg = pg.aggregate(paths, exclude={s["node"] for s in scenario})
    rows = sorted((r for r in agg.values() if g.nodes[r["node"]].get("tier") in ("sector", "asset", "variable")),
                  key=lambda r: -r["confidence"])[:limit]
    head = " and ".join(move(s["node"], s["direction"]) for s in scenario)
    if not rows:
        text = "Scenario from the question: %s. The graph holds no chain from it to a sector or company." % head
    else:
        text = ("Scenario from the question: %s. What the graph infers (plausibility, not a forecast or a price move): %s. "
                "This is the graph's inference for a hypothetical; nothing here was reported." % (head, "; ".join(
                    "%s %s (%s, %.2f%s, via %s)" % (lab(r["node"]), "↑" if r["direction"] > 0 else "↓", r["confidence_label"],
                                                    r["confidence"], ", mixed signals" if r["mixed"] else "",
                                                    " → ".join(lab(x) for x in r["best_path"]["nodes"])) for r in rows)))
    return {"id": "q:" + "+".join("%s%s" % (s["node"], "-up" if s["direction"] > 0 else "-down") for s in scenario),
            "kind": "scenario", "tiers": [], "refs": [s["node"] for s in scenario] + [r["node"] for r in rows],
            "title": "Scenario: " + head, "text": text,
            "brief": "If %s: %s" % (" and ".join(
                (("%s turns hawkish" if s["direction"] > 0 else "%s turns dovish") if g.nodes[s["node"]]["type"] == "institution" else
                 ("%s rises" if s["direction"] > 0 else "%s falls")) % lab(s["node"]) for s in scenario), ", ".join("%s %s" % (lab(r["node"]), "↑" if r["direction"] > 0 else "↓") for r in rows[:6])
                                    or "no chain to a sector or company")}


_VOCAB = {}


def card_vocab(kg):
    """Every word in the graph's cards (cached until the graph's size changes)."""
    key = (kg.g.number_of_nodes(), kg.g.number_of_edges())
    if key not in _VOCAB:
        _VOCAB.clear()
        _VOCAB[key] = set().union(*[set(tokens(c["title"] + " " + c["text"])) for c in cardlib.all_cards(kg)])
    return _VOCAB[key]


def unknown_terms(kg, text):
    """Words in the question that the graph does not know: {"names": capitalised words such as "Elon Musk" (not the first word),
    "words": other content words found in no card}. Words that are part of a matched entity, stop words and direction words
    are ignored."""
    covered, qwords = set(), _norm(text).split()
    for i, k, _, nm in _matches(kg, text):
        covered.update(nm.split())
        covered.update(qwords[i:i + k])                 # the words as typed ("intrest hike" is understood already)
    vocab = card_vocab(kg)
    names, words = [], []
    for i, tok in enumerate(re.findall(r"[A-Za-z][A-Za-z&'.\-]*", text or "")):
        w = _norm(tok)
        if not w or len(w) < 3 or w in covered or w in STOP or w in UP_WORDS or w in DOWN_WORDS:
            continue
        known = _stem(w) in vocab
        if tok[0].isupper() and i > 0 and not known:
            names.append(tok)
        elif not known:
            words.append(w)
    return {"names": names, "words": words}
