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


CONTEXT_ASSETS = ("company", "index", "instrument")


def entity_context(kg, focus, max_peers=3, max_drivers=3):
    """A context graph for a story that names entities but states no move: where each named entity sits (its sector, the
    sector's other members and the index it weighs in) and what usually moves that sector. No direction or impact is claimed.

    `focus` holds graph node ids, or dicts {"id","label","type":"company","sector"} for a company the graph does not know.
    -> {"nodes", "links", "summary", "reason", "focus"} or None when nothing can be placed."""
    from . import hierarchy
    g = kg.g
    nodes, links = {}, {}
    rank = {"via": 1, "driver": 2, "peer": 3, "focus": 4}

    def add_node(n, role, label=None, ntype=None):
        if n in nodes:
            if rank[role] > rank[nodes[n]["role"]]:
                nodes[n]["role"] = role
            return
        d = g.nodes[n] if n in g else {"label": label, "type": ntype}
        nodes[n] = {"id": n, "label": d["label"], "type": d["type"], "direction": None, "confidence": None, "eta": None,
                    "observed": False, "source": False, "mixed": False, "inferred": role != "focus", "role": role,
                    "context": True}

    def add_link(u, v, virtual=False):
        if (u, v) in links:
            return
        if virtual or not g.has_edge(u, v):
            links[(u, v)] = {"source": u, "target": v, "sign": 1, "strength": 0.5, "lag": 0, "provenance": ["inferred"],
                             "inferred": True, "verdict": None, "paths": [], "kind": "context", "relation": "member_of"}
            return
        e = g[u][v]
        links[(u, v)] = {"source": u, "target": v, "sign": e["sign"], "strength": round(kg.eff_strength(u, v), 3),
                         "lag": e["lag"], "provenance": list(e.get("provenance") or []), "inferred": bool(e.get("inferred")),
                         "verdict": (e.get("validation") or {}).get("verdict"), "paths": [], "kind": "context",
                         "relation": hierarchy.rel(g, u, v)}

    focus_labels, sectors, notes = [], [], []
    for f in focus:
        if isinstance(f, dict):                                       # a company the graph does not know (static mode)
            add_node(f["id"], "focus", f["label"], f.get("type", "company"))
            focus_labels.append(f["label"])
            sec = f.get("sector") if f.get("sector") in g else None
            if sec:
                add_node(sec, "peer")
                add_link(sec, f["id"], virtual=True)
                sectors.append((sec, f["id"]))
            continue
        if f not in g:
            continue
        add_node(f, "focus")
        focus_labels.append(g.nodes[f]["label"])
        t = g.nodes[f]["type"]
        if t == "sector":
            sectors.append((f, None))
        elif t in CONTEXT_ASSETS:
            p = hierarchy.parent_sector(kg, f)
            if p:
                add_node(p["id"], "peer")
                add_link(p["id"], f)
                sectors.append((p["id"], f))
        else:                                                         # a variable: show the sectors it usually moves
            outs = sorted((v for v in g.successors(f) if g.nodes[v]["type"] == "sector"),
                          key=lambda v: -kg.eff_strength(f, v))[:max_peers]
            for v in outs:
                add_node(v, "peer")
                add_link(f, v)
            if outs:
                notes.append("%s usually moves %s" % (g.nodes[f]["label"], ", ".join(g.nodes[v]["label"] for v in outs)))

    peers_txt, drivers_txt = [], []
    for sec, member in sectors:
        sibs = sorted((m for m in hierarchy.members_of(kg, sec) if m != member and g.nodes[m]["type"] == "company"),
                      key=lambda m: -g[sec][m]["strength"])[:max_peers]
        for m in sibs:
            add_node(m, "peer")
            add_link(sec, m)
        idx = [v for v in g.successors(sec) if g.nodes[v]["type"] == "index"][:2]
        for v in idx:
            add_node(v, "peer")
            add_link(sec, v)
        best = {}
        for p in pg.upstream_paths(kg, sec, 1, max_depth=2):
            drv = p["nodes"][0]
            if g.nodes[drv]["type"] in CONTEXT_ASSETS or drv in nodes and nodes[drv]["role"] == "focus":
                continue
            if drv not in best or p["score"] > best[drv]["score"]:
                best[drv] = p
        top = sorted(best.values(), key=lambda p: -p["score"])[:max_drivers]
        for p in top:
            for i, n in enumerate(p["nodes"][:-1]):
                add_node(n, "driver" if i == 0 else "via")
            for u, v in p["edges"]:
                add_link(u, v)
        lab = g.nodes[sec]["label"]
        who = nodes[member]["label"] if member else lab
        part = "%s sits in the %s sector" % (who, lab) if member else "%s is a sector" % lab
        if sibs:
            part += " (peers: %s)" % ", ".join(g.nodes[m]["label"] for m in sibs)
        if idx:
            part += ", part of the %s" % " and ".join(g.nodes[v]["label"] for v in idx)
        peers_txt.append(part)
        if top:
            drivers_txt.append("what usually moves %s: %s" % (lab, ", ".join(
                "%s (%s %s%s)" % (g.nodes[p["nodes"][0]]["label"],
                                  "tighter policy" if g.nodes[p["nodes"][0]]["type"] == "institution" else "a rise",
                                  "lifts it" if p["sign"] > 0 else "weighs on it",
                                      ", via " + " and ".join(g.nodes[n]["label"] for n in p["nodes"][1:-1]) if len(p["nodes"]) > 2 else "")
                for p in top)))

    if not focus_labels or len(nodes) < 2:
        return None
    names = ", ".join(focus_labels)
    summary = ("This story names %s but states no price move or policy decision, so no impact is claimed. " % names
               + ". ".join(s[0].upper() + s[1:] for s in peers_txt + notes + drivers_txt) + ".").replace("..", ".")
    return {"nodes": list(nodes.values()), "links": list(links.values()), "summary": summary, "focus": focus_labels,
            "reason": "No price move or policy decision is stated, so this is a context graph: where %s sit%s in the market "
                      "and what usually moves %s. It claims no direction or impact." % (
                          names, "s" if len(focus_labels) == 1 else "", "it" if len(focus_labels) == 1 else "them")}


def conditional_paths(kg, targets, per_target=3, max_total=12):
    """Chains for a story that states no move: how each named entity is USUALLY affected. For a company or sector, the strongest
    chain from each of its usual drivers (economic variables, policy makers, events) down to it; for a variable or policy maker,
    the strongest chains out of it. Each chain assumes the first node rises; nothing here is claimed by the article."""
    from . import cards as cardlib
    g = kg.g
    out, seen = [], set()
    for t in targets:
        if not t or t not in g:
            continue
        if g.nodes[t]["type"] in CONTEXT_ASSETS + ("sector",):
            best = {}
            for p in pg.upstream_paths(kg, t, 1, max_depth=3):
                drv = p["nodes"][0]
                if g.nodes[drv]["type"] in CONTEXT_ASSETS + ("sector",):
                    continue
                if drv not in best or p["score"] > best[drv]["score"]:
                    best[drv] = p
            nodes_list = [p["nodes"] for p in sorted(best.values(), key=lambda p: -p["score"])[:per_target]]
        else:
            nodes_list = [p["nodes"] for p in cardlib.find_paths(kg, t, None, per_target, diverse=True)]
        for nodes in nodes_list:
            p = cardlib.path_from_nodes(kg, nodes)
            if not p or tuple(nodes) in seen:
                continue
            seen.add(tuple(nodes))
            p["edge_decays"] = [1.0] + [pg._edge_decay(g[u][v]) for u, v in p["edges"][1:]]
            p["target"] = t
            out.append(p)
    out.sort(key=lambda p: -p["score"])
    return out[:max_total]


def merge_paths(kg, graph, explained):
    """Add the nodes and links of conditional chains to a context graph, and tag each link with the chains that use it."""
    g = kg.g
    have = {n["id"]: n for n in graph["nodes"]}
    links = {(l["source"], l["target"]): l for l in graph["links"]}
    for i, p in enumerate(explained):
        for j, n in enumerate(p["nodes"]):
            if n not in have:
                have[n] = {"id": n, "label": g.nodes[n]["label"], "type": g.nodes[n]["type"], "direction": None, "confidence": None,
                           "eta": None, "observed": False, "source": False, "mixed": False, "inferred": True,
                           "role": "driver" if j == 0 else "via", "context": True}
                graph["nodes"].append(have[n])
        for u, v in p["edges"]:
            if (u, v) not in links:
                e = g[u][v]
                links[(u, v)] = {"source": u, "target": v, "sign": e["sign"], "strength": round(kg.eff_strength(u, v), 3),
                                 "lag": e["lag"], "provenance": list(e.get("provenance") or []), "inferred": bool(e.get("inferred")),
                                 "verdict": (e.get("validation") or {}).get("verdict"), "paths": [], "kind": "context",
                                 "relation": hierarchy_rel(g, u, v)}
                graph["links"].append(links[(u, v)])
            links[(u, v)]["paths"].append(i)
    return graph


def hierarchy_rel(g, u, v):
    from . import hierarchy
    return hierarchy.rel(g, u, v)
