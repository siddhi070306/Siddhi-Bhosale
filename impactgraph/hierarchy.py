"""Hierarchical view of the knowledge graph.

The graph is organised in four tiers, from the cause of a move down to what an investor can hold:

    0  Events & policy      event classes (e.g. geopolitical tension), institutions (e.g. a central bank), and the events
                            an article reports
    1  Economic variables   commodities and indicators (crude oil, inflation expectations, the 10-year yield, the dollar)
    2  Sectors              groups of companies (airlines, banks, oil and gas producers)
    3  Assets               companies, indices and instruments (Delta, Nifty 50, a gold ETF)

Every node has a tier, derived from its type (nothing here is learned or guessed). Every link is classified by how it
moves through the tiers:

    next      goes exactly one tier down (variable -> sector, sector -> asset)
    skip      goes down more than one tier (variable -> asset: a rate expectation straight to an index)
    lateral   stays in the same tier (variable -> variable chains, sector -> sector)
    feedback  goes back up (a sector's health feeding back into growth); allowed in the curated graph, but a link that
              the system learns at run time is never allowed to point up from an asset

Containment is separate from causation: a sector contains the companies and funds that the curated graph links to it as
members, so a sector's effect can be read down to its members.
"""
from __future__ import annotations

import time

from . import kb

LAYERS = [
    {"id": "event", "level": 0, "name": "Events & policy", "types": ("event_class", "institution", "event")},
    {"id": "variable", "level": 1, "name": "Economic variables", "types": ("commodity", "indicator")},
    {"id": "sector", "level": 2, "name": "Sectors", "types": ("sector",)},
    {"id": "asset", "level": 3, "name": "Assets", "types": ("company", "index", "instrument")},
]
_BY_TYPE = {t: l for l in LAYERS for t in l["types"]}
_BY_ID = {l["id"]: l for l in LAYERS}

# What a link means, stored on every link as `relation` (separate from its sign, strength and lag):
#   causes           the source moving pushes the target (the default)
#   policy_reaction  an institution's decision reprices a variable
#   member_of        a company belongs to a sector
#   tracks           a fund or sector index follows a sector, commodity or yield
#   weight_in        a sector or company is a component of a broad index
RELATIONS = ("causes", "policy_reaction", "member_of", "tracks", "weight_in")
CONTENTS = ("member_of", "tracks")      # relations that put an asset "inside" a sector, for the sector drill-down


def relation_for(from_type, to_type, from_id=None, to_id=None, provenance=()):
    """The relation a link has, from its endpoints. Links proposed by the LLM are always plain causal claims."""
    if "llm_proposed" in (provenance or ()):
        return "causes"
    over = kb.RELATION_OVERRIDES.get((from_id, to_id))
    if over:
        return over
    if from_type == "institution":
        return "policy_reaction"
    if from_type == "sector":
        return {"company": "member_of", "instrument": "tracks", "index": "weight_in"}.get(to_type, "causes")
    if from_type in ("commodity", "indicator") and to_type == "instrument":
        return "tracks"
    if from_type == "company" and to_type == "index":
        return "weight_in"
    return "causes"


def rel(g, u, v):
    """Relation of an existing link; derived from the endpoints for a link saved before relations were stored."""
    e = g[u][v]
    return e.get("relation") or relation_for(g.nodes[u]["type"], g.nodes[v]["type"], u, v, e.get("provenance"))


def node_attrs(node_id, node_type, origin, article_id=None):
    """Properties stored on a node when it is created."""
    lay = layer_of(node_type)
    return {"tier": lay["id"] if lay else None, "origin": origin,
            "market": kb.market_of(node_id) if node_id in kb.NODES else "unknown",
            "first_seen": None if origin == "curated" else time.strftime("%Y-%m-%d"),
            "articles": [article_id] if article_id else []}


def ensure_properties(kg):
    """Fill in tier, origin, market and relation on a graph saved before they were stored. Returns how many were added."""
    g, n_added = kg.g, 0
    for nid, d in g.nodes(data=True):
        if d.get("tier") is not None and "origin" in d:
            continue
        origin = "user" if d.get("user_added") else "curated" if nid in kb.STATIC_IDS else "learned"
        for k, v in node_attrs(nid, d["type"], origin).items():
            d.setdefault(k, v)
        n_added += 1
    for u, v, e in g.edges(data=True):
        if not e.get("relation"):
            e["relation"] = relation_for(g.nodes[u]["type"], g.nodes[v]["type"], u, v, e.get("provenance"))
            n_added += 1
    return n_added


def layer_of(node_type):
    """The tier dict for a node type, or None for a type the hierarchy does not know."""
    return _BY_TYPE.get(node_type)


def edge_kind(from_type, to_type):
    a, b = layer_of(from_type), layer_of(to_type)
    if not a or not b:
        return {"kind": "unknown", "from_layer": a and a["id"], "to_layer": b and b["id"]}
    d = b["level"] - a["level"]
    kind = "lateral" if d == 0 else "feedback" if d < 0 else "next" if d == 1 else "skip"
    return {"kind": kind, "from_layer": a["id"], "to_layer": b["id"]}


def members_of(kg, sector_id):
    """Companies and funds the curated graph links to this sector as members."""
    g = kg.g
    if sector_id not in g:
        return []
    if g.nodes[sector_id]["type"] != "sector":
        return []
    return [v for _, v in g.out_edges(sector_id)
            if rel(g, sector_id, v) in CONTENTS and g.nodes[v]["type"] in _BY_ID["asset"]["types"]]


def parent_sector(kg, node_id):
    """The sector that contains this asset, as {id, label}, or None."""
    g = kg.g
    if node_id not in g:
        return None
    for u, _ in g.in_edges(node_id):
        if g.nodes[u]["type"] == "sector" and rel(g, u, node_id) in CONTENTS:
            return {"id": u, "label": g.nodes[u]["label"]}
    return None


def annotate_nodes(kg, nodes):
    """Add tier (and containing sector, for assets) to graph nodes in place."""
    for n in nodes:
        lay = layer_of(n.get("type"))
        if lay:
            n["layer"], n["layer_name"], n["level"] = lay["id"], lay["name"], lay["level"]
            if lay["id"] == "asset":
                p = parent_sector(kg, n["id"])
                if p:
                    n["parent"] = p
    return nodes


TIER_SHORT = {"event": "Event", "variable": "Variable", "sector": "Sector", "asset": "Asset"}
_ARROW = {1: "↑", -1: "↓"}


def build_chain(kg, nodes, dirs):
    """The nodes of a path with their tier and direction, in order."""
    g, out = kg.g, []
    for n, d in zip(nodes, dirs):
        lay = layer_of(g.nodes[n]["type"]) or {"id": "?", "name": "?"}
        out.append({"node": n, "label": g.nodes[n]["label"], "tier": lay["id"], "tier_name": lay["name"], "direction": d})
    return out


def tier_sentence(chain, event_label=None):
    """One plain line that reads a path tier by tier, e.g.
    'Event: Crude Oil up 12% → Variable: Crude Oil ↑ → Sector: Airlines ↓ → Asset: Delta Air Lines ↓'."""
    parts = []
    if event_label and not (chain and chain[0]["tier"] == "event"):
        parts.append("Event: %s" % event_label)
    for c in chain:
        parts.append("%s: %s %s" % (TIER_SHORT.get(c["tier"], c["tier"]), c["label"], _ARROW.get(c["direction"], "")))
    return " → ".join(parts)


# How a link is supported, strongest claim first. Each link counts once, under the first that applies.
BASIS_ORDER = ("user", "contradicted", "observed", "validated", "llm", "prior_only")


def link_basis(provenance, validation):
    prov = set(provenance or [])
    v = validation or {}
    real = v.get("verdict") and not v.get("simulated")
    if "user_added" in prov or "user_edited" in prov:
        return "user"
    if real and v.get("verdict") == "contradicted":
        return "contradicted"
    if "observed" in prov:
        return "observed"
    if "validated" in prov or (real and v.get("verdict") == "supported"):
        return "validated"
    if "llm_extracted" in prov or "llm_proposed" in prov:
        return "llm"
    return "prior_only"


def evidence_mix(paths):
    """For each tier, how the links ARRIVING at it are supported, over the distinct links on the given explained paths.

    This only re-groups what the graph already records about each link; it adds no probability."""
    seen, mix = set(), {t["id"]: {b: 0 for b in BASIS_ORDER} for t in LAYERS}
    for p in paths:
        for st in p.get("steps", []):
            key = (st["from"], st["to"])
            if key in seen or st.get("to_layer") not in mix:
                continue
            seen.add(key)
            mix[st["to_layer"]][link_basis(st.get("provenance"), st.get("validation"))] += 1
    out = {}
    for tier, counts in mix.items():
        out[tier] = dict(counts, kind="links", total=sum(counts.values()))
    return out


def annotate_links(kg, links):
    """Add the tier-crossing kind to graph links in place (links to non-graph nodes such as article events are skipped)."""
    g = kg.g
    for l in links:
        if l["source"] in g and l["target"] in g:
            l["kind_tier"] = edge_kind(g.nodes[l["source"]]["type"], g.nodes[l["target"]]["type"])["kind"]
    return links


def annotate_path(kg, p):
    """Tier of every node on a path, and which steps skip a tier or feed back up."""
    g = kg.g
    layers = [(layer_of(g.nodes[n]["type"]) or {"id": "unknown"})["id"] for n in p["nodes"]]
    for st in p["steps"]:
        k = edge_kind(g.nodes[st["from"]]["type"], g.nodes[st["to"]]["type"])
        st["from_layer"], st["to_layer"], st["step_kind"] = k["from_layer"], k["to_layer"], k["kind"]
    p["layers"] = layers
    p["skips_tier"] = any(st["step_kind"] == "skip" for st in p["steps"])
    p["has_feedback"] = any(st["step_kind"] == "feedback" for st in p["steps"])
    return p


def rollup(kg, assets, sectors, variables, events=(), paths=()):
    """One summary per tier plus a drill-down from each affected sector to its member assets.

    The inputs are the impact rows the analysis already produced; nothing is recomputed or estimated here.
    """
    def summarise(layer_id, rows):
        lay = _BY_ID[layer_id]
        top = sorted(rows, key=lambda r: -r["confidence"])[:5]
        return {"id": lay["id"], "level": lay["level"], "name": lay["name"], "count": len(rows),
                "up": sum(1 for r in rows if r["direction"] > 0 and not r["mixed"]),
                "down": sum(1 for r in rows if r["direction"] < 0 and not r["mixed"]),
                "mixed": sum(1 for r in rows if r["mixed"]),
                "top": [{"node": r["node"], "label": r["label"], "direction": r["direction"], "confidence": r["confidence"],
                         "confidence_label": r["confidence_label"], "mixed": r["mixed"]} for r in top]}

    by_node = {r["node"]: r for r in assets}
    drill = []
    for s in sectors:
        members = members_of(kg, s["node"])
        if not members:
            continue
        reached = [by_node[m] for m in members if m in by_node]
        drill.append({"sector": s["node"], "label": s["label"], "direction": s["direction"], "confidence": s["confidence"],
                      "members_total": len(members), "members_reached": len(reached),
                      "members": [{"node": r["node"], "label": r["label"], "direction": r["direction"],
                                   "confidence": r["confidence"], "agrees_with_sector": r["direction"] == s["direction"]}
                                  for r in reached],
                      "members_not_reached": [kg.g.nodes[m]["label"] for m in members if m not in by_node]})
    ev = {"id": "event", "level": 0, "name": _BY_ID["event"]["name"], "count": len(events),
          "up": sum(1 for e in events if e["direction"] > 0), "down": sum(1 for e in events if e["direction"] < 0), "mixed": 0,
          "observed": sum(1 for e in events if e["status"] == "observed"),
          "top": [{"node": e["trigger"], "label": e["label"], "direction": e["direction"], "status": e["status"]}
                  for e in events[:5]]}
    layers = [ev, summarise("variable", list(variables)), summarise("sector", sectors), summarise("asset", assets)]
    mix = evidence_mix(paths)
    for l in layers:
        if l["id"] == "event":
            l["evidence"] = {"kind": "events", "total": len(events),
                             "observed": sum(1 for e in events if e["status"] == "observed"),
                             "expected": sum(1 for e in events if e["status"] == "expected"),
                             "hypothetical": sum(1 for e in events if e["status"] not in ("observed", "expected"))}
        else:
            l["evidence"] = mix[l["id"]]
    return {"layers": layers,
            "sector_members": drill}


_MEASURE = {"ret": "percent return of its market series", "diff": "change in percentage points of its market series"}


def node_properties(kg, node_id):
    """Everything the graph knows about one node, with the properties that belong to its tier. None if it is not in the graph."""
    g = kg.g
    if node_id not in g:
        return None
    d = g.nodes[node_id]
    lay = layer_of(d["type"]) or {"id": None, "name": None, "level": None}
    spec = kb.NODES.get(node_id) or {}
    p = {"id": node_id, "label": d["label"], "type": d["type"], "tier": d.get("tier") or lay["id"], "tier_name": lay["name"],
         "level": lay["level"], "origin": d.get("origin"), "market": d.get("market"), "first_seen": d.get("first_seen"),
         "articles": list(d.get("articles") or [])[-5:], "n_articles": len(d.get("articles") or []),
         "links_in": g.in_degree(node_id), "links_out": g.out_degree(node_id),
         "series": [{"source": s, "id": i} for s, i, _ in (d.get("series") or [])]}
    label = lambda n: {"id": n, "label": g.nodes[n]["label"]}
    if p["tier"] == "event":
        p["is_policy_body"] = d["type"] == "institution"
        p["affects"] = [label(v) for _, v in g.out_edges(node_id)][:8]
    elif p["tier"] == "variable":
        kind = d.get("kind") or next((sr[2] for sr in (d.get("series") or []) if len(sr) > 2 and sr[2]), None)
        p["measure"] = _MEASURE.get(kind) or "no market series in the knowledge base"
        p["has_market_data"] = bool(d.get("series"))
        p["tracked_by"] = [label(v) for _, v in g.out_edges(node_id) if rel(g, node_id, v) == "tracks"]
    elif p["tier"] == "sector":
        p["members"] = [dict(label(m), relation=rel(g, node_id, m)) for m in members_of(kg, node_id)]
        p["weight_in"] = [label(v) for _, v in g.out_edges(node_id) if rel(g, node_id, v) == "weight_in"]
    elif p["tier"] == "asset":
        p["ticker"] = kb.yf_symbol(node_id) or ((d.get("series") or [[None, None]])[0][1])
        p["parent_sector"] = parent_sector(kg, node_id)
        p["weight_in"] = [label(v) for _, v in g.out_edges(node_id) if rel(g, node_id, v) == "weight_in"]
        p["tracks"] = [label(u) for u, _ in g.in_edges(node_id) if rel(g, u, node_id) == "tracks"
                       and g.nodes[u]["type"] != "sector"]
    return p


def check_link(kg, src, dst, relation=None):
    """Tier rules for a link a user wants to add. Returns {ok, errors, warnings, relation}.

    Errors block the link. Warnings only inform: a link that skips a tier or stays within one is normal in this graph.
    The one hard rule is the one the guard applies to learned links: nothing may point up from an asset."""
    g = kg.g
    errors, warnings = [], []
    for n in (src, dst):
        if n not in g:
            errors.append("unknown node: %s" % n)
    if errors:
        return {"ok": False, "errors": errors, "warnings": warnings, "relation": None}
    if src == dst:
        errors.append("a link cannot point from a node to itself")
    if g.has_edge(src, dst):
        errors.append("this link already exists; edit its weight instead")
    ts, td = g.nodes[src]["type"], g.nodes[dst]["type"]
    k = edge_kind(ts, td)
    if k["kind"] == "feedback" and k["from_layer"] == "asset":
        errors.append("a link may not point up the hierarchy from an asset (%s to %s)" % (k["from_layer"], k["to_layer"]))
    elif k["kind"] == "feedback":
        warnings.append("this link goes back up a tier (%s to %s): a feedback link" % (k["from_layer"], k["to_layer"]))
    elif k["kind"] == "skip":
        warnings.append("this link skips a tier (%s to %s)" % (k["from_layer"], k["to_layer"]))
    elif k["kind"] == "lateral":
        warnings.append("this link stays within one tier (%s)" % k["from_layer"])
    rel_ = relation or relation_for(ts, td, src, dst)
    if rel_ not in RELATIONS:
        errors.append("unknown relation %r (use one of %s)" % (rel_, ", ".join(RELATIONS)))
    elif rel_ in ("member_of", "tracks") and ts == "sector" and td not in _BY_ID["asset"]["types"]:
        errors.append("%s links a sector to an asset" % rel_)
    elif rel_ == "member_of" and ts != "sector":
        errors.append("member_of links a sector to a company")
    elif rel_ == "policy_reaction" and ts != "institution":
        errors.append("policy_reaction starts at an institution")
    return {"ok": not errors, "errors": errors, "warnings": warnings, "relation": rel_}


def audit(kg):
    """Count links by how they move through the tiers, and list the ones that point up the hierarchy."""
    g = kg.g
    counts, feedback, learned_up, relations = {}, [], [], {}
    for u, v, e in g.edges(data=True):
        relations[rel(g, u, v)] = relations.get(rel(g, u, v), 0) + 1
        k = edge_kind(g.nodes[u]["type"], g.nodes[v]["type"])
        counts[k["kind"]] = counts.get(k["kind"], 0) + 1
        if k["kind"] == "feedback":
            feedback.append("%s -> %s" % (u, v))
            if e.get("inferred") and k["from_layer"] == "asset":
                learned_up.append("%s -> %s" % (u, v))
    return {"by_kind": counts, "by_relation": relations, "feedback_links": feedback, "learned_links_pointing_up_from_assets": learned_up}


def describe():
    return [{"id": l["id"], "level": l["level"], "name": l["name"], "types": list(l["types"])} for l in LAYERS]
