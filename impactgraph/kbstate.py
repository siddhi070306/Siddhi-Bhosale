"""Safety layer for the dynamic knowledge base.

The graph learns from every article (reinforced links, LLM-proposed links, inferred entities) and from
user-added assets. Learning can go wrong, so every change is guarded:

  1. a snapshot is taken before the change;
  2. after it, `health()` runs structural checks (curated links intact, growth within bounds) and a
     deterministic regression test (the built-in sample articles must still give the same signs as the
     static baseline);
  3. if a check fails the snapshot is restored automatically (rollback). The user can also undo the last
     change, revert to the curated static baseline, or freeze learning (static mode).

Nothing here uses the LLM or market data, so the guard itself is deterministic and testable offline.
"""
import copy
import json
import os
import time
from collections import deque

from networkx.readwrite import json_graph

from . import extract as ex
from . import kb, llm, propagate as pg

STATE_FILE = (None if os.environ.get("VERCEL") else
              os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "kb_state.json"))

MAX_NEW_EDGES = 8            # one change may add at most this many links ...
MAX_NEW_NODES = 6            # ... and this many entities
MAX_DYNAMIC_SHARE = 0.35     # runtime links may be at most this share of all links
GOLDEN_MIN_AGREEMENT = 0.9   # share of baseline conclusions (confidence >= .3) whose sign must be unchanged
GOLDEN_MIN_RECALL = 0.9      # share of strong baseline conclusions (>= .5) that must still be reached
PRUNABLE = ("llm_proposed", "inferred")


# ---- deterministic regression profile ------------------------------------------------------------
_baseline = {}


def _profile(kg):
    """sample id -> {node: (direction, confidence)} from rules-only extraction. Read-only on kg."""
    from .service import SAMPLES, Analyzer   # late import: service imports this module
    out = {}
    for s in SAMPLES:
        events = ex.extract(s["text"])["events"]
        sources, _ = Analyzer._build_sources(None, events)
        if not sources:
            out[s["id"]] = {}
            continue
        paths = pg.propagate(kg, sources)
        agg = pg.aggregate(paths, exclude={x["trigger"] for x in sources if not x["anchor"]})
        out[s["id"]] = {n: (a["direction"], a["confidence"]) for n, a in agg.items()}
    return out


def baseline_profile():
    if "p" not in _baseline:
        from .graph import KnowledgeGraph
        _baseline["p"] = _profile(KnowledgeGraph())
    return _baseline["p"]


def health(kg, before=None):
    """Run all checks. `before` is the snapshot taken before the change being judged (optional)."""
    checks = []

    def add(name, ok, detail):
        checks.append({"name": name, "ok": bool(ok), "detail": detail})

    g = kg.g
    missing = [n for n in kb.STATIC_IDS if n not in g]
    add("curated entities present", not missing, "missing: %s" % missing[:5] if missing else "all %d present" % len(kb.STATIC_IDS))
    flipped = [(s, d) for (s, d, sign, *_r) in kb.EDGES if not g.has_edge(s, d) or g[s][d]["sign"] != sign]
    add("curated links intact (same sign)", not flipped, "changed: %s" % flipped[:5] if flipped else "all %d intact" % len(kb.EDGES))
    bad = [(u, v) for u, v, e in g.edges(data=True) if not (0 < e["strength"] <= 0.99)]
    add("link strengths within (0, 0.99]", not bad, "out of range: %s" % bad[:5] if bad else "ok")
    add("no self-loops", not any(u == v for u, v in g.edges), "ok")
    dyn = sum(1 for _, _, e in g.edges(data=True) if e.get("inferred"))
    share = dyn / max(1, g.number_of_edges())
    add("runtime links stay a minority", share <= MAX_DYNAMIC_SHARE, "%.0f%% of links are runtime-added (limit %.0f%%)" % (share * 100, MAX_DYNAMIC_SHARE * 100))
    if before is not None:
        new_e = set(g.edges) - set(before["graph"].edges)
        new_n = set(g.nodes) - set(before["graph"].nodes)
        add("growth per change bounded", len(new_e) <= MAX_NEW_EDGES and len(new_n) <= MAX_NEW_NODES,
            "%d new links (max %d), %d new entities (max %d)" % (len(new_e), MAX_NEW_EDGES, len(new_n), MAX_NEW_NODES))
    # regression: the sample articles must still conclude the same things as the static baseline
    base, cur = baseline_profile(), _profile(kg)
    agree = total = strong = kept = 0
    for sid, bp in base.items():
        for n, (d, c) in bp.items():
            if c >= 0.3 and n in kb.STATIC_IDS:
                total += 1
                agree += int(n in cur[sid] and cur[sid][n][0] == d)
            if c >= 0.5 and n in kb.STATIC_IDS:
                strong += 1
                kept += int(n in cur[sid])
    ag, rc = agree / max(1, total), kept / max(1, strong)
    add("regression: same conclusions as static baseline", ag >= GOLDEN_MIN_AGREEMENT and rc >= GOLDEN_MIN_RECALL,
        "sign agreement %.0f%% (min %.0f%%) over %d conclusions; recall %.0f%% (min %.0f%%)" % (
            ag * 100, GOLDEN_MIN_AGREEMENT * 100, total, rc * 100, GOLDEN_MIN_RECALL * 100))
    return {"ok": all(c["ok"] for c in checks), "checks": checks, "t": time.time()}


# ---- guard ---------------------------------------------------------------------------------------
class KBGuard:
    def __init__(self, kg, persist=False):
        self.kg = kg
        self.persist = bool(persist and STATE_FILE)
        self.mode = "dynamic"            # "dynamic" learns; "static" is frozen at the curated baseline
        self.version = 0
        self.versions = deque(maxlen=10)  # good states, newest last; the first is always the baseline
        self.log = deque(maxlen=60)
        self.last_health = None
        self._note("init", "curated baseline loaded (%d entities, %d links)" % (kg.g.number_of_nodes(), kg.g.number_of_edges()))
        self.versions.append(self.snapshot("baseline"))

    # -- snapshots
    def snapshot(self, label=""):
        return {"graph": copy.deepcopy(self.kg.g), "articles": list(self.kg.articles),
                "nodes": copy.deepcopy(kb.dynamic_specs()), "t": time.time(), "version": self.version, "label": label}

    def restore(self, snap):
        self.kg.g = copy.deepcopy(snap["graph"])
        self.kg.articles = list(snap["articles"])
        kb.drop_dynamic_nodes()
        for spec in copy.deepcopy(snap["nodes"]):
            kb.NODES[spec["id"]] = spec
        self._nodes_changed()

    @staticmethod
    def _nodes_changed():
        ex.refresh_aliases()
        llm._NODE_LIST = None

    def _note(self, action, detail):
        self.log.appendleft({"t": time.strftime("%Y-%m-%d %H:%M:%S"), "action": action, "detail": detail})

    # -- guarded change
    def begin(self):
        return self.snapshot("before change")

    def finish(self, before, label):
        """Judge the change made since `before`. Rolls back on failure. Returns a report dict."""
        h = health(self.kg, before)
        self.last_health = h
        failed = [c for c in h["checks"] if not c["ok"]]
        if failed:
            self.restore(before)
            self._note("rollback", "%s: %s" % (label, "; ".join("%s (%s)" % (c["name"], c["detail"]) for c in failed)))
            return {"rolled_back": True, "failed": failed, "version": self.version}
        self.version += 1
        self.versions.append(self.snapshot(label))
        self._note("commit", "v%d %s" % (self.version, label))
        self.save()
        return {"rolled_back": False, "failed": [], "version": self.version}

    def heal(self):
        """Drop runtime-proposed links that market data contradicts. User-added links are never auto-removed."""
        g, pruned = self.kg.g, []
        for u, v, e in list(g.edges(data=True)):
            val = e.get("validation") or {}
            prov = e.get("provenance", [])
            if (val.get("verdict") == "contradicted" and not val.get("simulated") and "prior" not in prov
                    and "user_added" not in prov and any(p in prov for p in PRUNABLE)):
                g.remove_edge(u, v)
                pruned.append("%s -> %s" % (g.nodes[u]["label"], g.nodes[v]["label"]))
        if pruned:
            self._note("prune", "removed runtime links contradicted by data: %s" % "; ".join(pruned))
            self.save()
        return pruned

    # -- manual controls
    def revert(self, to="static"):
        if to == "previous" and len(self.versions) > 1:
            self.versions.pop()                       # drop the current state
            self.restore(self.versions[-1])
            self.version = max(0, self.version - 1)
            self._note("undo", "restored v%d (%s)" % (self.version, self.versions[-1]["label"]))
        else:
            self.kg.reset()
            kb.drop_dynamic_nodes()
            self._nodes_changed()
            self.version = 0
            self.versions.clear()
            self.versions.append(self.snapshot("baseline"))
            self._note("revert-static", "back to the curated baseline (%d entities, %d links)" % (
                self.kg.g.number_of_nodes(), self.kg.g.number_of_edges()))
        self.save()
        return self.status()

    def set_mode(self, mode):
        if mode not in ("dynamic", "static"):
            raise ValueError("mode must be 'dynamic' or 'static'")
        if mode == "static" and self.mode != "static":
            self.revert("static")
        self.mode = mode
        self._note("mode", "learning %s" % ("frozen (static baseline)" if mode == "static" else "enabled"))
        self.save()
        return self.status()

    def status(self):
        return {"mode": self.mode, "version": self.version, "history": [v["label"] for v in self.versions],
                "can_undo": len(self.versions) > 1, "last_health": self.last_health, "log": list(self.log),
                "persisted": self.persist,
                "runtime_assets": [{"id": s["id"], "label": s["label"], "ticker": kb.yf_symbol(s["id"])} for s in kb.dynamic_specs()]}

    # -- persistence (local runs only; skipped on read-only serverless hosts)
    def save(self):
        if not self.persist:
            return
        try:
            os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
            data = {"mode": self.mode, "version": self.version, "articles": self.kg.articles,
                    "nodes": kb.dynamic_specs(), "graph": json_graph.node_link_data(self.kg.g)}
            tmp = STATE_FILE + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(data, f, default=str)
            os.replace(tmp, STATE_FILE)
        except Exception as e:                        # persistence must never break an analysis
            self._note("save-failed", str(e))

    def load(self):
        """Restore the last saved state if it passes the health checks; otherwise stay on the baseline."""
        if not (self.persist and os.path.exists(STATE_FILE)):
            return False
        try:
            with open(STATE_FILE, encoding="utf-8") as f:
                data = json.load(f)
            for spec in data.get("nodes", []):
                spec["series"] = [tuple(s) for s in spec["series"]]
                kb.NODES[spec["id"]] = spec
            self._nodes_changed()
            self.kg.g = json_graph.node_link_graph(data["graph"], directed=True, multigraph=False)
            self.kg.articles = data.get("articles", [])
            h = health(self.kg)
            if not h["ok"]:
                raise ValueError("saved state failed health checks: " + "; ".join(c["name"] for c in h["checks"] if not c["ok"]))
            self.version, self.mode = data.get("version", 0), data.get("mode", "dynamic")
            self.last_health = h
            self.versions.clear()
            self.versions.append(self.snapshot("restored from disk"))
            self._note("load", "restored saved knowledge base v%d (%d entities, %d links)" % (
                self.version, self.kg.g.number_of_nodes(), self.kg.g.number_of_edges()))
            return True
        except Exception as e:
            self.kg.reset()
            kb.drop_dynamic_nodes()
            self._nodes_changed()
            self._note("load-rejected", "%s; using the static baseline" % e)
            return False
