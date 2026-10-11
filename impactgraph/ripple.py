"""What a link edit changes, before it is saved.

A user edit to one link (u -> v) is also proposed for the links that work through the same economic reason (channels.py), by
the same proportion. preview() applies the edit and the chosen linked edits to a COPY of the graph and compares the impact
of the open analysis's events (or, with no analysis, of a rise in the edited link's source) before and after: every chain that
runs through an edited link, re-scored, and every sector, company and variable whose direction or confidence changes.

Nothing here writes to the knowledge graph.
"""
from . import channels, hierarchy, propagate as pg
from . import timeseries as ts
from .graph import KnowledgeGraph

MAX_CHAINS = 12
MAX_NODES = 15


def clone(kg):
    """An independent copy of the graph to try edits on (edge attribute dicts are copied, so the original is untouched)."""
    c = KnowledgeGraph.__new__(KnowledgeGraph)
    c.g = kg.g.copy()
    for _, _, d in c.g.edges(data=True):          # nx copies each attribute dict, but not the lists inside it
        for k, val in list(d.items()):
            if isinstance(val, list):
                d[k] = list(val)
    c.articles = list(kg.articles)
    return c


def weight_of(kg, u, v):
    e = kg.g[u][v]
    return round(e["sign"] * e["strength"], 3)


def propose(kg, u, v, weight):
    """The edit and the linked edits it implies: same reason, same proportional change in strength (signs unchanged)."""
    g = kg.g
    old = g[u][v]
    new_sign, new_strength = (-1 if weight < 0 else 1), max(0.01, min(0.99, abs(float(weight))))
    ratio = new_strength / old["strength"] if old["strength"] else 1.0
    ch, sibs = channels.siblings(kg, u, v)
    linked = []
    if abs(ratio - 1) >= 0.02:
        for a, b in sibs:
            e = g[a][b]
            ns = round(max(0.01, min(0.99, e["strength"] * ratio)), 3)
            if abs(ns - e["strength"]) < 0.005:
                continue
            linked.append({"source": a, "target": b, "source_label": g.nodes[a]["label"], "target_label": g.nodes[b]["label"],
                           "before": weight_of(kg, a, b), "after": round(e["sign"] * ns, 3), "mechanism": e.get("mechanism"),
                           "user_edited": "user_edited" in (e.get("provenance") or []),
                           "default": "user_edited" not in (e.get("provenance") or [])})
    note = None
    if ch not in channels.GROUPABLE:
        note = ("This is a %s link: each one is checked against its own price data, so no other link is changed with it."
                % channels.LABEL[ch].lower() if ch == "structure" else
                "No economic reason could be read from this link's explanation, so no other link is changed with it.")
    elif abs(ratio - 1) < 0.02:
        note = "Only the sign changes, so the links that share its reason keep their strength (a sign flip is specific to this link)."
    elif not linked:
        note = "No other link works through the same reason (%s)." % channels.LABEL[ch].lower()
    return {"edit": {"source": u, "target": v, "source_label": g.nodes[u]["label"], "target_label": g.nodes[v]["label"],
                     "before": weight_of(kg, u, v), "after": round(new_sign * new_strength, 3), "mechanism": old.get("mechanism")},
            "channel": {"id": ch, "label": channels.LABEL[ch]}, "ratio": round(ratio, 3), "linked": linked, "note": note}


def apply_edits(kg, edits, revalidate=True):
    """Set each (source, target, weight) on kg and re-check it against market data."""
    for s, t, w in edits:
        kg.update_edge_weight(s, t, strength=abs(w), sign=-1 if w < 0 else 1)
        if revalidate:
            kg.g[s][t]["validation"] = None
            kg.set_validation(s, t, ts.validate_edge(kg, s, t, live=False))


def _impact(kg, sources):
    paths = pg.propagate(kg, sources)
    agg = pg.aggregate(paths, exclude={s["trigger"] for s in sources})
    return paths, agg


def ripple(kg, edits, sources):
    """Before/after impact of applying `edits` [(source, target, weight)] for these event sources."""
    after_kg = clone(kg)
    apply_edits(after_kg, edits)
    g = kg.g
    edited = {(s, t) for s, t, _ in edits}
    p0, a0 = _impact(kg, sources)
    p1, a1 = _impact(after_kg, sources)
    best0, best1 = {}, {}
    for paths, best in ((p0, best0), (p1, best1)):
        for p in paths:
            if edited & set(map(tuple, p["edges"])):
                k = tuple(p["nodes"])
                if k not in best or p["score"] > best[k]["score"]:
                    best[k] = p
    chains = []
    for k in set(best0) | set(best1):
        b, a = best0.get(k), best1.get(k)
        chains.append({"nodes": list(k), "labels": [g.nodes[n]["label"] for n in k],
                       "before": round(b["score"], 3) if b else 0.0, "after": round(a["score"], 3) if a else 0.0,
                       "end_dir_before": (b["sign"] if b else None), "end_dir_after": (a["sign"] if a else None),
                       "through": ["%s>%s" % e for e in zip(k, k[1:]) if e in edited]})
    chains.sort(key=lambda c: (-abs(c["after"] - c["before"]), -c["after"]))
    nodes = []
    for n in set(a0) | set(a1):
        b, a = a0.get(n), a1.get(n)
        bd, ad = (b["direction"] if b else 0), (a["direction"] if a else 0)
        bc, ac = (b["confidence"] if b else 0.0), (a["confidence"] if a else 0.0)
        if bd == ad and abs(ac - bc) < 0.01:
            continue
        nodes.append({"node": n, "label": g.nodes[n]["label"], "tier": g.nodes[n].get("tier"),
                      "before": {"direction": bd, "confidence": round(bc, 3), "label": b["confidence_label"] if b else "none"},
                      "after": {"direction": ad, "confidence": round(ac, 3), "label": a["confidence_label"] if a else "none"},
                      "flipped": bool(bd and ad and bd != ad), "appeared": not b, "vanished": not a})
    nodes.sort(key=lambda r: (not r["flipped"], -abs(r["after"]["confidence"] - r["before"]["confidence"])))
    touched = {x for c in chains for x in c["nodes"]}
    return {"chains": chains[:MAX_CHAINS], "chains_total": len(chains), "nodes": nodes[:MAX_NODES], "nodes_total": len(nodes),
            "flipped": sum(1 for r in nodes if r["flipped"]), "downstream": sorted(touched),
            "edges": sorted({"%s>%s" % e for c in chains for e in zip(c["nodes"], c["nodes"][1:])})}


def sources_for(kg, analysis, u):
    """The events to measure the ripple with: the open analysis's own sources, else a rise in the edited link's source."""
    if analysis:
        src = [{"id": s.get("id"), "trigger": s["trigger"], "direction": s["direction"], "intensity": s.get("intensity", 1.0),
                "anchor": s.get("anchor", False), "market": s.get("market")}
               for s in analysis.get("sources") or [] if s.get("trigger") in kg.g and s.get("direction")]
        if not src and analysis.get("context_only"):   # a context graph: the conditional chains start from their drivers
            seen = []
            for p in analysis.get("paths") or []:
                if p.get("nodes") and p["nodes"][0] in kg.g and p["nodes"][0] not in seen:
                    seen.append(p["nodes"][0])
            src = [{"id": "c%d" % i, "trigger": n, "direction": 1, "intensity": 1.0, "anchor": False} for i, n in enumerate(seen)]
        if src:
            return src, "analysis"
    return [{"id": "u", "trigger": u, "direction": 1, "intensity": 1.0, "anchor": False}], "unit"


def preview(kg, u, v, weight, accepted=None, analysis=None):
    """The proposal plus its ripple. accepted: the linked links to include, as "source>target" keys (None = the defaults)."""
    prop = propose(kg, u, v, weight)
    if accepted is None:
        chosen = [l for l in prop["linked"] if l["default"]]
    else:
        keys = set(accepted)
        chosen = [l for l in prop["linked"] if "%s>%s" % (l["source"], l["target"]) in keys]
    for l in prop["linked"]:
        l["selected"] = l in chosen
    edits = [(u, v, prop["edit"]["after"])] + [(l["source"], l["target"], l["after"]) for l in chosen]
    sources, basis = sources_for(kg, analysis, u)
    prop["ripple"] = ripple(kg, edits, sources)
    prop["ripple"]["basis"] = basis
    prop["ripple"]["basis_label"] = ("the events of the open analysis" if basis == "analysis" else
                                     "a rise in %s" % kg.g.nodes[u]["label"])
    return prop
