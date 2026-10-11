"""Optional LLM layer via any OpenAI-compatible endpoint (Groq or OpenRouter).

Selected by environment: GROQ_API_KEY, else OPENROUTER_API_KEY. With neither set every function
here returns None and the pipeline runs on rules alone. The LLM is only ever asked to (a) add
events the rules missed, mapped to KB node ids, and (b) summarise an analysis it is handed.
It never creates numbers or edges; scores come from the graph.
"""
import json
import os
import re
import time

import requests

from . import kb

PROVIDERS = {
    "groq": ("https://api.groq.com/openai/v1/chat/completions", "GROQ_API_KEY",
             os.environ.get("ZENITH_GROQ_MODEL", "openai/gpt-oss-120b")),
    "openrouter": ("https://openrouter.ai/api/v1/chat/completions", "OPENROUTER_API_KEY",
                   os.environ.get("ZENITH_OPENROUTER_MODEL", "meta-llama/llama-3.3-70b-instruct")),
}


def provider():
    pref = os.environ.get("ZENITH_LLM_PROVIDER", "").lower()
    order = [pref] if pref in PROVIDERS else []
    order += [p for p in ("groq", "openrouter") if p not in order]
    for p in order:
        url, env, model = PROVIDERS[p]
        if os.environ.get(env, "").strip():
            return p, url, os.environ[env].strip(), model
    return None


def available():
    return provider() is not None


_LAST_ERROR = [None]
MAX_RATE_WAIT = 30      # seconds we are willing to wait out a rate limit before giving up


def last_error():
    """Human-readable reason the most recent LLM call failed (None if it succeeded)."""
    return _LAST_ERROR[0]


def _providers():
    """All providers with a key, preferred one first."""
    pref = os.environ.get("ZENITH_LLM_PROVIDER", "").lower()
    order = ([pref] if pref in PROVIDERS else []) + [p for p in ("groq", "openrouter") if p != pref]
    return [(p,) + (PROVIDERS[p][0], os.environ[PROVIDERS[p][1]].strip(), PROVIDERS[p][2])
            for p in order if os.environ.get(PROVIDERS[p][1], "").strip()]


def _retry_wait(r):
    """Seconds the provider asks us to wait (Retry-After, or Groq's x-ratelimit-reset-tokens like '1m2.5s')."""
    h = r.headers
    try:
        return float(h["retry-after"])
    except (KeyError, ValueError):
        pass
    m = re.fullmatch(r"(?:(\d+)m)?(?:([\d.]+)s)?", h.get("x-ratelimit-reset-tokens", "").strip())
    if m and (m.group(1) or m.group(2)):
        return int(m.group(1) or 0) * 60 + float(m.group(2) or 0)
    return 10.0


def _post(prov, body):
    name, url, key, model = prov
    return requests.post(url, json=dict(body, model=model), timeout=45,
                         headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"})


def _chat(system, user, json_mode=False, max_tokens=2000):
    """One chat completion. A rate-limited provider is skipped in favour of the next one; if every provider is
    rate-limited we wait out the shortest limit (up to MAX_RATE_WAIT seconds) and retry once. None on failure."""
    provs = _providers()
    if not provs:
        _LAST_ERROR[0] = "no LLM key configured"
        return None
    body = {"temperature": 0.1, "max_tokens": max_tokens,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    limited, why = [], []
    for prov in provs:
        try:
            r = _post(prov, body)
        except Exception as e:
            why.append("%s unreachable (%s)" % (prov[0], type(e).__name__))
            continue
        if r.status_code == 200:
            try:
                _LAST_ERROR[0] = None
                return r.json()["choices"][0]["message"]["content"]
            except Exception:
                why.append("%s returned an unreadable response" % prov[0])
                continue
        if r.status_code in (429, 503):
            limited.append((_retry_wait(r), prov))
            why.append("%s rate-limited (HTTP %d)" % (prov[0], r.status_code))
        else:
            why.append("%s HTTP %d" % (prov[0], r.status_code))
    if limited:
        wait, prov = min(limited, key=lambda x: x[0])
        if wait <= MAX_RATE_WAIT:
            time.sleep(wait + 0.5)
            try:
                r = _post(prov, body)
                if r.status_code == 200:
                    _LAST_ERROR[0] = None
                    return r.json()["choices"][0]["message"]["content"]
                why.append("retry on %s after %.0fs: HTTP %d" % (prov[0], wait, r.status_code))
            except Exception as e:
                why.append("retry on %s failed (%s)" % (prov[0], type(e).__name__))
        else:
            why.append("would have to wait %.0fs" % wait)
    _LAST_ERROR[0] = "; ".join(why) or "unknown error"
    return None


_NODE_LIST = None


def _nodes_for_prompt():
    global _NODE_LIST
    if _NODE_LIST is None:
        _NODE_LIST = "; ".join("%s=%s" % (k, v["label"]) for k, v in kb.NODES.items()
                               if v["type"] not in ("institution",) or k in ("fed", "rbi", "ecb"))
    return _NODE_LIST


def extract_events(text):
    """Ask the model for events as JSON; return validated list of event dicts (possibly empty), or None."""
    sys_p = ("You extract financial events from news. Reply with JSON only: "
             '{"events":[{"trigger":"<node id>","direction":1|-1,"status":"observed"|"expected",'
             '"magnitude":"<e.g. 12%> or null","type":"price_move|central_bank_decision|supply_decision|geopolitical|regulation",'
             '"quote":"<exact sentence from the text>"}]}. '
             "Use ONLY these node ids: " + _nodes_for_prompt() + ". "
             "'observed' means the text reports it as having happened; hedged or forecast statements are 'expected'. "
             "For geopolitical escalation use trigger geopolitical_tension direction 1. Never invent events not in the text.")
    out = _chat(sys_p, text[:6000], json_mode=True)
    if not out:
        return None
    try:
        data = json.loads(re.search(r"\{.*\}", out, re.S).group(0))
    except Exception:
        return None
    evs = []
    for e in data.get("events", []):
        t = e.get("trigger")
        if t not in kb.NODES or e.get("direction") not in (1, -1):
            continue
        if e.get("quote") and e["quote"].strip()[:40] not in text:
            continue  # reject quotes that are not actually in the article
        evs.append({"type": e.get("type", "price_move"), "trigger": t, "direction": e["direction"],
                    "magnitude": e.get("magnitude"), "intensity": 0.5,
                    "status": "expected" if e.get("status") == "expected" else "observed",
                    "confidence": 0.55, "quote": e.get("quote") or "", "source": "llm",
                    "label": "%s %s (LLM)" % (kb.NODES[t]["label"], "up" if e["direction"] > 0 else "down")})
    return evs


def summarise(facts):
    """Short plain-English summary grounded only in the supplied facts."""
    sys_p = ("You are a cautious financial analyst. Using ONLY the facts provided, write 3-4 sentences summarising "
             "the likely transmission of the event. Separate what the article reports (observed) from what the model infers. "
             "Use hedged language (may, plausibly, suggests). No price targets, no advice, no numbers not in the facts. "
             "Only events listed under observed_events were reported by the article. Everything under top_assets, top_sectors, possible_drivers_hypotheses and model_hypotheses is a model inference: never describe it as observed, reported, happening or trending, and never state it as fact. "
             "Only if the facts contain a key named 'note', open with that caveat; never mention keys that are absent.")
    return _chat(sys_p, json.dumps(facts)[:6000], max_tokens=1500)


def suggest_sector(name, ticker, sector_ids):
    """Ask the model which curated sector a company/ETF belongs to. Returns a sector id from sector_ids, or None."""
    sys_p = ("You classify a listed company or fund into exactly one sector from a fixed list. Reply with JSON only: "
             '{"sector":"<id from the list>"|null}. Allowed ids: ' + ", ".join(sector_ids) + ". "
             "Use null if none fits or you are unsure. Do not guess.")
    out = _chat(sys_p, "Name: %s | Ticker: %s" % (name, ticker), json_mode=True, max_tokens=200)
    if not out:
        return None
    try:
        sec = json.loads(re.search(r"\{.*\}", out, re.S).group(0)).get("sector")
    except Exception:
        return None
    return sec if sec in sector_ids else None


def extract_links(text):
    """Ask the model for cause->effect links stated in the article between known graph nodes.

    Every proposal is verified here: both ids must exist in the KB, the sign must be +1/-1 and the
    supporting quote must literally appear in the article. Returns a verified list, or None on failure.
    """
    sys_p = ("You read a financial news article and list cause->effect relationships it states or clearly implies "
             "between entities. Reply with JSON only: "
             '{"links":[{"src":"<node id>","dst":"<node id>","sign":1|-1,"mechanism":"<one short sentence>",'
             '"quote":"<exact sentence from the text that supports it>"}]}. '
             "sign=1 means dst moves in the same direction as src, -1 the opposite. "
             "Use ONLY these node ids: " + _nodes_for_prompt() + ". Never invent relationships the text does not support.")
    out = _chat(sys_p, text[:6000], json_mode=True)
    if not out:
        return None
    try:
        data = json.loads(re.search(r"\{.*\}", out, re.S).group(0))
    except Exception:
        return None
    links, seen = [], set()
    for e in data.get("links", []):
        s_, d_, q = e.get("src"), e.get("dst"), (e.get("quote") or "").strip()
        if s_ not in kb.NODES or d_ not in kb.NODES or s_ == d_ or e.get("sign") not in (1, -1):
            continue
        if len(q) < 15 or q[:40] not in text:
            continue
        if (s_, d_) in seen:
            continue
        seen.add((s_, d_))
        links.append({"src": s_, "dst": d_, "sign": e["sign"], "quote": q,
                      "mechanism": (e.get("mechanism") or "Stated in the article")[:200]})
    return links


def _valid_events(items, text):
    evs = []
    for e in items or []:
        t = e.get("trigger")
        if t not in kb.NODES or e.get("direction") not in (1, -1):
            continue
        if e.get("quote") and e["quote"].strip()[:40] not in text:
            continue  # reject quotes that are not actually in the article
        evs.append({"type": e.get("type", "price_move"), "trigger": t, "direction": e["direction"],
                    "magnitude": e.get("magnitude"), "intensity": 0.5,
                    "status": "expected" if e.get("status") == "expected" else "observed",
                    "confidence": 0.55, "quote": e.get("quote") or "", "source": "llm",
                    "label": "%s %s (LLM)" % (kb.NODES[t]["label"], "up" if e["direction"] > 0 else "down")})
    return evs


def _valid_links(items, text):
    links, seen = [], set()
    for e in items or []:
        s_, d_, q = e.get("src"), e.get("dst"), (e.get("quote") or "").strip()
        if s_ not in kb.NODES or d_ not in kb.NODES or s_ == d_ or e.get("sign") not in (1, -1):
            continue
        if len(q) < 15 or q[:40] not in text or (s_, d_) in seen:
            continue
        seen.add((s_, d_))
        links.append({"src": s_, "dst": d_, "sign": e["sign"], "quote": q,
                      "mechanism": (e.get("mechanism") or "Stated in the article")[:200]})
    return links


CORPORATE_EVENTS = ("ipo", "share_sale", "stake_purchase", "earnings", "deal", "rating", "other")
MAX_COMPANIES = 4


def _valid_companies(items, text):
    """Companies the article names that the graph does not know yet. Kept only if the name is in the text; the sector must be
    one of the graph's sectors (else none); a direction only if the text states that the company's shares or value moved."""
    from . import extract as ex
    sectors = [k for k, v in kb.NODES.items() if v["type"] == "sector"]
    low_text, out, seen = text.lower(), [], set()
    for c in items or []:
        name = re.sub(r"\s+", " ", str((c or {}).get("name") or "")).strip(" .,'\"")
        if not (2 <= len(name) <= 60) or name.lower() not in low_text or name.lower() in seen:
            continue
        hit = ex.find_mentions(name)
        if hit and sum(m["end"] - m["start"] for m in hit) >= 0.6 * len(name):
            continue                          # already a node in the graph (e.g. "HDFC Bank"): the rules handle it
        seen.add(name.lower())
        quote = (c.get("quote") or "").strip()
        out.append({"name": name, "sector": c.get("sector") if c.get("sector") in sectors else None,
                    "event": c.get("event") if c.get("event") in CORPORATE_EVENTS else None,
                    "direction": c.get("direction") if c.get("direction") in (1, -1) else 0,
                    "status": "expected" if c.get("status") == "expected" else "observed",
                    "quote": quote if quote and quote[:40] in text else None})
        if len(out) == MAX_COMPANIES:
            break
    return out


def extract_graph(text, with_companies=False):
    """Events AND cause->effect links from one model call (half the tokens of two calls: the node list and the
    article are sent once). Every proposal is verified exactly as in extract_events / extract_links.
    Returns (events, links) or None on failure; with_companies=True returns (events, links, companies), where companies are
    the firms the article names that the graph does not know yet (see _valid_companies)."""
    sectors = ", ".join(k for k, v in kb.NODES.items() if v["type"] == "sector")
    sys_p = ("You read a financial news article and extract (1) events, (2) cause->effect links and (3) companies, as JSON only: "
             '{"events":[{"trigger":"<node id>","direction":1|-1,"status":"observed"|"expected","magnitude":"<e.g. 12%> or null",'
             '"type":"price_move|central_bank_decision|supply_decision|geopolitical|regulation","quote":"<exact sentence from the text>"}],'
             '"links":[{"src":"<node id>","dst":"<node id>","sign":1|-1,"mechanism":"<one short sentence>",'
             '"quote":"<exact sentence from the text that supports it>"}],'
             '"companies":[{"name":"<company name exactly as written in the text>","sector":"<sector id or null>",'
             '"event":"ipo|share_sale|stake_purchase|earnings|deal|rating|other|null","direction":1|-1|0,'
             '"status":"observed"|"expected","quote":"<exact sentence from the text>"}]}. '
             "Use ONLY these node ids: " + _nodes_for_prompt() + ". "
             "Events: 'observed' = reported as having happened; hedged or forecast statements are 'expected'; for geopolitical "
             "escalation use geopolitical_tension direction 1. Links: sign=1 means dst moves the same way as src, -1 the opposite; "
             "include every relationship the text states or clearly implies, including multi-step chains as separate links. "
             "Companies: every company, bank, insurer or fund named in the text that is NOT in the node list, at most four; sector "
             "is the closest of these ids or null if none fits: " + sectors + "; direction is 1 or -1 ONLY if the text says that "
             "company's shares or value rose or fell, otherwise 0; event is the corporate event the text reports about it, or null. "
             "Never invent anything the text does not support; quotes must be copied exactly.")
    out = _chat(sys_p, text[:6000], json_mode=True)
    if not out:
        return None
    try:
        data = json.loads(re.search(r"\{.*\}", out, re.S).group(0))
    except Exception:
        _LAST_ERROR[0] = "the model did not return valid JSON"
        return None
    got = (_valid_events(data.get("events"), text), _valid_links(data.get("links"), text))
    return got + (_valid_companies(data.get("companies"), text),) if with_companies else got


def suggest_themes(text):
    """For a text in which no known entity or event was found: ask the model which market themes it could
    plausibly touch. These are HYPOTHESES, never observations: callers must label them and never learn from them.
    Returns {"background": str|None, "themes": [{"node","direction","why","quote"}]} or None on failure."""
    sys_p = ("You help interpret a news item in which no known market entity was recognised. Reply with JSON only: "
             '{"background":"<at most two sentences of widely known, durable background about the entities named, '
             'with NO claims about what happened today, or null>","themes":[{"node":"<node id>","direction":1|-1,'
             '"why":"<one short sentence>","quote":"<exact phrase from the text that prompted it>"}]}. '
             "Give at most three themes, and ONLY where a phrase in the text itself bears directly on that market variable "
             "(copy that phrase as the quote). Prefer an empty list to a stretch; do not reason from the company's general importance. "
             "direction is how the variable would move IF the story is market-relevant. "
             "Use ONLY these node ids: " + _nodes_for_prompt() + ". Do not invent facts or numbers.")
    out = _chat(sys_p, text[:4000], json_mode=True, max_tokens=900)
    if not out:
        return None
    try:
        data = json.loads(re.search(r"\{.*\}", out, re.S).group(0))
    except Exception:
        _LAST_ERROR[0] = "the model did not return valid JSON"
        return None
    themes, seen = [], set()
    for t in data.get("themes") or []:
        n, d, q = t.get("node"), t.get("direction"), (t.get("quote") or "").strip()
        if n not in kb.NODES or d not in (1, -1) or n in seen:
            continue
        if len(q) < 8 or q[:40] not in text:
            continue          # no supporting phrase, or one that is not in the text: a guess, not a theme
        seen.add(n)
        themes.append({"node": n, "direction": d, "why": (t.get("why") or "")[:200], "quote": q or None})
        if len(themes) == 3:
            break
    bg = data.get("background")
    return {"background": bg.strip()[:400] if isinstance(bg, str) and bg.strip() else None, "themes": themes}


_LINK_CACHE = {}


def link_question(question, nodes):
    """Map the names and terms in a question that the graph does not contain (people, brands, events, places) to the closest
    graph nodes. nodes: [(id, label, type)] from the LIVE graph. Returns [{"term","node","direction","why"}] (direction 1/-1 only
    when the question states a move, else 0), [] when nothing maps, or None when the model failed. Every node is checked
    against the list and every term against the question; results are cached per question."""
    key = re.sub(r"\s+", " ", question.strip().lower())
    if key in _LINK_CACHE:
        return _LINK_CACHE[key]
    ids = {n for n, _, _ in nodes}
    listing = "; ".join("%s=%s (%s)" % (n, l, t) for n, l, t in nodes)
    sys_p = ("You map a question about financial markets onto a knowledge graph. For each name or term in the question that is "
             "a person, company, brand, product, place, institution or event, give the ONE graph node it most directly concerns, "
             "using widely known facts (a chief executive -> the company or sector they run; a company not in the graph -> its "
             "sector; a central banker -> the central bank; a country's conflict -> geopolitical tension; a commodity-producing "
             "region -> that commodity). A person maps to the company they run if it is in the list, otherwise to THAT company's "
             "sector; never map anything to a different company just because it is in the list. Terms that refer to the same "
             "thing (a chief executive and their company) map to the same node. Skip terms with no market connection (an actor's film, a sports result) unless the "
             "question ties them to spending, a company or a market. Reply with JSON only: "
             '{"links":[{"term":"<the words exactly as in the question>","node":"<node id>","direction":1|-1|0,'
             '"why":"<one short sentence>"}]}. direction is 1 or -1 only if the question states that the thing rises/falls, '
             "grows/shrinks, is hiked/cut or similar; otherwise 0. At most 4 links; an empty list is fine. "
             "Use ONLY these node ids: " + listing)
    out = _chat(sys_p, question[:600], json_mode=True, max_tokens=500)
    if not out:
        return None
    try:
        data = json.loads(re.search(r"\{.*\}", out, re.S).group(0))
    except Exception:
        _LAST_ERROR[0] = "the model did not return valid JSON"
        return None
    low, res, seen = question.lower(), [], set()
    for x in data.get("links") or []:
        term, n = str((x or {}).get("term") or "").strip(), (x or {}).get("node")
        if not term or term.lower() not in low or n not in ids or n in seen:
            continue
        seen.add(n)
        res.append({"term": term[:60], "node": n, "direction": x.get("direction") if x.get("direction") in (1, -1) else 0,
                    "why": str(x.get("why") or "")[:200]})
        if len(res) == 4:
            break
    if len(_LINK_CACHE) > 500:
        _LINK_CACHE.clear()
    _LINK_CACHE[key] = res
    return res
