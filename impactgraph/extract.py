"""Rule-based entity and event extraction from unstructured financial text.

Deterministic, offline and explainable. An LLM pass (llm.py) can add events on top of this,
but the rules alone are enough to run the whole pipeline.

Key distinction made here: an event is "observed" when the text reports it as having happened,
and "expected" when it is hedged (could / may / analysts warn / if ...). Only observed events
anchor the propagation; expected ones are shown as scenarios or checked against the model.
"""
import math
import re

from . import kb

_UP = ("rise rises rose risen rising jump jumps jumped jumping surge surges surged surging soar soars "
       "soared climb climbs climbed gain gains gained spike spikes spiked hike hikes hiked raise raises "
       "raised increase increases increased advance advances advanced rally rallies rallied lift lifts "
       "lifted higher boost boosts boosted widen widens widened").split()
_DOWN = ("fall falls fell fallen falling drop drops dropped plunge plunges plunged slump slumps slumped "
         "tumble tumbles tumbled decline declines declined slide slides slid slip slips slipped cut cuts "
         "lower lowers lowered slash slashes slashed dip dips dipped sink sinks sank weaken weakens "
         "weakened ease eases eased retreat retreats retreated lose loses lost").split()
_VERB_RE = re.compile(r"(?<![A-Za-z])(" + "|".join(sorted(set(_UP + _DOWN), key=len, reverse=True)) + r")(?![A-Za-z])", re.I)
_UPSET, _DOWNSET = set(_UP), set(_DOWN)
_PCT_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(%|per\s?cent|percent|bps|basis points?)", re.I)
_HEDGE_RE = re.compile(
    r"\b(could|may|might|would|should|expected to|likely to|poised to|set to|fears? (?:of|that)|"
    r"warn(?:s|ed|ing)?|forecast|predict(?:s|ed)?|if|risk of|threaten(?:s|ed)?|analysts? (?:say|expect))\b", re.I)

_GEO_STRONG = re.compile(r"\b(attack(?:s|ed)?|missile|drone strikes?|invasion|blockade|embargo|sanctions?|"
                         r"seiz(?:e|ed|ure)|hostilit\w+|escalat\w+)\b", re.I)
_GEO_WEAK = re.compile(r"\b(war|conflict|tensions?|military)\b", re.I)
_GEO_EASE = re.compile(r"\b(ceasefire|de-escalat\w+|truce|peace deal|tensions? ease[sd]?)\b", re.I)
_OPEC_RESTRAIN = re.compile(
    r"((output|production|supply|quota)s?\s+cuts?|cuts?\s+(?:to\s+|in\s+)?(?:its\s+|their\s+)?(output|production|supply)|"
    r"\bcurb\w*|\brestrain\w*|\bwithhold\w*|\bextend\w*\s+(?:the\s+)?cuts?|\bkeep\w*\s+(?:its\s+)?(?:output|production)\s+cuts?)", re.I)
_OPEC_BOOST = re.compile(r"(boost|raise|increase|ramp up|pump more|hike)\w*\s+(?:its\s+)?(output|production|supply)", re.I)
_REG_CORE = re.compile(r"\b(regulator\w*|regulation\w*|rules?|bans?|banned|tariffs?|tax(?:es)?|levy|curbs?|"
                       r"crackdown|norms|windfall|probe|mandate\w*|risk weights?|capital requirements?)\b", re.I)
_REG_TIGHT = re.compile(r"(tighten\w*|\bbans?\b|banned|restrict\w*|curb\w*|imposes?|imposed|tariff|windfall|"
                        r"crackdown|probe|penal\w*|higher (?:tax|risk weights?|capital)|raise[sd]? (?:the )?(?:tax|tariff|levy|risk weights?|capital))", re.I)
_REG_EASE = re.compile(r"(eas(?:e|es|ed)\b|relax\w*|approv\w+|subsid\w+|incentive|stimulus|lift(?:s|ed) (?:the )?(?:ban|curbs?|restrictions))", re.I)
_RATE_WORD = re.compile(r"\b(rates?|basis points?|bps|repo)\b", re.I)
_UNLINKED_RE = re.compile(
    r"\b((?:[A-Z][A-Za-z&\.\-]+\s+){1,3}(?:Inc|Corp|Corporation|Ltd|Limited|Holdings|Airlines|Airways|Bank|"
    r"Petroleum|Energy|Motors|Industries|Group|Co\.))\b")


def _compile_aliases():
    out = []
    for nid, n in kb.NODES.items():
        for a in n["aliases"]:
            cs = a.startswith(kb.CASE_SENSITIVE_PREFIX)
            txt = a[1:] if cs else a
            rx = re.compile(r"(?<![A-Za-z0-9])" + re.escape(txt) + r"(?![A-Za-z0-9])", 0 if cs else re.I)
            out.append((rx, nid, txt))
    return out


_ALIASES = _compile_aliases()


def split_sentences(text):
    """Yield (start, end, sentence) with offsets into the original text."""
    pos = 0
    for part in re.split(r"(?<=[.!?])\s+(?=[A-Z0-9\"'])", text.strip()):
        start = text.find(part, pos)
        if start < 0:
            start = pos
        pos = start + len(part)
        yield start, pos, part


def find_mentions(sentence):
    """Longest-match, non-overlapping entity mentions in one sentence."""
    cands = []
    for rx, nid, txt in _ALIASES:
        for m in rx.finditer(sentence):
            cands.append((m.start(), m.end(), nid, m.group(0)))
    cands.sort(key=lambda c: (-(c[1] - c[0]), c[0]))
    taken, out = [], []
    for s, e, nid, surf in cands:
        if any(s < te and e > ts for ts, te in taken):
            continue
        taken.append((s, e))
        out.append({"start": s, "end": e, "node": nid, "text": surf})
    out.sort(key=lambda m: m["start"])
    return out


_CLAUSE_RE = re.compile(r";|,\s*(?:while|but|whereas|and)\b|\b(?:while|but|whereas|as|after|amid)\b", re.I)
_DETERMINERS = {"the", "a", "an", "this", "that", "its", "their", "any", "further", "sharp", "steep", "big",
                "small", "modest", "another", "such", "of"}
_ADJ_OK_NEXT = {"", "than", "on", "for", "after", "as", "in", "amid", "at", "by", "while", "to", "with", "and",
                "but", "from", "this", "last", "today", "monday", "tuesday", "wednesday", "thursday", "friday"}


def _clauses(sent):
    cuts = [0] + [m.start() for m in _CLAUSE_RE.finditer(sent)] + [len(sent)]
    return [(cuts[i], cuts[i + 1]) for i in range(len(cuts) - 1)]


def _clause_of(bounds, pos):
    for a, b in bounds:
        if a <= pos < b:
            return (a, b)
    return (0, 10 ** 9)


def _verb_ok(sent, v):
    """Reject noun/adjective uses: 'the increase', 'higher capital requirements'."""
    word = v.group(1).lower()
    before = re.findall(r"[A-Za-z']+", sent[:v.start()])
    if before and before[-1].lower() in _DETERMINERS:
        return False
    if word in ("higher", "lower", "wider"):
        nxt = re.findall(r"[A-Za-z']+", sent[v.end():v.end() + 20])
        nw = nxt[0].lower() if nxt else ""
        if nw not in _ADJ_OK_NEXT and not re.match(r"\s*[,.;]", sent[v.end():v.end() + 3]):
            return False
    return True


def _nearest_verb(verbs, ms, me, max_dist=70, bounds=None):
    best = None
    clause = _clause_of(bounds, ms) if bounds else None
    for v in verbs:
        if clause and not (clause[0] <= v.start() < clause[1]):
            continue
        d = v.start() - me if v.start() >= me else ms - v.end() + 25
        if d < 0 or d > max_dist:
            continue
        if best is None or d < best[0]:
            best = (d, v)
    return best[1] if best else None


def _pct_near(sentence, verb):
    best = None
    for p in _PCT_RE.finditer(sentence):
        d = p.start() - verb.end() if p.start() >= verb.end() else verb.start() - p.end() + 15
        if d < 0 or d > 40:
            continue
        if best is None or d < best[0]:
            best = (d, p)
    return best[1] if best else None


def _hedged(sentence, upto):
    return bool(_HEDGE_RE.search(sentence[:upto]))


def _price_intensity(pct_val):
    if pct_val is None:
        return 0.5
    return max(0.25, min(1.0, math.tanh(pct_val / 8.0)))


def extract(text):
    """Return {"mentions": [...], "events": [...], "unlinked": [...], "sentences": [...]}."""
    mentions_all, events, sentences = [], [], []
    seen = set()

    def add(ev):
        key = (ev["type"], ev["trigger"], ev["direction"])
        if key in seen:
            return
        seen.add(key)
        ev["id"] = "ev%d" % (len(events) + 1)
        events.append(ev)

    for s_off, s_end, sent in split_sentences(text):
        sentences.append({"start": s_off, "end": s_end, "text": sent})
        mentions = find_mentions(sent)
        for m in mentions:
            m = dict(m)
            m["start"] += s_off
            m["end"] += s_off
            m["sentence"] = sent
            mentions_all.append(m)
        verbs = [v for v in _VERB_RE.finditer(sent) if _verb_ok(sent, v)]
        bounds = _clauses(sent)
        ids = {m["node"] for m in mentions}

        # 1) price / level moves reported for an entity
        for m in mentions:
            node = kb.NODES[m["node"]]
            if node["type"] not in kb.TYPES_FOR_PRICE_MOVES:
                continue
            if m["node"] == "rate_exp" and any(kb.NODES[x["node"]]["type"] == "institution" for x in mentions):
                continue  # the central-bank rule below owns this statement
            v = _nearest_verb(verbs, m["start"], m["end"], bounds=bounds)
            if not v:
                continue
            word = v.group(1).lower()
            direction = 1 if word in _UPSET else -1
            if m["node"] == "usdinr" and m["text"].lower() in ("rupee", "indian rupee", "inr"):
                direction = -direction  # "rupee weakened" means USD/INR rose
            p = _pct_near(sent, v)
            pct_val = float(p.group(1)) if p and p.group(2).startswith(("%", "per", "perc")) else None
            expected = _hedged(sent, v.start())
            mag = None
            if p:
                mag = p.group(0)
            add({"type": "price_move", "trigger": m["node"], "direction": direction,
                 "magnitude": mag, "intensity": _price_intensity(pct_val) * (0.7 if expected else 1),
                 "status": "expected" if expected else "observed",
                 "confidence": round(0.6 + (0.2 if p else 0) + (0.1 if v.start() >= m["end"] and v.start() - m["end"] < 25 else 0), 2),
                 "quote": sent, "source": "rules", "label": "%s %s%s" % (
                     node["label"], "up" if direction > 0 else "down", (" " + mag) if mag else "")})

        # 2) central-bank decisions
        if _RATE_WORD.search(sent):
            for m in mentions:
                if kb.NODES[m["node"]]["type"] != "institution" or m["node"] == "central_banks":
                    continue  # generic "central banks" is a mention, not a decision-maker
                v = _nearest_verb(verbs, m["start"], m["end"], 80, bounds)
                if not v:
                    continue
                word = v.group(1).lower()
                direction = 1 if word in _UPSET else -1
                p = _pct_near(sent, v)
                bps = None
                if p and p.group(2).lower().startswith(("bps", "basis")):
                    bps = float(p.group(1))
                inten = 0.6 if bps is None else max(0.3, min(1.0, bps / 50.0))
                expected = _hedged(sent, v.start())
                add({"type": "central_bank_decision", "trigger": m["node"], "direction": direction,
                     "magnitude": p.group(0) if p else None, "intensity": inten * (0.7 if expected else 1),
                     "status": "expected" if expected else "observed", "confidence": 0.8,
                     "quote": sent, "source": "rules",
                     "label": "%s %s rates%s" % (kb.NODES[m["node"]]["label"], "hawkish: raises" if direction > 0 else "dovish: cuts",
                                                (" " + p.group(0)) if p else "")})

        # 3) OPEC+ supply decisions
        if "opec_supply_cut" in ids:
            if _OPEC_BOOST.search(sent):
                dr, why = -1, "raises output"
            elif _OPEC_RESTRAIN.search(sent):
                dr, why = 1, "restrains output"
            else:
                dr = 0
            if dr:
                expected = _hedged(sent, len(sent)) and not re.search(r"\b(signal\w*|announc\w*|agree\w*|decid\w*)\b", sent, re.I)
                add({"type": "supply_decision", "trigger": "opec_supply_cut", "direction": dr, "magnitude": None,
                     "intensity": 0.6 * (0.7 if expected else 1), "status": "expected" if expected else "observed",
                     "confidence": 0.75, "quote": sent, "source": "rules", "label": "OPEC+ %s" % why})

        # 4) geopolitical shocks
        strong, weak, ease = _GEO_STRONG.search(sent), _GEO_WEAK.search(sent), _GEO_EASE.search(sent)
        if ease:
            add({"type": "geopolitical", "trigger": "geopolitical_tension", "direction": -1, "magnitude": None,
                 "intensity": 0.5, "status": "observed", "confidence": 0.6, "quote": sent, "source": "rules",
                 "label": "Geopolitical tension easing"})
        elif strong or (weak and "geopolitical_tension" in ids):
            expected = _hedged(sent, (strong or weak).start()) and not strong
            inten = 0.8 if re.search(r"\b(major|severe|sharp|massive|escalat\w+)\b", sent, re.I) else 0.6
            add({"type": "geopolitical", "trigger": "geopolitical_tension", "direction": 1, "magnitude": None,
                 "intensity": inten * (0.7 if expected else 1), "status": "expected" if expected else "observed",
                 "confidence": 0.7 if strong else 0.5, "quote": sent, "source": "rules",
                 "label": "Geopolitical escalation (%s)" % (strong or weak).group(0).lower()})

        # 5) regulation aimed at a sector / company
        if _REG_CORE.search(sent):
            targets = [m for m in mentions if kb.NODES[m["node"]]["type"] in ("sector", "company")]
            if targets:
                tight, ease_ = _REG_TIGHT.search(sent), _REG_EASE.search(sent)
                if tight or ease_:
                    t = targets[0]["node"]
                    dr = -1 if tight and not (ease_ and ease_.start() < tight.start()) else 1
                    inst = [kb.market_of(m["node"]) for m in mentions if kb.NODES[m["node"]]["type"] == "institution"]
                    inst = [x for x in inst if x != "GLOBAL"]
                    if not inst:  # no regulator named: use the market of any named company
                        inst = [kb.market_of(m["node"]) for m in mentions if kb.NODES[m["node"]]["type"] == "company"]
                    scope = inst[0] if inst and len(set(inst)) == 1 else None
                    add({"type": "regulation", "trigger": t, "direction": dr, "magnitude": None, "intensity": 0.5,
                         "market": scope,
                         "status": "expected" if _hedged(sent, len(sent)) else "observed", "confidence": 0.55,
                         "quote": sent, "source": "rules",
                         "label": "Regulatory %s for %s" % ("tightening" if dr < 0 else "easing", kb.NODES[t]["label"])})

    unlinked = []
    # only known companies/indices block a new entity; a sector word inside a name ("... Airlines") must not
    taken = {(m["start"], m["end"]) for m in mentions_all
             if kb.NODES[m["node"]]["type"] in ("company", "index", "instrument", "institution")}
    for u in _UNLINKED_RE.finditer(text):
        name = u.group(1).strip()
        if any(u.start() < e and u.end() > s for s, e in taken):
            continue
        if any(name.lower() == n["label"].lower() for n in kb.NODES.values()):
            continue
        sector = None
        low = name.lower()
        for kws, sec in kb.SECTOR_KEYWORDS:
            if any(k in low for k in kws):
                sector = sec
                break
        unlinked.append({"name": name, "sector_guess": sector})
    return {"mentions": mentions_all, "events": events, "unlinked": unlinked, "sentences": sentences}
