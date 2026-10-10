"""Orchestrates the pipeline: text -> events -> graph update -> propagation -> explanation."""
import hashlib
import os
from concurrent.futures import ThreadPoolExecutor

from . import extract as ex
from . import kb, llm, propagate as pg, timeseries as ts
from .graph import KnowledgeGraph

ASSET_TYPES = ("company", "instrument", "index")
ARROW = {1: "↑", -1: "↓"}

SAMPLES = [
    {"id": "oil", "title": "Oil spike after Hormuz tanker attack (US + India)",
     "text": "Brent crude jumped 12% on Monday after an attack on tankers near the Strait of Hormuz raised fears of a supply disruption. "
             "OPEC+ signalled it would keep its output cuts in place. Analysts warned that higher energy costs could lift inflation expectations "
             "and push central banks to keep interest rates higher for longer. Airline stocks fell sharply, with Delta Air Lines among the biggest "
             "decliners, while ExxonMobil and ONGC gained. The rupee weakened as India's import bill is expected to widen."},
    {"id": "fed", "title": "Fed hikes 50 bps, dollar jumps",
     "text": "The Federal Reserve raised interest rates by 50 basis points on Wednesday, more than markets had expected. "
             "The dollar index jumped 1.2% and 10-year yields rose as investors priced in a longer period of tight policy. "
             "Real estate stocks fell, while analysts said banks could benefit from wider lending margins."},
    {"id": "rbi", "title": "RBI tightens rules for banks",
     "text": "The RBI imposed tighter rules on banks, raising risk weights on unsecured consumer loans. "
             "Bank stocks fell 2.5% as lenders flagged higher capital requirements. HDFC Bank and State Bank of India slid in early trade. "
             "Analysts said the move could slow credit growth and weigh on consumer spending."},
    {"id": "gold", "title": "Gold rallies on Middle East escalation",
     "text": "Gold rallied 3.4% as military conflict in the Middle East escalated and investors fled to safe havens. "
             "US stocks slipped while Treasury yields fell. Analysts warned that a prolonged conflict could push oil higher and "
             "revive inflation fears."},
    {"id": "gas", "title": "Natural gas surge hits chemicals",
     "text": "Natural gas surged 18% after cold weather and supply outages. Chemical makers warned that higher feedstock costs "
             "could squeeze margins, and utilities were expected to pass on part of the increase to customers."},
]


def llm_required():
    return os.environ.get("ZENITH_REQUIRE_LLM", "1").strip().lower() not in ("0", "false", "no")


def _fmt(label, d):
    return "%s %s" % (label, ARROW[d])


class Analyzer:
    def __init__(self):
        self.kg = KnowledgeGraph()

    def reset(self):
        self.kg.reset()
        ts.clear_memory_cache()

    # ------------------------------------------------------------------------------------------
    def _build_sources(self, events):
        best = {}
        for e in events:
            if not e["direction"]:
                continue
            k = (e["trigger"], e["type"] == "price_move")
            if k not in best or e["confidence"] > best[k]["confidence"]:
                best[k] = e
        sources, claims = [], []
        for (trig, is_price), e in best.items():
            if is_price and e["status"] == "expected":
                claims.append(e)
                continue
            sources.append({"id": e["id"], "trigger": trig, "direction": e["direction"], "intensity": e["intensity"],
                            "anchor": is_price and e["status"] == "observed", "label": e["label"], "event": e,
                            "market": e.get("market")})
        # an observed move and a cause-event on the same node must not both propagate (double count)
        anchor_trig = {x["trigger"]: x for x in sources if x["anchor"]}
        keep = []
        for x in sources:
            a = anchor_trig.get(x["trigger"])
            if a is not None and not x["anchor"] and a["direction"] == x["direction"]:
                a["cause"] = x["label"]
                a["market"] = a.get("market") or x.get("market")
                continue
            keep.append(x)
        return keep, claims

    def _prefetch(self, nodes, live):
        with ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(lambda n: ts.get_returns(n, live), nodes))

    def _explain_path(self, p, pid, src_label):
        kg, steps = self.kg, []
        prod = 1
        for (u, v) in p["edges"]:
            prod *= kg.g[u][v]["sign"]
        src_dir = p["sign"] * prod  # the path sign already includes the source direction
        cur = src_dir
        head = [_fmt(kg.g.nodes[p["nodes"][0]]["label"], cur)]
        for (u, v) in p["edges"]:
            e = kg.g[u][v]
            cur *= e["sign"]
            steps.append({"from": u, "to": v, "from_label": kg.g.nodes[u]["label"], "to_label": kg.g.nodes[v]["label"],
                          "to_dir": cur, "sign": e["sign"], "strength": round(e["strength"], 3),
                          "effective": round(kg.eff_strength(u, v), 3), "lag": e["lag"], "mechanism": e["mechanism"],
                          "provenance": e["provenance"], "validation": e.get("validation"),
                          "evidence": [ev["sentence"] for ev in e["evidence"][-2:]]})
            head.append(_fmt(kg.g.nodes[v]["label"], cur))
        return {"id": pid, "source": src_label, "score": round(p["score"], 3), "horizon_days": p["lag"],
                "end": p["nodes"][-1], "end_label": kg.g.nodes[p["nodes"][-1]]["label"], "end_dir": cur,
                "headline": " → ".join(head), "steps": steps, "hops": len(p["edges"])}

    # ------------------------------------------------------------------------------------------
    def analyze(self, text, live=False, use_llm=False):
        text = (text or "").strip()
        if not text:
            return {"error": "empty text"}
        art_id = hashlib.sha1(text.encode("utf-8")).hexdigest()[:10]
        extraction = ex.extract(text)
        events = extraction["events"]
        llm_note, llm_links = None, []
        if llm_required() or use_llm:
            if not llm.available():
                if llm_required():
                    return {"error": "An LLM is required to build the graph. Set GROQ_API_KEY or OPENROUTER_API_KEY "
                                     "(in .env or the environment), or set ZENITH_REQUIRE_LLM=0 for rules-only mode."}
                llm_note = "No GROQ_API_KEY / OPENROUTER_API_KEY set; rules only."
            else:
                extra, llm_links = llm.extract_events(text), llm.extract_links(text)
                if extra is None or llm_links is None:
                    if llm_required():
                        return {"error": "The LLM call failed (check the API key, model name and network); "
                                         "graph building requires it."}
                    llm_note, llm_links = "LLM call failed; rules only.", []
                else:
                    have = {(e["trigger"], e["direction"]) for e in events}
                    for e in extra:
                        if (e["trigger"], e["direction"]) not in have:
                            e["id"] = "ev%d" % (len(events) + 1)
                            events.append(e)
                    llm_note = "LLM added %d event(s) and proposed %d quote-verified link(s)." % (
                        sum(1 for e in events if e["source"] == "llm"), len(llm_links))

        changes = self.kg.ingest(art_id, text, extraction)
        changes += self.kg.add_llm_links(art_id, llm_links)
        sources, claims = self._build_sources(events)
        result = {"article_id": art_id, "events": events, "mentions": [
            {"node": m["node"], "label": kb.NODES[m["node"]]["label"], "type": kb.NODES[m["node"]]["type"],
             "text": m["text"], "start": m["start"], "end": m["end"]} for m in extraction["mentions"]],
            "unlinked": extraction["unlinked"], "graph_changes": changes, "graph_stats": self.kg.stats(),
            "llm_note": llm_note, "text": text}
        if not sources:
            result.update({"paths": [], "assets": [], "sectors": [], "variables": [], "graph": {"nodes": [], "links": []},
                           "comparison": [], "summary": "No actionable financial event was detected in this text.",
                           "caveats": self._caveats(live, None)})
            return result

        # pass 1: propagate on priors, then validate the edges that matter against data
        paths = pg.propagate(self.kg, sources)
        edges = {e for p in paths[:80] for e in p["edges"]}
        nodes = {n for e in edges for n in e}
        self._prefetch(nodes, live)
        for (u, v) in edges:
            self.kg.set_validation(u, v, ts.validate_edge(self.kg, u, v, live))
        # pass 2: propagate again with data-adjusted strengths
        paths = pg.propagate(self.kg, sources)
        trig_nonanchor = {s["trigger"] for s in sources if not s["anchor"]}
        agg = pg.aggregate(paths, exclude=trig_nonanchor)

        top = []
        seen = set()
        # informative multi-hop chains first; 1-hop "member of" links are shown but not favoured
        def _interest(p):
            trivial = all(kg_.g[u][v]["lag"] == 0 for u, v in p["edges"])  # membership / index-weight links
            return -(p["score"] * (1 + 0.25 * min(len(p["edges"]) - 1, 3)) * (0.5 if trivial else 1))
        kg_ = self.kg
        paths = sorted(paths, key=_interest)
        for p in paths:
            key = tuple(p["nodes"])
            if key in seen:
                continue
            seen.add(key)
            top.append(p)
            if len(top) >= 40:
                break
        src_label = {s["id"]: s["label"] for s in sources}
        explained = [self._explain_path(p, i, src_label[p["source_id"]]) for i, p in enumerate(top)]
        pid_of = {tuple(p["nodes"]): i for i, p in enumerate(top)}

        # per-node summaries
        anchors = {s["trigger"]: s for s in sources if s["anchor"]}
        label = lambda n: self.kg.g.nodes[n]["label"]
        rows = []
        for n, a in agg.items():
            bp = a["best_path"]
            exp = explained[pid_of[tuple(bp["nodes"])]] if tuple(bp["nodes"]) in pid_of else self._explain_path(bp, -1, src_label[bp["source_id"]])
            last = exp["steps"][-1] if exp["steps"] else None
            sp = ts.sparkline(n, live)
            row = {"node": n, "label": label(n), "type": self.kg.g.nodes[n]["type"], "direction": a["direction"],
                   "confidence": a["confidence"], "confidence_label": a["confidence_label"], "mixed": a["mixed"],
                   "agreement": a["agreement"], "horizon_days": a["horizon_days"], "sensitivity": a["sensitivity_label"],
                   "n_paths": a["n_paths"], "best_path_id": pid_of.get(tuple(bp["nodes"])), "headline": exp["headline"],
                   "why": last["mechanism"] if last else "", "observed": n in anchors,
                   "inferred_node": bool(self.kg.g.nodes[n].get("inferred")),
                   "spark": sp}
            rows.append(row)
        rank = lambda r: -(r["confidence"] * {"strong": 1.0, "moderate": 0.75, "mild": 0.5}[r["sensitivity"]])
        assets = sorted([r for r in rows if r["type"] in ASSET_TYPES], key=rank)
        sectors = sorted([r for r in rows if r["type"] == "sector"], key=rank)
        variables = sorted([r for r in rows if r["type"] in ("indicator", "commodity")], key=rank)

        # observed / expected statements vs what the model predicts
        comparison = []
        for e in [s["event"] for s in sources if s["anchor"]] + claims:
            a = agg.get(e["trigger"])
            if e["trigger"] in anchors and a is None:
                verdict, pred = "no_upstream_path", None
            elif a is None:
                verdict, pred = "model_has_no_path", None
            else:
                pred = a["direction"]
                verdict = "consistent" if pred == e["direction"] else "contradicts"
                if a["mixed"]:
                    verdict = "model_mixed"
            comparison.append({"node": e["trigger"], "label": label(e["trigger"]), "stated": e["direction"],
                               "status": e["status"], "predicted": pred, "verdict": verdict, "quote": e["quote"]})

        graph = self._viz(top[:26], explained[:26], sources, agg, anchors, events)  # keep the picture readable
        sparks = {}
        for s in sources:
            sp = ts.sparkline(s["trigger"], live)
            if sp:
                sparks[s["trigger"]] = sp
        result.update({"sources": [{k: v for k, v in s.items() if k != "event"} for s in sources],
                       "paths": explained, "assets": assets, "sectors": sectors, "variables": variables,
                       "comparison": comparison, "graph": graph, "sparks": sparks,
                       "data_modes": sorted({(ts.get_returns(n, live) or (0, 0, {"mode": "none"}))[2]["mode"] for n in nodes}),
                       "macro": ts.macro_snapshot(live) if live else [],
                       "caveats": self._caveats(live, nodes)})
        result["summary"] = self._summary(result, sources, assets, sectors, comparison, use_llm or llm_required())
        return result

    # ------------------------------------------------------------------------------------------
    def _viz(self, top, explained, sources, agg, anchors, events):
        kg = self.kg
        nodes, links = {}, {}
        for p, ex_ in zip(top, explained):
            for n in p["nodes"]:
                nodes.setdefault(n, None)
            for i, (u, v) in enumerate(p["edges"]):
                k = (u, v)
                if k not in links:
                    e = kg.g[u][v]
                    val = e.get("validation") or {}
                    links[k] = {"source": u, "target": v, "sign": e["sign"], "strength": round(kg.eff_strength(u, v), 3),
                                "lag": e["lag"], "provenance": e["provenance"], "inferred": e.get("inferred", False),
                                "verdict": val.get("verdict"), "paths": []}
                links[k]["paths"].append(ex_["id"])
        out_nodes = []
        trig = {s["trigger"]: s for s in sources}
        for n in nodes:
            d = kg.g.nodes[n]
            a = agg.get(n)
            direction, conf, eta = None, None, None
            if n in trig:
                direction = trig[n]["direction"]
            elif a:
                direction = a["direction"]
            if a:
                conf, eta = a["confidence"], a["horizon_days"]
            out_nodes.append({"id": n, "label": d["label"], "type": d["type"], "direction": direction,
                              "confidence": conf, "eta": 0 if n in trig else eta, "observed": n in anchors,
                              "source": n in trig, "mixed": bool(a and a["mixed"]), "inferred": bool(d.get("inferred"))})
        out_links = list(links.values())
        # event nodes, linked to the entity they report on
        for s in sources:
            e = s["event"]
            eid = "event:" + s["id"]
            out_nodes.append({"id": eid, "label": e["label"], "type": "event", "direction": e["direction"],
                              "confidence": e["confidence"], "eta": 0, "observed": e["status"] == "observed",
                              "source": False, "mixed": False, "inferred": e["source"] == "llm", "quote": e["quote"]})
            out_links.append({"source": eid, "target": s["trigger"], "sign": e["direction"], "strength": 1.0, "lag": 0,
                              "provenance": ["observed" if e["status"] == "observed" else "expected"], "inferred": False,
                              "verdict": None, "paths": [], "kind": "reports"})
        return {"nodes": out_nodes, "links": out_links}

    def _caveats(self, live, nodes):
        c = ["Scores are heuristic plausibility from curated priors plus evidence, not probabilities or forecasts.",
             "Observed = stated as having happened in the text. Everything downstream of it is inferred.",
             "Correlation checks do not establish causation, and relationships change across regimes.",
             "Not investment advice."]
        if not live:
            c.append("Live market data is off: only cached real data (if any) or clearly labelled simulated data is shown, "
                     "and simulated data never changes confidence.")
        return c

    def _summary(self, res, sources, assets, sectors, comparison, use_llm):
        obs = [s["label"] for s in sources if s["event"]["status"] == "observed"]
        scen = [s["label"] for s in sources if s["event"]["status"] != "observed"]
        pick = lambda rows, n: ["%s %s (%s confidence%s)" % (r["label"], ARROW[r["direction"]], r["confidence_label"],
                                                              ", mixed signals" if r["mixed"] else "") for r in rows[:n]]
        facts = {"observed_events": obs, "expected_scenarios": scen,
                 "top_assets": pick(assets, 5), "top_sectors": pick(sectors, 4),
                 "model_vs_article": [{"item": c["label"], "verdict": c["verdict"]} for c in comparison]}
        if use_llm and llm.available():
            txt = llm.summarise(facts)
            if txt:
                return txt.strip()
        parts = []
        if obs:
            parts.append("Reported (observed): " + "; ".join(obs) + ".")
        if scen:
            parts.append("Hedged / scenario: " + "; ".join(scen) + ".")
        if facts["top_sectors"]:
            parts.append("Inferred sector effects that may follow: " + "; ".join(facts["top_sectors"]) + ".")
        if facts["top_assets"]:
            parts.append("Potentially affected assets: " + "; ".join(facts["top_assets"]) + ".")
        ok = sum(1 for c in comparison if c["verdict"] == "consistent")
        bad = [c["label"] for c in comparison if c["verdict"] == "contradicts"]
        if comparison:
            parts.append("Cross-check with the article: %d statement(s) consistent with the graph%s." % (
                ok, "; the graph disagrees on " + ", ".join(bad) if bad else ""))
        return " ".join(parts)
