"""Orchestrates the pipeline: text -> events -> graph update -> propagation -> explanation."""
import hashlib
import os
from concurrent.futures import ThreadPoolExecutor

from . import extract as ex
from . import kb, llm, propagate as pg, quotes, timeseries as ts, feeds
from . import context as ctxmod
from . import enrich
from .graph import KnowledgeGraph
from .kbstate import KBGuard

ASSET_TYPES = ("company", "instrument", "index")
VIZ_PATHS = 40   # paths drawn in the graph (was 26: that capped every graph at ~25-29 nodes)
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
    def __init__(self, persist=False):
        self.kg = KnowledgeGraph()
        self.guard = KBGuard(self.kg, persist=persist)
        self.guard.load()

    def reset(self):
        """Back to the curated static baseline (also removes runtime assets)."""
        self.guard.revert("static")
        ts.clear_memory_cache()

    # ------------------------------------------------------------------------------------------
    def add_asset(self, ticker, name=None, sector=None, verify=True):
        """Add a market asset to the live graph: validated against Yahoo, linked from a sector, guarded."""
        t = (ticker or "").strip().upper()
        if not quotes.valid_symbol(t):
            return {"error": "not a valid ticker symbol: %r" % ticker}
        if self.guard.mode == "static":
            return {"error": "The knowledge base is in static mode (learning frozen). Switch to dynamic to add assets."}
        for nid in kb.NODES:
            if (kb.yf_symbol(nid) or "").upper() == t:
                return {"error": "%s is already in the graph as %s" % (t, kb.NODES[nid]["label"])}
        quote = None
        if verify:
            quote = quotes.HUB.fetch_now([t]).get(t)
            if not quote or quote.get("error"):
                return {"error": "Could not verify %s on Yahoo Finance: %s" % (t, (quote or {}).get("error", "no quote"))}
        sectors = [n for n, d in kb.NODES.items() if d["type"] == "sector"]
        how = "chosen by you"
        if sector and sector not in sectors:
            return {"error": "unknown sector: %s" % sector}
        label = (name or "").strip() or t
        if not sector:
            sector, how = llm.suggest_sector(label, t, sectors), "suggested by the LLM"
            if not sector:
                low = label.lower()
                sector = next((s for kws, s in kb.SECTOR_KEYWORDS if any(k in low for k in kws)), None)
                how = "matched from the name" if sector else "none"
        nid = "u_" + "".join(c for c in t.lower() if c.isalnum())
        typ = "index" if t.startswith("^") else "company"
        aliases = ["!" + t] if len(t) >= 3 and not t.startswith("^") else []
        if name and len(name.strip()) >= 3:
            aliases.append(name.strip())
        spec = {"id": nid, "label": label, "type": typ, "aliases": aliases, "series": [("yf", t, "ret")], "kind": None}
        before = self.guard.begin()
        kb.NODES[nid] = spec
        KBGuard._nodes_changed()
        changes = self.kg.add_asset(spec, sector)
        report = self.guard.finish(before, "added asset %s (%s)" % (label, t))
        if report["rolled_back"]:
            return {"error": "The knowledge-base guard rolled this addition back: " +
                    "; ".join(c["name"] for c in report["failed"]), "guard": report}
        return {"node": nid, "label": label, "ticker": t, "type": typ, "sector": sector,
                "sector_label": kb.NODES[sector]["label"] if sector else None, "sector_source": how,
                "linked": bool(sector), "quote": quote, "changes": changes, "guard": report,
                "note": None if sector else "No sector link: the asset is tracked for live prices but will not appear in impact "
                                              "tables until it is connected to something in the graph."}

    def remove_asset(self, node_id):
        if node_id in kb.STATIC_IDS or node_id not in kb.NODES:
            return {"error": "only assets you added can be removed"}
        before = self.guard.begin()
        label = kb.NODES[node_id]["label"]
        del kb.NODES[node_id]
        KBGuard._nodes_changed()
        self.kg.remove_node(node_id)
        report = self.guard.finish(before, "removed asset %s" % label)
        return {"ok": not report["rolled_back"], "guard": report}

    def update_edge(self, source, target, weight=None, strength=None, sign=None):
        """Update transmission weight/strength of an edge in the graph."""
        if not self.kg.g.has_edge(source, target):
            return {"error": "Edge (%s -> %s) does not exist in graph." % (source, target)}
        if weight is not None:
            w = float(weight)
            sign = -1 if w < 0 else 1
            strength = abs(w)
        if strength is not None:
            strength = max(0.01, min(0.99, float(strength)))
        res = self.kg.update_edge_weight(source, target, strength=strength, sign=sign)
        self.guard.version += 1
        self.guard.save()
        self.guard._note("edit-edge", "%s -> %s weight adjusted to %.2f" % (source, target, res["effective_weight"]))
        return {
            "ok": True,
            "source": source,
            "target": target,
            "strength": res["strength"],
            "sign": res["sign"],
            "effective_weight": res["effective_weight"],
            "before_strength": res["before_strength"],
        }

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
    def analyze(self, text, live=False, use_llm=False, link=None, full_text=False, title=None):
        text = (text or "").strip()
        if not text:
            return {"error": "empty text"}
        input_info = {"snippet_chars": len(text), "full_article": False, "article_chars": 0, "note": None,
                      "quality": "pasted", "sources": []}
        if text.startswith("http://") or text.startswith("https://"):
            fa = feeds.fetch_article(text.split()[0])
            if not fa["ok"]:
                return {"error": "Could not read that article: %s. Paste the text instead." % fa["reason"]}
            text = (fa["title"] + ".\n\n" + fa["text"]).strip()
            input_info.update(snippet_chars=0, full_article=True, article_chars=len(fa["text"]), quality="article",
                              sources=["article body (%d characters)" % len(fa["text"])])
        elif title or link:           # a headline from a feed: fall back through every source of real text
            enr = enrich.build(title, text, link, full_text)
            text = enr["text"]
            input_info.update(full_article=enr["quality"] == "article", article_chars=enr["article_chars"], note=enr["note"],
                              quality=enr["quality"], sources=enr["sources"])
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
                got = llm.extract_graph(text)
                if got is None:
                    if llm_required():
                        return {"error": "The LLM call failed (%s); graph building requires it." % (llm.last_error() or "unknown reason")}
                    llm_note, llm_links = "LLM call failed (%s); rules only." % llm.last_error(), []
                else:
                    extra, llm_links = got
                    have = {(e["trigger"], e["direction"]) for e in events}
                    for e in extra:
                        if (e["trigger"], e["direction"]) not in have:
                            e["id"] = "ev%d" % (len(events) + 1)
                            events.append(e)
                    llm_note = "LLM added %d event(s) and proposed %d quote-verified link(s)." % (
                        sum(1 for e in events if e["source"] == "llm"), len(llm_links))

        guard_report = {"rolled_back": False, "failed": [], "version": self.guard.version, "pruned": []}
        if self.guard.mode == "dynamic":
            before = self.guard.begin()
            changes = self.kg.ingest(art_id, text, extraction)
            changes += self.kg.add_llm_links(art_id, llm_links)
            guard_report = dict(self.guard.finish(before, "article " + art_id), pruned=[])
            if guard_report["rolled_back"]:
                changes = []
        else:
            changes = []          # static mode: the graph is frozen at the curated baseline
        sources, claims = self._build_sources(events)
        result = {"article_id": art_id, "events": events, "mentions": [
            {"node": m["node"], "label": kb.NODES[m["node"]]["label"], "type": kb.NODES[m["node"]]["type"],
             "text": m["text"], "start": m["start"], "end": m["end"]} for m in extraction["mentions"]],
            "unlinked": extraction["unlinked"], "graph_changes": changes, "graph_stats": self.kg.stats(),
            "llm_note": llm_note, "text": text}
        result["kb_guard"] = dict(guard_report, mode=self.guard.mode)
        result["input"] = dict(input_info, chars=len(text))
        hypothesis = None
        if not sources and (use_llm or llm_required()) and llm.available():
            # nothing we know was stated: ask the model for market themes the story could touch. Hypotheses only:
            # they are labelled, drawn dashed, and never ingested into the knowledge graph (ingest already ran).
            hyp = llm.suggest_themes(text)
            if hyp:
                hypothesis = {"background": hyp["background"], "themes": hyp["themes"]}
                for i, th in enumerate(hyp["themes"]):
                    e = {"id": "hy%d" % (i + 1), "type": "hypothesis", "trigger": th["node"], "direction": th["direction"],
                         "magnitude": None, "intensity": 0.3, "status": "hypothesis", "confidence": 0.3,
                         "quote": th["quote"] or "", "source": "llm_hypothesis",
                         "label": "%s %s (model hypothesis)" % (kb.NODES[th["node"]]["label"], "up" if th["direction"] > 0 else "down")}
                    events.append(e)
                    sources.append({"id": e["id"], "trigger": th["node"], "direction": th["direction"], "intensity": 0.3,
                                    "anchor": False, "label": e["label"], "event": e, "market": None})
        result["hypothesis"] = hypothesis if hypothesis and hypothesis["themes"] else (
            {"background": hypothesis["background"], "themes": []} if hypothesis and hypothesis["background"] else None)
        if not sources:
            named = bool(extraction["mentions"])
            result.update({"paths": [], "assets": [], "sectors": [], "variables": [], "graph": {"nodes": [], "links": []},
                           "comparison": [], "summary": "No actionable financial event was detected in this text.",
                           "empty_reason": ("Entities were recognised but no price move, decision or event was stated about them."
                                            if named else
                                            "No known market entity, asset or driver is named in this text, so there is nothing to trace."),
                           "empty_hint": "Try a story that names a commodity, central bank, sector, company or index and says what "
                                         "happened to it, or paste more of the article.",
                           "caveats": self._caveats(live, None)})
            return result

        # pass 1: propagate on priors, then validate the edges that matter against data
        paths = pg.propagate(self.kg, sources)
        edges = {e for p in paths[:80] for e in p["edges"]}
        nodes = {n for e in edges for n in e}
        self._prefetch(nodes, live)
        for (u, v) in edges:
            self.kg.set_validation(u, v, ts.validate_edge(self.kg, u, v, live))
        if self.guard.mode == "dynamic":      # runtime-proposed links that data contradicts are dropped
            result["kb_guard"]["pruned"] = self.guard.heal()
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
                   "pos_mass": a["pos_mass"], "neg_mass": a["neg_mass"], "best_score": round(bp["score"], 3),
                   "spark": sp, "ticker": kb.yf_symbol(n), "user_added": bool(self.kg.g.nodes[n].get("user_added"))}
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

        viz_n = 20 if any(s["event"]["status"] == "hypothesis" for s in sources) else VIZ_PATHS   # keep guesses modest
        graph = self._viz(top[:viz_n], explained[:viz_n], sources, agg, anchors, events)
        ctx = ctxmod.expand(self.kg, sources, graph)        # thin graph: possible drivers + sector peers (hypotheses)
        if ctx:
            graph["nodes"] += ctx["nodes"]
            graph["links"] += ctx["links"]
            result["context"] = {k: ctx[k] for k in ("drivers", "peers", "reason")}
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
    def whatif(self, trigger, magnitude_pct, horizon_days=None, live=False):
        """Re-run propagation for a hypothetical shock. Read-only: never ingests or edits the graph."""
        if trigger not in kb.NODES:
            return {"error": "unknown trigger node: %s" % trigger}
        try:
            mag = float(magnitude_pct)
        except (TypeError, ValueError):
            return {"error": "magnitude_pct must be a number"}
        if mag == 0:
            return {"error": "magnitude_pct must be non-zero"}
        direction = 1 if mag > 0 else -1
        intensity = ex._price_intensity(abs(mag))
        label = "%s %s%.4g%% (hypothetical)" % (kb.NODES[trigger]["label"], "+" if mag > 0 else "-", abs(mag))
        sources = [{"id": "whatif", "trigger": trigger, "direction": direction, "intensity": intensity,
                    "anchor": True, "label": label, "market": None}]
        paths = pg.propagate(self.kg, sources)
        if live:  # data-check the links on the strongest paths (validation is cached on the edge, not new knowledge)
            edges = {e for p in paths[:40] for e in p["edges"]}
            self._prefetch({n for e in edges for n in e}, True)
            for (u, v) in edges:
                self.kg.set_validation(u, v, ts.validate_edge(self.kg, u, v, True))
            paths = pg.propagate(self.kg, sources)
        agg = pg.aggregate(paths, exclude=(trigger,))
        src_label = {"whatif": label}
        rows = []
        for n, a in agg.items():
            exp = self._explain_path(a["best_path"], -1, label)
            last = exp["steps"][-1] if exp["steps"] else None
            rows.append({"node": n, "label": self.kg.g.nodes[n]["label"], "type": self.kg.g.nodes[n]["type"],
                         "direction": a["direction"], "confidence": a["confidence"],
                         "confidence_label": a["confidence_label"], "mixed": a["mixed"], "agreement": a["agreement"],
                         "horizon_days": a["horizon_days"], "sensitivity": a["sensitivity"],
                         "sensitivity_label": a["sensitivity_label"], "n_paths": a["n_paths"],
                         "headline": exp["headline"], "why": last["mechanism"] if last else "",
                         "ticker": kb.yf_symbol(n),
                         "beyond_horizon": bool(horizon_days is not None and a["horizon_days"] > horizon_days)})
        rank = lambda r: -(r["confidence"] * {"strong": 1.0, "moderate": 0.75, "mild": 0.5}[r["sensitivity_label"]])
        rows.sort(key=rank)
        top, seen = [], set()
        for p in paths:
            k = tuple(p["nodes"])
            if k not in seen and len(p["edges"]) > 1:
                seen.add(k)
                top.append(self._explain_path(p, len(top), label))
            if len(top) >= 8:
                break
        evidence, ev_seen = [], set()
        for p in top[:6]:
            for st in p["steps"]:
                k = (st["from"], st["to"])
                if k in ev_seen:
                    continue
                ev_seen.add(k)
                val = st["validation"] or {}
                evidence.append({"edge": "%s -> %s" % (st["from_label"], st["to_label"]), "strength": st["effective"],
                                 "lag_days": st["lag"], "provenance": st["provenance"],
                                 "data_check": val.get("verdict") if val and not val.get("simulated") else None,
                                 "r": val.get("r") if val and not val.get("simulated") else None})
        return {"trigger": trigger, "trigger_label": kb.NODES[trigger]["label"], "magnitude_pct": mag,
                "direction": direction, "intensity": round(intensity, 3), "horizon_days": horizon_days,
                "assets": [r for r in rows if r["type"] in ASSET_TYPES],
                "sectors": [r for r in rows if r["type"] == "sector"],
                "variables": [r for r in rows if r["type"] in ("indicator", "commodity")],
                "paths": top, "evidence": evidence,
                "caveats": ["Hypothetical scenario: nothing here was reported in an article.",
                            "Path plausibility depends on the chain of links, not on shock size; shock size changes "
                            "sensitivity and ranking only, and the mapping from size to sensitivity is a heuristic.",
                            "Scores are heuristic plausibility, not probabilities or forecasts. Not investment advice."]}

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
        for s in sources:                 # a stated move with no forward paths must still be on the canvas
            nodes.setdefault(s["trigger"], None)
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
        hyp = any(s["event"]["status"] == "hypothesis" for s in sources)
        facts = {"observed_events": obs, "expected_scenarios": scen if not hyp else [],
                 "model_hypotheses": scen if hyp else [],
                 "top_assets": pick(assets, 5), "top_sectors": pick(sectors, 4),
                 "model_vs_article": [{"item": c["label"], "verdict": c["verdict"]} for c in comparison]}
        ctx = res.get("context")
        if ctx and ctx["drivers"]:
            facts["possible_drivers_hypotheses"] = ["%s %s (could explain the move in %s)" % (
                d["label"], ARROW[d["required_direction"]], d["target_label"]) for d in ctx["drivers"][:4]]
        if hyp:
            facts["note"] = ("These themes are model hypotheses suggested from a text that stated no recognised event; "
                             "nothing here was reported.")
        if use_llm and llm.available():
            txt = llm.summarise(facts)
            if txt:
                return txt.strip()
        parts = []
        if obs:
            parts.append("Reported (observed): " + "; ".join(obs) + ".")
        if scen:
            parts.append("Hedged / scenario: " + "; ".join(scen) + ".")
        if facts.get("possible_drivers_hypotheses"):
            parts.append("Possible drivers (hypotheses traced backwards, not stated): " + "; ".join(facts["possible_drivers_hypotheses"]) + ".")
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
