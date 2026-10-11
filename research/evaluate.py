"""Reproducible evaluation for the Apex Zenith paper.

Run from the repository root (or any copy of it that has data/cache):

    ZENITH_REQUIRE_LLM=0 python research/evaluate.py

Everything here is offline and deterministic: rules-only extraction (no LLM), cached real market data only
(`live=False` reads data/cache and never downloads), and no persistence (nothing is written to data/kb_state.json).
Results are printed and written to research/results.json.

Experiments
  E1  graph statistics            what the curated graph contains
  E2  tier-constraint ablation    what is lost when links are restricted by tier (10 articles)
  E3  data validation             every curated link checked against cached real FRED / Yahoo series
  E4  score reproducibility       every path score equals the product of its links' strengths and decays
  E5  model vs article            the graph's predicted direction vs the moves the articles state
  E6  guard fault injection       corrupting changes are detected and rolled back; benign ones are kept
  E7  latency                     offline analysis time per article
  E8  assistant retrieval         does the KG assistant retrieve multi-hop chains (two-entity and one-entity questions)
"""
import collections
import copy
import json
import os
import statistics
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
os.environ["ZENITH_REQUIRE_LLM"] = "0"
for k in ("GROQ_API_KEY", "OPENROUTER_API_KEY", "NEWSAPI_KEY"):     # the evaluation never calls a network service
    os.environ[k] = ""

from impactgraph import hierarchy as H, kb, propagate as pg, timeseries as ts   # noqa: E402
from impactgraph.service import SAMPLES, Analyzer                               # noqa: E402

# The 5 built-in samples plus 5 short articles covering other event types (the same 10 used in the design study).
EXTRA = [
    "The Federal Reserve raised interest rates by 25 basis points and signalled more hikes if inflation stays high.",
    "OPEC+ agreed to cut oil output by 1 million barrels a day, sending Brent crude up 6%.",
    "The Reserve Bank of India cut the repo rate by 25 basis points to support growth.",
    "Gold jumped 4% as investors sought safety after a banking scare; the US dollar weakened.",
    "Delta Air Lines shares fell 8% after the company warned on fuel costs.",
]
TEXTS = [s["text"] for s in SAMPLES] + EXTRA
IDS = [s["id"] for s in SAMPLES] + ["fed25", "opec_cut", "rbi_cut", "gold_usd", "delta_fuel"]


def static_analyzer():
    """A fresh analyzer frozen at the curated baseline, so results do not depend on the order articles are read in."""
    a = Analyzer(persist=False)
    a.guard.set_mode("static")
    return a


def kind(g, u, v):
    return H.edge_kind(g.nodes[u]["type"], g.nodes[v]["type"])["kind"]


# ---------------------------------------------------------------------------------------------------------------
def e1_graph_stats():
    g = static_analyzer().kg.g
    nodes = list(g.nodes(data=True))
    edges = list(g.edges(data=True))
    st = [e["strength"] for _, _, e in edges]
    return {
        "entities": len(nodes), "links": len(edges),
        "aliases": sum(len(kb.NODES[n]["aliases"]) for n, _ in nodes),
        "entities_by_tier": dict(collections.Counter(d["tier"] for _, d in nodes)),
        "entities_by_type": dict(collections.Counter(d["type"] for _, d in nodes)),
        "entities_by_market": dict(collections.Counter(d["market"] for _, d in nodes)),
        "entities_with_market_series": sum(1 for _, d in nodes if d.get("series")),
        "links_by_relation": dict(collections.Counter(H.rel(g, u, v) for u, v, _ in edges)),
        "links_by_tier_crossing": dict(collections.Counter(kind(g, u, v) for u, v, _ in edges)),
        "links_positive": sum(1 for _, _, e in edges if e["sign"] > 0),
        "links_negative": sum(1 for _, _, e in edges if e["sign"] < 0),
        "strength_min": min(st), "strength_median": statistics.median(st), "strength_max": max(st),
        "lag_days_median": statistics.median(e["lag"] for _, _, e in edges),
    }


# ---------------------------------------------------------------------------------------------------------------
VARIANTS = [
    ("flat graph (as built)", set()),
    ("no feedback links", {"feedback"}),
    ("no tier skips", {"skip"}),
    ("no feedback, no skips", {"feedback", "skip"}),
    ("strict layers (next tier only)", {"feedback", "skip", "lateral"}),
]


def _run_variant(drop):
    a = static_analyzer()
    g = a.kg.g
    for u, v in [(u, v) for u, v in g.edges if kind(g, u, v) in drop]:
        g.remove_edge(u, v)
    return [a.analyze(t, live=False, use_llm=False) for t in TEXTS], g.number_of_edges()


def e2_ablation():
    base, _ = _run_variant(set())
    rows = []
    for name, drop in VARIANTS:
        res, n_links = _run_variant(drop)
        t = collections.Counter()
        top5 = []
        for b, r in zip(base, res):
            ba = {x["node"]: x for x in b.get("assets", [])}
            ra = {x["node"]: x for x in r.get("assets", [])}
            t["paths"] += len(r.get("paths", []))
            t["asset_results"] += len(ra)
            t["lost"] += len(set(ba) - set(ra))
            t["gained"] += len(set(ra) - set(ba))
            t["flips"] += sum(1 for n in set(ba) & set(ra) if ba[n]["direction"] != ra[n]["direction"])
            t["articles_reaching_no_asset"] += int(bool(ba) and not ra)
            tb = [x["node"] for x in b.get("assets", [])[:5]]
            if tb:
                tr = [x["node"] for x in r.get("assets", [])[:5]]
                top5.append(len(set(tb) & set(tr)) / len(tb))
        rows.append({"variant": name, "links": n_links, "paths": t["paths"], "asset_results": t["asset_results"],
                     "asset_results_lost": t["lost"], "asset_results_gained": t["gained"], "direction_flips": t["flips"],
                     "top5_overlap": round(statistics.mean(top5), 3) if top5 else None,
                     "articles_reaching_no_asset": t["articles_reaching_no_asset"]})
    # how the flat graph's paths use the tiers
    comp = collections.Counter()
    for r in base:
        byid = {p["id"]: p for p in r.get("paths", [])}
        for p in r.get("paths", []):
            ks = {s["step_kind"] for s in p["steps"]}
            comp["paths"] += 1
            comp["paths_with_lateral"] += "lateral" in ks
            comp["paths_with_skip"] += "skip" in ks
            comp["paths_with_feedback"] += "feedback" in ks
        for row in r.get("assets", []):
            bp = byid.get(row.get("best_path_id"))
            if bp:
                ks = {s["step_kind"] for s in bp["steps"]}
                comp["asset_best_paths"] += 1
                comp["asset_best_with_lateral"] += "lateral" in ks
                comp["asset_best_with_skip"] += "skip" in ks
    return {"articles": len(TEXTS), "baseline_asset_results": rows[0]["asset_results"], "variants": rows,
            "path_composition": dict(comp)}


# ---------------------------------------------------------------------------------------------------------------
def e3_validation():
    a = static_analyzer()
    g = a.kg.g
    rows = []
    for u, v, e in g.edges(data=True):
        val = ts.validate_edge(a.kg, u, v, live=False)
        rows.append({"link": "%s -> %s" % (u, v), "sign": e["sign"], "relation": H.rel(g, u, v), "verdict": val["verdict"],
                     "simulated": bool(val.get("simulated")), "r": val.get("corr"), "lag_days": val.get("lag_days"),
                     "n": val.get("n"), "data": val.get("data")})
    real = [r for r in rows if not r["simulated"]]
    by = collections.Counter(r["verdict"] for r in real)
    groups = {}
    for name, rels in (("causal (causes, policy_reaction)", ("causes", "policy_reaction")),
                       ("structural (member_of, tracks, weight_in)", ("member_of", "tracks", "weight_in"))):
        xs = [r for r in rows if r["relation"] in rels]
        rx = [r for r in xs if not r["simulated"]]
        s = [abs(r["r"]) for r in rx if r["verdict"] == "supported"]
        groups[name] = {"links": len(xs), "simulated_only": len(xs) - len(rx),
                        "verdicts": dict(collections.Counter(r["verdict"] for r in rx)),
                        "supported_abs_r_median": round(statistics.median(s), 3) if s else None}
    sup = [abs(r["r"]) for r in real if r["verdict"] == "supported"]
    ns = [r["n"] for r in real if r["n"]]
    dates = []
    for n in g.nodes:
        got = ts.get_returns(n, live=False)
        if got and not got[2]["simulated"]:
            dates += [got[0][0], got[0][-1]]
    return {"links": len(rows), "checked_on_simulated_data_only": len(rows) - len(real),
            "verdicts_on_real_data": dict(by), "by_link_type": groups,
            "testable_links": by["supported"] + by["contradicted"] + by["inconclusive"],
            "supported_abs_r_median": round(statistics.median(sup), 3) if sup else None,
            "supported_abs_r_min": round(min(sup), 3) if sup else None,
            "supported_abs_r_max": round(max(sup), 3) if sup else None,
            "overlap_days_median": statistics.median(ns) if ns else None,
            "data_window": [min(dates), max(dates)] if dates else None,
            "contradicted": [r for r in real if r["verdict"] == "contradicted"],
            "all": rows}


# ---------------------------------------------------------------------------------------------------------------
def e4_reproducibility():
    """Validate links on cached real data (as an analysis with data would), then recompute every path score from its links."""
    a = static_analyzer()
    for u, v in list(a.kg.g.edges):
        a.kg.set_validation(u, v, ts.validate_edge(a.kg, u, v, live=False))
    worst, n = 0.0, 0
    for t in TEXTS:
        r = a.analyze(t, live=False, use_llm=False)
        for p in r.get("paths", []):
            score = 1.0
            for i, st in enumerate(p["steps"]):
                score *= a.kg.eff_strength(st["from"], st["to"]) * (pg._edge_decay(a.kg.g[st["from"]][st["to"]]) if i else 1.0)
            worst = max(worst, abs(round(score, 3) - p["score"]))
            n += 1
    return {"paths_checked": n, "max_abs_difference": worst}


# ---------------------------------------------------------------------------------------------------------------
def e5_model_vs_article():
    a = static_analyzer()
    per, tot = [], collections.Counter()
    for i, t in zip(IDS, TEXTS):
        r = a.analyze(t, live=False, use_llm=False)
        ev = r.get("events", [])
        c = collections.Counter(x["verdict"] for x in r.get("comparison", []))
        tot.update(c)
        per.append({"article": i, "events": len(ev), "observed": sum(1 for x in ev if x["status"] == "observed"),
                    "expected": sum(1 for x in ev if x["status"] == "expected"), "paths": len(r.get("paths", [])),
                    "assets": len(r.get("assets", [])), "sectors": len(r.get("sectors", [])),
                    "mixed_assets": sum(1 for x in r.get("assets", []) if x["mixed"]),
                    "comparison": dict(c),
                    "extracted": ["%s [%s]" % (x["label"], x["status"]) for x in ev],
                    "disagreements": ["%s: article %s, graph %s (%s)" % (x["label"], x["stated"], x["predicted"], x["verdict"])
                                      for x in r.get("comparison", []) if x["verdict"] != "consistent"]})
    return {"per_article": per, "comparison_totals": dict(tot)}


# ---------------------------------------------------------------------------------------------------------------
def _signature(g):
    return (sorted(g.nodes), sorted((u, v, e["sign"], round(e["strength"], 6)) for u, v, e in g.edges(data=True)))


def e6_guard():
    a = Analyzer(persist=False)       # dynamic mode: the guard judges every change
    g0 = a.kg.g
    asset = "delta"

    def flip_sign():
        a.kg.g["crude_oil"]["airlines"]["sign"] *= -1

    def drop_entity():
        a.kg.g.remove_node("tlt")

    def bad_strength():
        a.kg.g["rate_exp"]["us10y"]["strength"] = 1.5

    def self_loop():
        a.kg.g.add_edge("gold", "gold", sign=1, strength=.5, base_strength=.5, lag=0, mechanism="x", provenance=["inferred"],
                        evidence=[], validation=None, inferred=True, relation="causes")

    def upward_from_asset():
        a.kg.g.add_edge(asset, "crude_oil", sign=1, strength=.4, base_strength=.4, lag=1, mechanism="x",
                        provenance=["llm_proposed"], evidence=[], validation=None, inferred=True, relation="causes")

    def too_much_growth():
        pairs = [("copper", t) for t in ("airlines", "banks", "real_estate", "autos", "fmcg", "chemicals", "utilities",
                                         "shipping", "it_services")]
        for u, v in pairs:
            a.kg.g.add_edge(u, v, sign=1, strength=.3, base_strength=.3, lag=1, mechanism="x", provenance=["llm_proposed"],
                            evidence=[], validation=None, inferred=True, relation="causes")

    def suppress_key_links():          # same signs, but the oil links that drive the sample conclusions are hollowed out
        for v in list(a.kg.g.successors("crude_oil")):
            a.kg.g["crude_oil"][v]["strength"] = 0.01

    def benign_reinforce():            # what an article normally does: a small step toward 0.97
        e = a.kg.g["crude_oil"]["airlines"]
        e["strength"] = round(e["strength"] + (0.97 - e["strength"]) * 0.05, 4)

    def benign_new_link():
        a.kg.g.add_edge("copper", "chemicals", sign=1, strength=.35, base_strength=.35, lag=1, mechanism="x",
                        provenance=["llm_proposed"], evidence=[], validation=None, inferred=True, relation="causes")

    cases = [("flip the sign of a curated link", flip_sign, True), ("delete a curated entity", drop_entity, True),
             ("strength out of range", bad_strength, True), ("self-loop", self_loop, True),
             ("learned link pointing up from an asset", upward_from_asset, True),
             ("9 new links in one change", too_much_growth, True),
             ("hollow out the oil links (signs kept)", suppress_key_links, True),
             ("reinforce one link (normal learning)", benign_reinforce, False),
             ("one new LLM-proposed link", benign_new_link, False)]
    out = []
    for name, fn, should_fail in cases:
        before = a.guard.begin()
        sig = _signature(a.kg.g)
        fn()
        rep = a.guard.finish(before, name, actor="system", action="ingest")
        restored = _signature(a.kg.g) == sig
        out.append({"change": name, "corrupting": should_fail, "rolled_back": rep["rolled_back"],
                    "graph_restored_exactly": restored if rep["rolled_back"] else None,
                    "failed_checks": [c["name"] for c in rep["failed"]],
                    "correct": rep["rolled_back"] == should_fail and (restored or not rep["rolled_back"])})
        if not rep["rolled_back"]:
            a.guard.revert("previous")  # keep each case independent
    del g0
    return {"cases": out, "correct": sum(c["correct"] for c in out), "total": len(out)}


# ---------------------------------------------------------------------------------------------------------------
def e8_assistant_retrieval():
    """Does the assistant's card retrieval find multi-hop chains?

    (a) Two-entity questions: for every (event or variable) -> (sector or asset) pair joined by a chain of score >= 0.03 within 5
        hops, does retrieval return the best chain an exhaustive search finds?
    (b) One-entity questions ("what happens if X rises?"): how deep and how varied are the chains it retrieves?"""
    import networkx as nx
    from impactgraph import assistant, cards
    a = static_analyzer()
    kg, g = a.kg, a.kg.g
    drivers = sorted(n for n, d in g.nodes(data=True) if d["tier"] in ("event", "variable"))
    targets = sorted(n for n, d in g.nodes(data=True) if d["tier"] in ("sector", "asset"))
    pairs = found = 0
    hops = collections.Counter()
    for s in drivers:
        for t in targets:
            best = None
            for p in nx.all_simple_paths(g, s, t, cutoff=5):
                pp = cards.path_from_nodes(kg, p)
                if pp["score"] >= 0.03 and (best is None or pp["score"] > best["score"]):
                    best = pp
            if not best:
                continue
            pairs += 1
            hops[len(best["edges"])] += 1
            got = cards.find_paths(kg, s, t, 2)
            found += bool(got) and abs(got[0]["score"] - best["score"]) < 1e-9
    single = []
    for s in drivers:
        ps = [c for c in assistant.build_cards(kg, [s]) if c["kind"] == "path"]
        if not ps:
            continue
        nodes = [c["refs"] for c in ps]
        usable = {p["nodes"][1] for p in pg._dfs(kg, s, 1, set(), 5, 0.03, 300)
                  if g.nodes[p["nodes"][-1]]["tier"] in ("asset", "sector") and len(p["edges"]) >= 2}
        single.append({"entity": s, "paths": len(ps), "max_hops": max(len(n) - 1 for n in nodes), "usable_first_links": len(usable),
                       "distinct_first_hops": len({n[1] for n in nodes}),
                       "reaches_a_variable": any(g.nodes[x]["tier"] == "variable" for n in nodes for x in n[1:])})
    return {"two_entity": {"pairs_with_a_chain": pairs, "best_chain_retrieved": found, "best_chain_hops": dict(sorted(hops.items()))},
            "one_entity": {"entities": len(single),
                           "paths_median": statistics.median(x["paths"] for x in single),
                           "all_paths_share_one_first_hop": sum(1 for x in single if x["distinct_first_hops"] == 1),
                           "uses_every_usable_first_link": sum(1 for x in single if x["distinct_first_hops"] >= min(x["paths"], x["usable_first_links"])),
                           "max_hops_median": statistics.median(x["max_hops"] for x in single),
                           "reach_another_variable": sum(1 for x in single if x["reaches_a_variable"]),
                           "detail": single}}


# ---------------------------------------------------------------------------------------------------------------
def e7_latency():
    a = static_analyzer()
    for t in TEXTS:                    # warm the in-memory series cache once
        a.analyze(t, live=False, use_llm=False)
    times = []
    for _ in range(3):
        for t in TEXTS:
            t0 = time.perf_counter()
            a.analyze(t, live=False, use_llm=False)
            times.append(time.perf_counter() - t0)
    return {"runs": len(times), "median_s": round(statistics.median(times), 3), "max_s": round(max(times), 3),
            "note": "rules-only, cached data, warm in-memory cache; excludes the LLM call (13-35 s observed with the LLM on)"}


def main():
    t0 = time.time()
    res = {"generated": time.strftime("%Y-%m-%d %H:%M:%S"), "python": sys.version.split()[0],
           "E1_graph": e1_graph_stats(), "E2_ablation": e2_ablation(), "E3_validation": e3_validation(),
           "E4_reproducibility": e4_reproducibility(), "E5_model_vs_article": e5_model_vs_article(),
           "E6_guard": e6_guard(), "E7_latency": e7_latency(), "E8_assistant_retrieval": e8_assistant_retrieval()}
    res["runtime_s"] = round(time.time() - t0, 1)
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(res, f, indent=2, default=str)
    brief = {k: v for k, v in res.items()}
    brief["E3_validation"] = {k: v for k, v in res["E3_validation"].items() if k != "all"}
    print(json.dumps(brief, indent=2, default=str))
    print("\nwritten to", path)


if __name__ == "__main__":
    main()
