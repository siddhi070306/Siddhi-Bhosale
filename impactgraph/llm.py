"""Optional LLM layer via any OpenAI-compatible endpoint (Groq or OpenRouter).

Selected by environment: GROQ_API_KEY, else OPENROUTER_API_KEY. With neither set every function
here returns None and the pipeline runs on rules alone. The LLM is only ever asked to (a) add
events the rules missed, mapped to KB node ids, and (b) summarise an analysis it is handed.
It never creates numbers or edges; scores come from the graph.
"""
import json
import os
import re

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


def _chat(system, user, json_mode=False, max_tokens=2500):
    prov = provider()
    if not prov:
        return None
    name, url, key, model = prov
    body = {"model": model, "temperature": 0.1, "max_tokens": max_tokens,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    try:
        r = requests.post(url, json=body, timeout=40,
                          headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"})
        if r.status_code != 200:
            return None
        return r.json()["choices"][0]["message"]["content"]
    except Exception:
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
             "Use hedged language (may, plausibly, suggests). No price targets, no advice, no numbers not in the facts.")
    return _chat(sys_p, json.dumps(facts)[:6000], max_tokens=1500)


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
