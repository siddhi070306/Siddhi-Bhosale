"""Context for a graph that would otherwise be thin.

When the text states only an *effect* (an index, a company or a sector moved) the forward graph from it is tiny.
Two read-only expansions make it useful, and both are drawn and labelled as hypotheses, never as article facts:

  drivers  walk the graph BACKWARDS from each stated move: which variables could explain it, and how would they
           have had to move ("a fall in rate expectations could explain this rise in the S&P 500")
  peers    for a company/index/ETF: its sector, and the other members of that sector

Nothing here writes to the knowledge graph.
"""
from . import propagate as pg

THIN_NODES = 14                   # a graph with fewer entities than this gets context
ASSET_LIKE = ("company", "index", "instrument")
MAX_DRIVERS = 8
MAX_PEERS = 4
MAX_SECTORS = 2                   # sectors shown per stated asset (an index has many)


def expand(kg, sources, graph):
    """-> {"drivers", "peers", "nodes", "links", "reason"} or None when the graph is already rich enough."""
    have = {n["id"] for n in graph["nodes"] if n["type"] != "event"}
    if len(have) >= THIN_NODES or not sources:
        return None
    g = kg.g

    # ---- drivers: best backwards path per candidate driver
    best = {}
    for s in sources:
        for p in pg.upstream_paths(kg, s["trigger"], s["direction"]):
            drv = p["nodes"][0]
            if drv == s["trigger"] or g.nodes[drv]["type"] in ASSET_LIKE:
                continue
            if drv not in best or p["score"] > best[drv]["score"]:
                best[drv] = dict(p, target=s["trigger"])
    ranked = sorted(best.values(), key=lambda p: -p["score"])[:MAX_DRIVERS]

    nodes, links, drivers, peers = {}, {}, [], []

    rank = {"via": 1, "driver": 2, "peer": 3}      # a node that is several things shows as the most specific one

    def add_node(n, role, direction=None):
        if n in have:
            return
        if n in nodes:
            if rank[role] > rank[nodes[n]["role"]]:
                nodes[n]["role"] = role
            return
        d = g.nodes[n]
        nodes[n] = {"id": n, "label": d["label"], "type": d["type"], "direction": direction, "confidence": None, "eta": None,
                    "observed": False, "source": False, "mixed": False, "inferred": True, "role": role}

    def add_link(u, v, kind="context"):
        if (u, v) in links or any(l["source"] == u and l["target"] == v for l in graph["links"]):
            return
        e = g[u][v]
        links[(u, v)] = {"source": u, "target": v, "sign": e["sign"], "strength": round(kg.eff_strength(u, v), 3),
                         "lag": e["lag"], "provenance": ["hypothesis"], "inferred": True, "verdict": None, "paths": [],
                         "kind": kind}

    for p in ranked:
        drivers.append({"node": p["nodes"][0], "label": g.nodes[p["nodes"][0]]["label"], "target": p["target"],
                        "target_label": g.nodes[p["target"]]["label"], "required_direction": p["required"],
                        "score": round(p["score"], 3), "hops": len(p["edges"]), "lag_days": p["lag"],
                        "chain": " → ".join(g.nodes[n]["label"] for n in p["nodes"])})
        for i, n in enumerate(p["nodes"][:-1]):                       # the last node is the stated move itself
            add_node(n, "driver" if i == 0 else "via", p["required"] if i == 0 else None)
        for u, v in p["edges"]:
            add_link(u, v)

    # ---- peers: sector context for company / index / ETF sources
    for s in sources:
        if g.nodes[s["trigger"]]["type"] not in ASSET_LIKE:
            continue
        is_company = g.nodes[s["trigger"]]["type"] == "company"
        secs = sorted((x for x in g.predecessors(s["trigger"]) if g.nodes[x]["type"] == "sector"),
                      key=lambda x: -g[x][s["trigger"]]["strength"])[:MAX_SECTORS]
        for sec in secs:
            add_node(sec, "peer")
            add_link(sec, s["trigger"])
            # other members only make sense for a company ("its peers"); for an index the sectors ARE the context
            sibs = sorted((m for m in g.successors(sec) if g.nodes[m]["type"] in ASSET_LIKE and m != s["trigger"]),
                          key=lambda m: -g[sec][m]["strength"])[:MAX_PEERS] if is_company else []
            for m in sibs:
                add_node(m, "peer")
                add_link(sec, m)
            peers.append({"sector": sec, "sector_label": g.nodes[sec]["label"], "for": s["trigger"],
                          "members": [g.nodes[m]["label"] for m in sibs],
                          "kind": "peers" if is_company else "composition"})

    if not drivers and not peers:
        return None
    parts = []
    if drivers:
        parts.append("%d possible driver(s) found by tracing the graph backwards from the stated move" % len(drivers))
    if peers:
        parts.append("sector peers added for context")
    return {"drivers": drivers, "peers": peers, "nodes": list(nodes.values()), "links": list(links.values()),
            "reason": "; ".join(parts) + ". These are hypotheses, not statements from the article."}
