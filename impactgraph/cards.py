"""Cards: the knowledge graph as plain-text, citable documents.

A card is one fact-sheet taken straight from the graph: a node, a link, a sector with its members, a tier overview, or a path.
Every card has

    id        stable and readable: n:<node>, l:<from>><to>, s:<sector>, t:<tier>, p:<a>><b>><c>
    kind      node | link | sector | tier | path | gap
    tiers     the tiers of the hierarchy it touches
    refs      the node ids it mentions (for filtering and for following up)
    title, brief (one line), text (the full fact-sheet)

Everything in a card comes from the graph: sign, strength, lag, mechanism, the basis of a link (analyst prior, observed in an
article, proposed by the LLM, supported by market data, added by a user), the data check, and any article evidence. Nothing is
generated, so the same graph always gives the same cards, and a card can be cited by its id.

The assistant (assistant.py) builds its context from these cards, and the export endpoints return them, so a retrieval system
and the chatbot read exactly the same text. A card set is pinned to the graph version and has a hash, so a consumer can tell
when its copy has gone stale.
"""
from __future__ import annotations

import hashlib

from . import hierarchy, propagate as pg

ARROW = {1: "↑", -1: "↓"}
KIND_ORDER = {"tier": 0, "sector": 1, "node": 2, "link": 3}
BASIS = {
    "prior": "analyst prior (curated, not statistically estimated)",
    "observed": "observed in an article",
    "llm_extracted": "read from an article by the LLM (quote-verified)",
    "llm_proposed": "proposed by the LLM (quote-verified, low confidence)",
    "validated": "supported by market data",
    "user_added": "added by a user",
    "user_edited": "weight edited by a user",
    "inferred": "inferred by the system (unverified)",
}


def label(g, n):
    return g.nodes[n]["label"]


def _tier(g, n):
    return g.nodes[n].get("tier") or (hierarchy.layer_of(g.nodes[n]["type"]) or {}).get("id")


def basis_text(e):
    return "; ".join(BASIS.get(p, p) for p in (e.get("provenance") or [])) or "unknown"


def check_text(e):
    v = e.get("validation") or {}
    if not v.get("verdict"):
        return "no data check yet"
    if v.get("simulated"):
        return "data check used simulated data and is ignored"
    r = "" if v.get("corr") is None else ", r = %s over %s days" % (v["corr"], v.get("n"))
    return "data check: %s%s (%s)" % (v["verdict"], r, v.get("data", "real series"))


def link_card(kg, u, v):
    g = kg.g
    e = g[u][v]
    eff = kg.eff_strength(u, v)
    rel = hierarchy.rel(g, u, v)
    kind = hierarchy.edge_kind(g.nodes[u]["type"], g.nodes[v]["type"])
    strength = "stored strength %.2f" % e["strength"] + (", %.2f after the data check" % eff if abs(eff - e["strength"]) > 0.005 else "")
    quotes = [ev["sentence"] for ev in (e.get("evidence") or [])[-2:]]
    text = ("%s → %s (%s link, %s to %s tier). When %s rises it pushes %s %s. %s; typical lag %s days. Mechanism: %s. "
            "Basis: %s. %s.") % (label(g, u), label(g, v), rel, kind["from_layer"], kind["to_layer"], label(g, u), label(g, v),
                                "UP" if e["sign"] > 0 else "DOWN", strength.capitalize(), e["lag"], e["mechanism"].rstrip("."),
                                basis_text(e), check_text(e).capitalize())
    if quotes:
        text += " Article evidence: " + " | ".join('"%s"' % q[:160] for q in quotes)
    brief = "%s → %s: %s (%s, basis: %s)" % (label(g, u), label(g, v), "pushes it UP" if e["sign"] > 0 else "pushes it DOWN",
                                            strength, basis_text(e))
    return {"id": "l:%s>%s" % (u, v), "kind": "link", "tiers": sorted({_tier(g, u), _tier(g, v)} - {None}), "refs": [u, v],
            "title": "%s → %s" % (label(g, u), label(g, v)), "text": text, "brief": brief}


def node_card(kg, n):
    g = kg.g
    p = hierarchy.node_properties(kg, n)
    bits = ["%s: %s, tier %s (%s). Market: %s. Origin: %s." % (p["label"], p["type"], p["level"], p["tier_name"], p["market"],
                                                                p["origin"])]
    if p["tier"] == "variable":
        bits.append("Measured as the %s; %s." % (p["measure"], "has real market data" if p["has_market_data"] else "no market data"))
    if p["tier"] == "sector" and p.get("members"):
        bits.append("Contains: " + ", ".join(m["label"] for m in p["members"]) + ".")
    if p["tier"] == "asset":
        if p.get("parent_sector"):
            bits.append("Member of the %s sector." % p["parent_sector"]["label"])
        if p.get("ticker"):
            bits.append("Ticker %s." % p["ticker"])
    if p.get("n_articles"):
        bits.append("Mentioned in %d analysed article(s)." % p["n_articles"])
    outs = sorted(g.out_edges(n), key=lambda uv: (-kg.eff_strength(*uv), uv))[:4]
    ins = sorted(g.in_edges(n), key=lambda uv: (-kg.eff_strength(*uv), uv))[:4]
    if outs:
        bits.append("Strongest outgoing links: " + ", ".join("%s (%s%.2f)" % (label(g, v), "+" if g[u][v]["sign"] > 0 else "-",
                                                                            kg.eff_strength(u, v)) for u, v in outs) + ".")
    if ins:
        bits.append("Strongest incoming links: " + ", ".join("%s (%s%.2f)" % (label(g, u), "+" if g[u][v]["sign"] > 0 else "-",
                                                                            kg.eff_strength(u, v)) for u, v in ins) + ".")
    kind = p["type"].replace("_", " ")
    brief = "%s is %s %s in tier %d (%s)" % (p["label"], "an" if kind[0] in "aeiou" else "a", kind, p["level"], p["tier_name"])
    return {"id": "n:%s" % n, "kind": "node", "tiers": [p["tier"]] if p["tier"] else [], "refs": [n], "title": p["label"],
            "text": " ".join(bits), "brief": brief}


def sector_card(kg, sector_id):
    g = kg.g
    p = hierarchy.node_properties(kg, sector_id)
    members = p.get("members") or []
    text = "%s sector. " % p["label"]
    text += ("Contains %d: %s." % (len(members), ", ".join("%s (%s)" % (m["label"], m["relation"].replace("_", " ")) for m in members))
             if members else "It has no members in the graph.")
    if p.get("weight_in"):
        text += " It is part of the index weight of: %s." % ", ".join(x["label"] for x in p["weight_in"])
    drivers = sorted((u for u, _ in g.in_edges(sector_id) if _tier(g, u) != "sector"),
                     key=lambda u: -kg.eff_strength(u, sector_id))[:3]
    if drivers:
        text += " Strongest drivers: %s." % ", ".join(label(g, u) for u in drivers)
    return {"id": "s:%s" % sector_id, "kind": "sector", "tiers": ["sector", "asset"] if members else ["sector"],
            "refs": [sector_id] + [m["id"] for m in members], "title": "%s: members" % p["label"], "text": text,
            "brief": "%s contains %d member(s)" % (p["label"], len(members))}


def tier_card(kg, tier_id):
    g = kg.g
    lay = next(l for l in hierarchy.LAYERS if l["id"] == tier_id)
    nodes = sorted(n for n, d in g.nodes(data=True) if _tier(g, n) == tier_id)
    kinds = {}
    for n in nodes:
        kinds.setdefault(g.nodes[n]["type"], []).append(label(g, n))
    parts = ["%s: %s" % (t.replace("_", " "), ", ".join(sorted(v))) for t, v in sorted(kinds.items())]
    text = "Tier %d, %s. %d node(s). %s." % (lay["level"], lay["name"], len(nodes), "; ".join(parts) or "empty")
    return {"id": "t:%s" % tier_id, "kind": "tier", "tiers": [tier_id], "refs": nodes, "title": "Tier %d: %s" % (lay["level"], lay["name"]),
            "text": text, "brief": "Tier %d (%s) has %d node(s)" % (lay["level"], lay["name"], len(nodes))}


def path_card(kg, p, start_dir=1):
    g = kg.g
    cur = start_dir
    parts, mech = [label(g, p["nodes"][0]) + " " + ARROW[cur]], []
    for (u, v) in p["edges"]:
        cur *= g[u][v]["sign"]
        parts.append(label(g, v) + " " + ARROW[cur])
        mech.append("%s → %s: %s" % (label(g, u), label(g, v), g[u][v]["mechanism"].rstrip(".")))
    layers = " → ".join((hierarchy.layer_of(g.nodes[n]["type"]) or {"id": "?"})["id"] for n in p["nodes"])
    first = p["nodes"][0]
    move = (("turns hawkish" if start_dir > 0 else "turns dovish") if g.nodes[first]["type"] == "institution" else
            ("rises" if start_dir > 0 else "falls"))
    text = ("If %s %s: %s. Path plausibility %.2f (a 0-1 score, not a probability or a price move), %d hops, typical lag %d "
            "days, tiers %s. Steps: %s.") % (label(g, first), move, " → ".join(parts), p["score"], len(p["edges"]), p["lag"],
                                              layers, " | ".join(mech))
    return {"id": "p:" + ">".join(p["nodes"]), "kind": "path", "tiers": sorted({_tier(g, n) for n in p["nodes"]} - {None}),
            "refs": list(p["nodes"]), "title": " → ".join(label(g, n) for n in p["nodes"]), "text": text,
            "brief": "%s (plausibility %.2f, %d hops)" % (" → ".join(parts), p["score"], len(p["edges"]))}


def gap_card(kg, a, b):
    g = kg.g
    return {"id": "x:%s>%s" % (a, b), "kind": "gap", "tiers": sorted({_tier(g, a), _tier(g, b)} - {None}), "refs": [a, b],
            "title": "No path between %s and %s" % (label(g, a), label(g, b)),
            "text": "The graph holds no path of up to 5 links between %s and %s in either direction, so it does not say "
                    "how one affects the other." % (label(g, a), label(g, b)),
            "brief": "no path between %s and %s" % (label(g, a), label(g, b))}


def shared_drivers(kg, a, b, limit=3):
    """Drivers that reach both a and b (walking the graph backwards), with the direction each pushes them when it rises and
    the strongest chain to each. Ranked by the weaker of the two chains. Common causes, not an effect of a on b."""
    def best(target):
        out = {}
        for p in pg.upstream_paths(kg, target, 1, max_depth=4, min_score=0.05):
            drv = p["nodes"][0]
            if drv not in (a, b) and (drv not in out or p["score"] > out[drv]["score"]):
                out[drv] = p
        return out
    pa, pb = best(a), best(b)
    common = sorted(set(pa) & set(pb), key=lambda d: (-min(pa[d]["score"], pb[d]["score"]), d))
    chosen = []
    for d in common:                    # a driver that only acts through one already listed adds nothing (the Fed via rates)
        if any(c in pa[d]["nodes"][1:] for c in chosen) and any(c in pb[d]["nodes"][1:] for c in chosen):
            continue
        chosen.append(d)
        if len(chosen) == limit:
            break
    return [{"driver": d, "a": pa[d], "b": pb[d]} for d in chosen]


def shared_drivers_card(kg, a, b, limit=3):
    """A card for two entities the graph does not connect: what moves both of them. None if nothing does."""
    g = kg.g
    sd = shared_drivers(kg, a, b, limit)
    if not sd:
        return None
    word = lambda s: "UP" if s > 0 else "DOWN"
    chain = lambda p: " → ".join(label(g, n) for n in p["nodes"])
    parts, briefs = [], []
    for x in sd:
        d, sa, sb = x["driver"], x["a"]["sign"], x["b"]["sign"]
        verb = "turns hawkish" if g.nodes[d]["type"] == "institution" else "rises"
        parts.append("When %s %s it pushes %s %s (%s, plausibility %.2f) and %s %s (%s, plausibility %.2f), so here they move %s." % (
            label(g, d), verb, label(g, a), word(sa), chain(x["a"]), x["a"]["score"], label(g, b), word(sb), chain(x["b"]),
            x["b"]["score"], "together" if sa == sb else "in opposite directions"))
        briefs.append("%s (%s %s, %s %s)" % (label(g, d), label(g, a), ARROW[sa], label(g, b), ARROW[sb]))
    text = ("Neither %s nor %s affects the other in the graph, but they share drivers, so they can move at the same time: this is "
            "co-movement through common causes, not an effect of one on the other. %s") % (label(g, a), label(g, b), " ".join(parts))
    return {"id": "d:%s&%s" % (a, b), "kind": "shared", "tiers": sorted({_tier(g, n) for n in (a, b)} - {None}),
            "refs": [a, b] + [x["driver"] for x in sd], "title": "Shared drivers of %s and %s" % (label(g, a), label(g, b)),
            "text": text, "brief": "shared drivers of %s and %s: %s" % (label(g, a), label(g, b), "; ".join(briefs))}


def find_paths(kg, src, dst=None, limit=3, diverse=False):
    """The strongest paths out of `src` (to `dst` if given; otherwise to distinct sectors and assets, at least 2 links long).

    diverse=True (used for one-topic questions) picks the strongest path through each different first link, then (if slots
    remain, e.g. for a central bank whose only link is to rate expectations) through each different second link, then the next
    strongest, so the answer covers several channels instead of variants of the strongest branch. It also makes sure one path
    runs through another economic variable when the graph has such a path (oil -> inflation -> rates -> real estate)."""
    paths = pg._dfs(kg, src, 1, set(), 5, 0.03, 300)
    if dst:
        return [p for p in paths if p["nodes"][-1] == dst][:limit]
    g = kg.g
    cands = [p for p in paths if g.nodes[p["nodes"][-1]].get("tier") in ("asset", "sector") and len(p["edges"]) >= 2]
    seen, keep = set(), []
    keys = ((lambda p: p["nodes"][1]), (lambda p: tuple(p["nodes"][1:3])), (lambda p: id(p))) if diverse else ((lambda p: id(p)),)
    for key in keys:                          # each pass only adds paths whose key is new
        used = {key(p) for p in keep}
        for p in cands:
            if len(keep) == limit:
                break
            end = p["nodes"][-1]
            if end in seen or key(p) in used:
                continue
            seen.add(end)
            used.add(key(p))
            keep.append(p)
    keep.sort(key=lambda p: -p["score"])
    if diverse and keep:
        via_var = lambda p: any(_tier(g, n) == "variable" for n in p["nodes"][1:-1])
        if not any(via_var(p) for p in keep):
            extra = next((p for p in cands if via_var(p) and p["nodes"][-1] not in seen), None)
            if extra:
                keep = keep[:limit - 1] + [extra]
    return keep


def analysis_card(rec, graph_version=None):
    """A card for one saved analysis (see library.py): what the article reported, what the model inferred, and the hypotheses,
    kept apart so an answer can say which is which."""
    arrow = lambda d: ARROW.get(d, "")
    obs = [e for e in rec["events"] if e["status"] == "observed"]
    exp = [e for e in rec["events"] if e["status"] == "expected"]
    hyp = [e for e in rec["events"] if e["status"] == "hypothesis"]
    v = (rec.get("kb_version") or {}).get("version")
    parts = ['Analysis of the article "%s" (%s, analysed on graph version %s).' % (rec["title"], rec["t"][:16], v if v is not None else "?")]
    if graph_version and v is not None and (v != graph_version.get("version") or
                                            (rec.get("kb_version") or {}).get("epoch") != graph_version.get("epoch")):
        parts.append("The graph has changed since (now version %s), so these inferences may differ today." % graph_version.get("version"))
    if obs:
        parts.append("REPORTED by the article (observed): " + "; ".join(
            '%s ("%s")' % (e["label"], e["quote"][:140]) if e.get("quote") else e["label"] for e in obs) + ".")
    if exp:
        parts.append("Stated as expected or hedged (not reported as happened): " + "; ".join(e["label"] for e in exp) + ".")
    if rec.get("paths"):
        parts.append(("CONDITIONAL chains (how it is usually affected; the article states no move): " if rec.get("context_only") else
                      "INFERRED by the model (chains it traced): ") + " | ".join(
            "%s (plausibility %.2f)" % (p["text"], p["score"] or 0) for p in rec["paths"][:4]) + ".")
    rows = [r for r in rec.get("assets", [])[:5] + rec.get("sectors", [])[:3] if r.get("node")]
    if rows:
        parts.append("INFERRED effects: " + "; ".join("%s %s (%s%s)" % (r["label"], arrow(r["direction"]), r["confidence_label"],
                                                                       ", mixed signals" if r["mixed"] else "") for r in rows) + ".")
    if rec.get("comparison"):
        parts.append("Model vs article: " + "; ".join("%s: %s" % (c["label"], (c["verdict"] or "").replace("_", " "))
                                                      for c in rec["comparison"][:6]) + ".")
    ctx = rec.get("context_only") or {}
    if ctx.get("focus"):
        parts.append("No price move or policy decision was stated, so the graph drawn is CONTEXT only (where %s sit%s in the market "
                     "and what usually moves %s); no impact was claimed." % (", ".join(ctx["focus"]), "s" if len(ctx["focus"]) == 1 else "",
                                                                             "it" if len(ctx["focus"]) == 1 else "them"))
    if rec.get("summary"):
        parts.append("Summary of the graph: %s" % _clip(rec["summary"], 500))
    hy = [e["label"] for e in hyp] + [h["text"] for h in rec.get("hypotheses", [])[:3]]
    if hy:
        parts.append("Model HYPOTHESES (not stated in the article): " + "; ".join(hy) + ".")
    brief = "Article of %s \"%s\": reported %s" % (rec["t"][:10], _clip(rec["title"], 70),
                                                   ", ".join(e["label"] for e in obs[:3]) or "no observed event")
    return {"id": "a:%s" % rec["id"], "kind": "analysis", "tiers": [], "refs": list(rec.get("nodes") or []),
            "title": "Article analysis: %s" % _clip(rec["title"], 80), "text": " ".join(parts), "brief": brief, "t": rec["t"]}


def _clip(s, n):
    s = s or ""
    return s if len(s) <= n else s[:n - 1] + "…"


def path_from_nodes(kg, nodes):
    """Rebuild a path from an explicit list of node ids (None if a link is missing), with the score the propagation would give."""
    g = kg.g
    if len(nodes) < 2 or any(n not in g for n in nodes) or len(set(nodes)) != len(nodes):
        return None
    edges = list(zip(nodes, nodes[1:]))
    if any(not g.has_edge(u, v) for u, v in edges):
        return None
    score, lag, sign = 1.0, 0, 1
    for i, (u, v) in enumerate(edges):
        score *= kg.eff_strength(u, v) * (pg._edge_decay(g[u][v]) if i else 1.0)
        lag += kg.eff_lag(u, v)
        sign *= g[u][v]["sign"]
    return {"nodes": list(nodes), "edges": edges, "score": score, "sign": sign, "lag": lag}


def all_cards(kg):
    """Every node, link, sector and tier card, in a stable order. (Paths are unbounded; ask for them with find_paths.)"""
    g = kg.g
    cards = [tier_card(kg, l["id"]) for l in hierarchy.LAYERS]
    cards += [sector_card(kg, n) for n in sorted(g.nodes) if _tier(g, n) == "sector"]
    cards += [node_card(kg, n) for n in sorted(g.nodes)]
    cards += [link_card(kg, u, v) for u, v in sorted(g.edges)]
    return cards


def select(cards, tier=None, node=None, kind=None):
    out = cards
    if tier:
        out = [c for c in out if tier in c["tiers"]]
    if node:
        out = [c for c in out if node in c["refs"]]
    if kind:
        out = [c for c in out if c["kind"] == kind]
    return out


def fingerprint(cards):
    """A hash of the ids and texts: it changes exactly when the graph's facts change, so a consumer can tell its copy is stale."""
    h = hashlib.sha1()
    for c in cards:
        h.update(c["id"].encode("utf-8"))
        h.update(b"\x00")
        h.update(c["text"].encode("utf-8"))
        h.update(b"\x01")
    return h.hexdigest()[:16]


def get_card(kg, card_id, library=None, graph_version=None):
    """One card by id, or None. Analysis cards (a:<id>) need the analysis library."""
    g = kg.g
    kind, _, rest = card_id.partition(":")
    if kind == "n" and rest in g:
        return node_card(kg, rest)
    if kind == "s" and rest in g and _tier(g, rest) == "sector":
        return sector_card(kg, rest)
    if kind == "t" and rest in {l["id"] for l in hierarchy.LAYERS}:
        return tier_card(kg, rest)
    if kind == "l":
        u, _, v = rest.partition(">")
        return link_card(kg, u, v) if g.has_edge(u, v) else None
    if kind == "p":
        p = path_from_nodes(kg, rest.split(">"))
        return path_card(kg, p) if p else None
    if kind == "d":
        a, _, b = rest.partition("&")
        return shared_drivers_card(kg, a, b) if a in g and b in g else None
    if kind == "o" and rest == "graph":
        from . import retrieval
        return retrieval.overview_card(kg)
    if kind == "a" and library is not None:
        rec = library.get(rest)
        return analysis_card(rec, graph_version) if rec else None
    return None
