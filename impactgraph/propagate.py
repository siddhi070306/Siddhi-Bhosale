"""Impact propagation over the knowledge graph.

For each source shock we enumerate simple paths (depth-limited DFS). A path's score is the
product of its edges' effective strengths with a small per-hop decay, so long chains are
discounted. Paths are then aggregated per affected node.

Anchors: nodes whose move is *reported as observed* in the article. Paths from other sources
stop at an anchor (so the model can be compared with what actually happened) and the anchor
itself becomes a source (so its own downstream effects are traced from the observed shock).

Honesty notes: scores are heuristic plausibility, not probabilities; noisy-OR over paths that
share edges overstates independence, hence the cap and the agreement penalty.
"""

DECAY = 0.92
CONF_CAP = 0.92


def _dfs(kg, src, direction, anchors, max_depth, min_score, max_paths, market=None):
    from . import kb
    g = kg.g
    out = []

    def walk(node, nodes, edges, score, sign, lag):
        if len(out) >= max_paths * 4:
            return
        for nxt in g.successors(node):
            if nxt in nodes:
                continue
            if market and kb.market_of(nxt) not in (market, "GLOBAL"):
                continue  # a regulator's action is scoped to its own market
            e = g[node][nxt]
            s = score * kg.eff_strength(node, nxt) * (DECAY if edges else 1.0)
            if s < min_score:
                continue
            n2, e2 = nodes + [nxt], edges + [(node, nxt)]
            sg, lg = sign * e["sign"], lag + e["lag"]
            out.append({"nodes": n2, "edges": e2, "score": s, "sign": sg, "lag": lg})
            if nxt in anchors or len(e2) >= max_depth:
                continue
            walk(nxt, n2, e2, s, sg, lg)

    walk(src, [src], [], 1.0, direction, 0)
    out.sort(key=lambda p: -p["score"])
    return out[:max_paths]


def best_scores(kg, src, max_depth=5, min_score=0.04):
    """Best single-path score from src to every reachable node (used to detect upstream/downstream)."""
    best = {}
    for p in _dfs(kg, src, 1, set(), max_depth, min_score, 2000):
        t = p["nodes"][-1]
        best[t] = max(best.get(t, 0), p["score"])
    return best


def propagate(kg, sources, max_depth=5, min_score=0.04, max_paths=300):
    """sources: [{id, trigger, direction, intensity, status}] -> list of path dicts."""
    anchors = {s["trigger"] for s in sources if s.get("anchor")}
    paths = []
    for s in sources:
        block = anchors - {s["trigger"]}
        for p in _dfs(kg, s["trigger"], s["direction"], block, max_depth, min_score, max_paths, s.get("market")):
            p["source_id"] = s["id"]
            p["intensity"] = s["intensity"]
            paths.append(p)
    paths.sort(key=lambda p: -p["score"])
    return paths


def _label(score):
    return "high" if score >= 0.5 else "moderate" if score >= 0.25 else "low"


def aggregate(paths, exclude=()):
    """Per-node impact summary across all paths."""
    by_node = {}
    for p in paths:
        by_node.setdefault(p["nodes"][-1], []).append(p)
    out = {}
    for node, ps in by_node.items():
        if node in exclude:
            continue
        ps = sorted(ps, key=lambda p: -p["score"])
        pos = sum(p["score"] for p in ps if p["sign"] > 0)
        neg = sum(p["score"] for p in ps if p["sign"] < 0)
        top = ps[:4]
        miss = 1.0
        for p in top:
            miss *= 1 - p["score"]
        conf = min(CONF_CAP, 1 - miss)
        tot = pos + neg
        agree = max(pos, neg) / tot if tot else 1.0
        mixed = agree < 0.7 and min(pos, neg) >= 0.02
        conf *= 0.5 + 0.5 * agree
        best = ps[0]
        sens = best["intensity"] * best["score"]
        out[node] = {
            "node": node,
            "direction": 1 if pos >= neg else -1,
            "confidence": round(conf, 3),
            "confidence_label": _label(conf),
            "mixed": mixed,
            "agreement": round(agree, 2),
            "horizon_days": best["lag"],
            "sensitivity": round(sens, 3),
            "sensitivity_label": "strong" if sens >= 0.4 else "moderate" if sens >= 0.18 else "mild",
            "n_paths": len(ps),
            "best_path": best,
            "pos_mass": round(pos, 3), "neg_mass": round(neg, 3),
        }
    return out
