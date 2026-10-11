"""Dynamic knowledge graph.

Wraps a networkx DiGraph seeded from kb.py. Every edge carries provenance so the UI can tell
apart: "prior" (analyst-curated), "observed" (an article mentioned both endpoints, with the
sentence kept as evidence), "inferred" (added by the system with low confidence) and
"validated" (supported by market data, see timeseries.py).
"""
import time

import networkx as nx

from . import kb


class KnowledgeGraph:
    def __init__(self):
        self.g = nx.DiGraph()
        self.articles = []
        self.reset()

    def reset(self):
        self.g.clear()
        self.articles = []
        for nid, n in kb.NODES.items():
            if nid not in kb.STATIC_IDS:       # reset means the curated baseline, not runtime additions
                continue
            self.g.add_node(nid, label=n["label"], type=n["type"], inferred=False, series=n["series"], kind=n["kind"])
        for s, d, sign, st, lag, why in kb.EDGES:
            self.g.add_edge(s, d, sign=sign, strength=st, base_strength=st, lag=lag, mechanism=why,
                            provenance=["prior"], evidence=[], validation=None, inferred=False)

    # ---- effective strength ----------------------------------------------------------------
    def eff_strength(self, u, v):
        e = self.g[u][v]
        mult = 1.0
        val = e.get("validation")
        if val and val.get("adjusts"):
            mult = val.get("multiplier", 1.0)
        return min(0.99, e["strength"] * mult)

    # ---- ingestion -------------------------------------------------------------------------
    def ingest(self, article_id, text, extraction):
        """Update the graph with one analysed article. Returns a list of change records."""
        changes = []
        # new entities, attached to a sector only as a low-confidence inference
        for u in extraction.get("unlinked", []):
            nid = "ent_" + "".join(c for c in u["name"].lower() if c.isalnum())[:30]
            if nid in self.g:
                continue
            self.g.add_node(nid, label=u["name"], type="company", inferred=True, series=[], kind=None)
            changes.append({"kind": "new_node", "node": nid, "label": u["name"]})
            if u.get("sector_guess"):
                sec = u["sector_guess"]
                self.g.add_edge(sec, nid, sign=1, strength=0.5, base_strength=0.5, lag=0,
                                mechanism="Sector inferred from the company name (%s); unverified" % u["name"],
                                provenance=["inferred"], evidence=[], validation=None, inferred=True)
                changes.append({"kind": "new_edge", "src": sec, "dst": nid, "inferred": True})

        # article evidence for existing edges whose endpoints co-occur in a sentence
        by_sent = {}
        for m in extraction.get("mentions", []):
            by_sent.setdefault(m["sentence"], set()).add(m["node"])
        for sent, ids in by_sent.items():
            for u in ids:
                for v in ids:
                    if u != v and self.g.has_edge(u, v):
                        e = self.g[u][v]
                        if any(ev["article"] == article_id and ev["sentence"] == sent for ev in e["evidence"]):
                            continue
                        e["evidence"].append({"article": article_id, "sentence": sent, "t": time.strftime("%Y-%m-%d")})
                        if "observed" not in e["provenance"]:
                            e["provenance"].append("observed")
                        before = e["strength"]
                        e["strength"] = round(before + (0.97 - before) * 0.05, 4)  # diminishing reinforcement
                        changes.append({"kind": "edge_reinforced", "src": u, "dst": v,
                                        "from": before, "to": e["strength"]})
        self.articles.append(article_id)
        return changes

    def add_llm_links(self, article_id, links):
        """Fold verified LLM-proposed links into the graph. Priors are never flipped by the LLM."""
        changes = []
        for l in links:
            u, v = l["src"], l["dst"]
            ev = {"article": article_id, "sentence": l["quote"], "t": time.strftime("%Y-%m-%d"), "by": "llm"}
            if self.g.has_edge(u, v):
                e = self.g[u][v]
                if e["sign"] != l["sign"]:
                    changes.append({"kind": "llm_conflict", "src": u, "dst": v,
                                    "note": "LLM read the opposite sign from the curated prior; prior kept"})
                    continue
                if any(x["sentence"] == l["quote"] for x in e["evidence"]):
                    continue
                e["evidence"].append(ev)
                if "llm_extracted" not in e["provenance"]:
                    e["provenance"].append("llm_extracted")
                before = e["strength"]
                e["strength"] = round(before + (0.97 - before) * 0.03, 4)  # weaker nudge than rule-matched evidence
                changes.append({"kind": "edge_reinforced", "src": u, "dst": v, "from": before, "to": e["strength"], "by": "llm"})
            else:
                self.g.add_edge(u, v, sign=l["sign"], strength=0.35, base_strength=0.35, lag=1,
                                mechanism=l["mechanism"] + " (LLM-proposed, quote-verified)",
                                provenance=["llm_proposed"], evidence=[ev], validation=None, inferred=True)
                changes.append({"kind": "new_edge", "src": u, "dst": v, "inferred": True, "by": "llm"})
        return changes

    def add_asset(self, spec, sector=None):
        """Add a user-supplied asset node, linked from a sector as a low-confidence, user-added inference."""
        nid = spec["id"]
        self.g.add_node(nid, label=spec["label"], type=spec["type"], inferred=True, user_added=True,
                        series=spec["series"], kind=spec["kind"])
        changes = [{"kind": "new_node", "node": nid, "label": spec["label"], "by": "user"}]
        if sector:
            self.g.add_edge(sector, nid, sign=1, strength=0.5, base_strength=0.5, lag=0,
                            mechanism="User-added: %s assigned to %s (unverified until checked against data)" % (
                                spec["label"], self.g.nodes[sector]["label"]),
                            provenance=["user_added", "inferred"], evidence=[], validation=None, inferred=True)
            changes.append({"kind": "new_edge", "src": sector, "dst": nid, "inferred": True, "by": "user"})
        return changes

    def remove_node(self, nid):
        if nid in self.g:
            self.g.remove_node(nid)

    def set_validation(self, u, v, val):
        e = self.g[u][v]
        e["validation"] = val
        if val.get("adjusts") and val["verdict"] == "supported" and "validated" not in e["provenance"]:
            e["provenance"].append("validated")

    def update_edge_weight(self, u, v, strength, sign=None):
        if not self.g.has_edge(u, v):
            raise KeyError("Edge (%s -> %s) does not exist in graph." % (u, v))
        strength = max(0.01, min(0.99, float(strength)))
        e = self.g[u][v]
        before_st = e["strength"]
        e["strength"] = round(strength, 4)
        e["base_strength"] = round(strength, 4)
        if sign is not None:
            e["sign"] = int(sign)
        prov = e.setdefault("provenance", [])
        if "user_edited" not in prov:
            prov.append("user_edited")
        return {
            "src": u,
            "dst": v,
            "strength": e["strength"],
            "sign": e["sign"],
            "effective_weight": round(e["sign"] * e["strength"], 4),
            "before_strength": before_st,
        }

    # ---- views -----------------------------------------------------------------------------
    def stats(self):
        return {"nodes": self.g.number_of_nodes(), "edges": self.g.number_of_edges(),
                "articles_ingested": len(self.articles),
                "inferred_nodes": sum(1 for _, d in self.g.nodes(data=True) if d.get("inferred")),
                "observed_edges": sum(1 for _, _, d in self.g.edges(data=True) if "observed" in d["provenance"])}

    def full_json(self):
        return {"nodes": [dict(id=n, label=d["label"], type=d["type"], inferred=d.get("inferred", False))
                          for n, d in self.g.nodes(data=True)],
                "links": [dict(source=u, target=v, sign=d["sign"], strength=round(d["strength"], 3),
                               lag=d["lag"], provenance=d["provenance"])
                          for u, v, d in self.g.edges(data=True)]}
