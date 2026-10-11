"""Impact propagation over the knowledge graph.

For each source shock we enumerate simple paths (depth-limited DFS). A path's score is the
product of its edges' effective strengths with a per-edge empirically calibrated decay, so
long and weakly-supported chains are discounted more aggressively than empirically strong ones.

Decay calibration (per-edge, not global):
  When an edge has been validated against real market data (via timeseries.validate_edge),
  its empirical lagged correlation |r| is used to set the hop-level decay:
    |r| >= 0.50 -> decay = 0.97  (strong empirical support, low attenuation)
    |r| in [0.30, 0.50) -> decay = 0.93  (moderate support, standard attenuation)
    |r| < 0.30 or 'contradicted' -> decay = 0.82  (weak/contradicted: aggressive attenuation)
    No validation data -> decay = DECAY_DEFAULT (= 0.92, conservative prior)
  This replaces a single global constant with a data-driven, per-edge Bayesian attenuation
  schedule grounded in the same rolling log-return correlations used by validate_edge.

Anchors: nodes whose move is *reported as observed* in the article. Paths from other sources
stop at an anchor (so the model can be compared with what actually happened) and the anchor
itself becomes a source (so its own downstream effects are traced from the observed shock).

Honesty notes: scores are heuristic plausibility, not probabilities; noisy-OR over paths that
share edges overstates independence, hence the cap and the agreement penalty.
"""
import math

DECAY_DEFAULT = 0.92   # conservative prior used when no empirical validation is available
DECAY_STRONG  = 0.97   # edge validated with |r| >= 0.50: attenuate less (data supports transmission)
DECAY_MODERATE = 0.93  # edge validated with 0.30 <= |r| < 0.50: standard attenuation
DECAY_WEAK    = 0.82   # edge contradicted by data or |r| < 0.30: aggressive attenuation
CONF_CAP = 0.92


def _edge_decay(edge_data):
    """Return the empirically calibrated per-hop decay for one edge.

    Reads the 'validation' record written by timeseries.validate_edge onto the graph edge.
    Falls back to DECAY_DEFAULT when no validation is available (e.g. nodes with no market series).
    """
    val = edge_data.get("validation")
    if not val or val.get("simulated"):
        return DECAY_DEFAULT                         # prior only
    corr = val.get("corr")
    if corr is None or not math.isfinite(corr):
        return DECAY_DEFAULT
    verdict = val.get("verdict", "")
    if verdict == "contradicted":
        return DECAY_WEAK                            # data says opposite sign: penalise heavily
    abs_r = abs(corr)
    if abs_r >= 0.50:
        return DECAY_STRONG
    if abs_r >= 0.30:
        return DECAY_MODERATE
    return DECAY_WEAK                                # inconclusive / very weak correlation


def _dfs(kg, src, direction, anchors, max_depth, min_score, max_paths, market=None):
    from . import kb
    g = kg.g
    out = []

    def walk(node, nodes, edges, score, sign, lag, path_decays=None):
        if path_decays is None:
            path_decays = []
        if len(out) >= max_paths * 4:
            return
        for nxt in g.successors(node):
            if nxt in nodes:
                continue
            if market and kb.market_of(nxt) not in (market, "GLOBAL"):
                continue  # a regulator's action is scoped to its own market
            e = g[node][nxt]
            hop_decay = _edge_decay(e) if edges else 1.0
            s = score * kg.eff_strength(node, nxt) * hop_decay
            if s < min_score:
                continue
            n2, e2 = nodes + [nxt], edges + [(node, nxt)]
            hop_lag = kg.eff_lag(node, nxt)
            sg, lg = sign * e["sign"], lag + hop_lag
            new_decays = path_decays + [round(hop_decay, 4)]
            out.append({"nodes": n2, "edges": e2, "score": s, "sign": sg, "lag": lg,
                        "edge_decays": new_decays})
            if nxt in anchors or len(e2) >= max_depth:
                continue
            walk(nxt, n2, e2, s, sg, lg, new_decays)

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


def upstream_paths(kg, target, direction, max_depth=3, min_score=0.1, max_paths=300):
    """Paths that could have PRODUCED a move of `direction` at `target` (walk the graph backwards).

    Each path runs driver -> ... -> target. `required` is the direction the driver would have had to move for
    the chain to explain the target's move. This is abductive ("what could explain this?"), weaker evidence than
    forward propagation, and callers must present it as a hypothesis."""
    g = kg.g
    out = []

    def walk(node, nodes, edges, score, sign, lag):
        if len(out) >= max_paths * 4:
            return
        for prv in g.predecessors(node):
            if prv in nodes:
                continue
            e = g[prv][node]
            s = score * kg.eff_strength(prv, node) * (_edge_decay(e) if edges else 1.0)
            if s < min_score:
                continue
            n2, e2 = nodes + [prv], edges + [(prv, node)]
            hop_lag = kg.eff_lag(prv, node)
            sg, lg = sign * e["sign"], lag + hop_lag
            out.append({"nodes": list(reversed(n2)), "edges": list(reversed(e2)), "score": s, "sign": sg,
                        "required": direction * sg, "lag": lg})
            if len(e2) < max_depth:
                walk(prv, n2, e2, s, sg, lg)

    walk(target, [target], [], 1.0, 1, 0)
    out.sort(key=lambda p: -p["score"])
    return out[:max_paths]
