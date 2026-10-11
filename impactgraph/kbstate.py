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
from . import changelog, hierarchy, kb, llm, propagate as pg

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


def health(kg, before=None, user_edit=False):
    """Run all checks. `before` is the snapshot taken before the change being judged (optional).

    A deliberate user edit (a changed weight, a link the user added, an import) is judged on structure only: the
    regression against the curated baseline is skipped, because the user is choosing to depart from it, and a curated link
    the user edited on purpose is not reported as a broken curated link."""
    checks = []

    def add(name, ok, detail):
        checks.append({"name": name, "ok": bool(ok), "detail": detail})

    g = kg.g
    missing = [n for n in kb.STATIC_IDS if n not in g]
    add("curated entities present", not missing, "missing: %s" % missing[:5] if missing else "all %d present" % len(kb.STATIC_IDS))
    flipped = [(s, d) for (s, d, sign, *_r) in kb.EDGES
               if not g.has_edge(s, d) or (g[s][d]["sign"] != sign and "user_edited" not in g[s][d].get("provenance", []))]
    add("curated links intact (same sign)", not flipped, "changed: %s" % flipped[:5] if flipped else "all %d intact" % len(kb.EDGES))
    bad = [(u, v) for u, v, e in g.edges(data=True) if not (0 < e["strength"] <= 0.99)]
    add("link strengths within (0, 0.99]", not bad, "out of range: %s" % bad[:5] if bad else "ok")
    add("no self-loops", not any(u == v for u, v in g.edges), "ok")
    up = hierarchy.audit(kg)["learned_links_pointing_up_from_assets"]
    add("hierarchy: no learned link points up from an asset", not up, "upward learned links: %s" % up[:5] if up else "ok")
    dyn = sum(1 for _, _, e in g.edges(data=True) if e.get("inferred"))
    share = dyn / max(1, g.number_of_edges())
    add("runtime links stay a minority", share <= MAX_DYNAMIC_SHARE, "%.0f%% of links are runtime-added (limit %.0f%%)" % (share * 100, MAX_DYNAMIC_SHARE * 100))
    if before is not None:
        new_e = set(g.edges) - set(before["graph"].edges)
        new_n = set(g.nodes) - set(before["graph"].nodes)
        add("growth per change bounded", len(new_e) <= MAX_NEW_EDGES and len(new_n) <= MAX_NEW_NODES,
            "%d new links (max %d), %d new entities (max %d)" % (len(new_e), MAX_NEW_EDGES, len(new_n), MAX_NEW_NODES))
    if user_edit:
        add("baseline regression", True, "skipped: a deliberate user edit may depart from the curated baseline")
        return {"ok": all(c["ok"] for c in checks), "checks": checks, "t": time.time()}
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
MAX_RESTORABLE = 30      # versions kept as snapshots (older ones stay in the history but cannot be restored)
MAX_HISTORY = 300


class KBGuard:
    def __init__(self, kg, persist=False):
        self.kg = kg
        self.persist = bool(persist and STATE_FILE)
        self.mode = "dynamic"            # "dynamic" learns; "static" is frozen at the curated baseline
        self.version = 0
        self.versions = deque(maxlen=MAX_RESTORABLE)  # good states, newest last; the first is always the baseline
        self.history = []                 # change entries (see changelog.py), oldest first
        self.seq = 0                      # id of the latest history entry
        self.epoch = 0                    # bumped when the graph is reset to the curated baseline
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

    def _record(self, old_graph, new_graph, **kw):
        self.seq += 1
        e = changelog.entry(old_graph, new_graph, seq=self.seq, epoch=self.epoch, **kw)
        self.history.append(e)
        del self.history[:-MAX_HISTORY]
        return e

    def finish(self, before, label, actor="system", action="change", reason=None, article_id=None, user_edit=False):
        """Judge the change made since `before`. Rolls back on failure. Returns a report dict."""
        h = health(self.kg, before, user_edit=user_edit)
        self.last_health = h
        failed = [c for c in h["checks"] if not c["ok"]]
        if failed:
            self.restore(before)
            self._note("rollback", "%s: %s" % (label, "; ".join("%s (%s)" % (c["name"], c["detail"]) for c in failed)))
            return {"rolled_back": True, "failed": failed, "version": self.version}
        parent = self.version
        self.version += 1
        self.versions.append(self.snapshot(label))
        self._note("commit", "v%d %s" % (self.version, label))
        if not (action == "ingest" and changelog.is_empty(changelog.diff_graphs(before["graph"], self.kg.g))):
            self._record(before["graph"], self.kg.g, version=self.version, parent=parent, actor=actor, action=action,
                         summary=label, reason=reason, article_id=article_id)
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
        old = copy.deepcopy(self.kg.g)
        if to == "previous" and len(self.versions) > 1:
            dropped = self.version
            self.versions.pop()                       # drop the current state
            self.restore(self.versions[-1])
            self.version = max(0, self.version - 1)
            for e in reversed(self.history):          # the undone change stays in the history, marked
                if e["epoch"] == self.epoch and e["version"] == dropped and not e["undone"]:
                    e["undone"] = True
                    break
            self._note("undo", "restored v%d (%s)" % (self.version, self.versions[-1]["label"]))
            self._record(old, self.kg.g, version=self.version, parent=dropped, actor="user", action="undo",
                         summary="undid v%d" % dropped)
        else:
            self.kg.reset()
            kb.drop_dynamic_nodes()
            self._nodes_changed()
            self.epoch += 1
            self.version = 0
            self.versions.clear()
            self.versions.append(self.snapshot("baseline"))
            self._note("revert-static", "back to the curated baseline (%d entities, %d links)" % (
                self.kg.g.number_of_nodes(), self.kg.g.number_of_edges()))
            self._record(old, self.kg.g, version=0, parent=None, actor="user", action="reset",
                         summary="reset to the curated baseline")
        self.save()
        return self.status()

    def restorable_versions(self):
        return [s["version"] for s in self.versions]

    def restore_version(self, version, reason=None):
        """Go back to the graph as it was at `version`. This is a new forward change: nothing is erased from the history."""
        snap = next((s for s in self.versions if s["version"] == version), None)
        if snap is None:
            raise ValueError("version %s cannot be restored: only the last %d versions of this session are kept (restorable: %s)"
                             % (version, MAX_RESTORABLE, self.restorable_versions()))
        old, parent = copy.deepcopy(self.kg.g), self.version
        self.restore(snap)
        self.version += 1
        self.versions.append(self.snapshot("restored v%d" % version))
        self._note("restore", "v%d restored as v%d" % (version, self.version))
        e = self._record(old, self.kg.g, version=self.version, parent=parent, actor="user", action="restore",
                         summary="restored v%d" % version, reason=reason)
        self.save()
        return e

    # -- history
    def history_view(self, limit=50, offset=0):
        rows = [dict({k: v for k, v in e.items() if k != "diff"}, diff_counts=e["diff"]["counts"])
                for e in reversed(self.history)]
        return {"total": len(rows), "entries": rows[offset:offset + limit], "version": self.version, "epoch": self.epoch,
                "restorable": self.restorable_versions()}

    def entry(self, seq):
        return next((e for e in self.history if e["seq"] == seq), None)

    # -- export / import
    def export_state(self):
        try:
            d = json_graph.node_link_data(self.kg.g, edges="links")
        except TypeError:
            d = json_graph.node_link_data(self.kg.g)
        return {"format": "apex-zenith-kg", "schema": 1, "version": self.version, "epoch": self.epoch,
                "exported_at": time.strftime("%Y-%m-%d %H:%M:%S"), "articles": list(self.kg.articles),
                "nodes": kb.dynamic_specs(), "graph": d}

    def import_state(self, data, reason=None):
        """Replace the graph with an exported one, if it passes the health checks and the tier rules. Else nothing changes."""
        if not isinstance(data, dict) or data.get("format") != "apex-zenith-kg" or data.get("schema") != 1 or "graph" not in data:
            return {"ok": False, "error": "not an Apex Zenith graph export (format 'apex-zenith-kg', schema 1)"}
        before = self.begin()
        try:
            specs = []
            for spec in data.get("nodes", []):
                spec = dict(spec)
                spec["series"] = [tuple(s) for s in spec.get("series", [])]
                specs.append(spec)
            edges_key = "links" if "links" in data.get("graph", {}) else "edges"
            try:
                g = json_graph.node_link_graph(data["graph"], directed=True, multigraph=False, edges=edges_key)
            except TypeError:
                g = json_graph.node_link_graph(data["graph"], directed=True, multigraph=False)
            kb.drop_dynamic_nodes()
            for spec in specs:
                kb.NODES[spec["id"]] = spec
            self.kg.g = g
            self.kg.articles = list(data.get("articles", []))
            hierarchy.ensure_properties(self.kg)
            self._nodes_changed()
        except Exception as e:
            self.restore(before)
            return {"ok": False, "error": "could not read the graph: %s" % e}
        report = self.finish(before, "imported a graph export", actor="user", action="import", reason=reason, user_edit=True)
        if report["rolled_back"]:
            return {"ok": False, "error": "the import was rejected by the health checks",
                    "failed": [c["name"] + ": " + c["detail"] for c in report["failed"]]}
        return {"ok": True, "version": self.version, "nodes": self.kg.g.number_of_nodes(), "links": self.kg.g.number_of_edges()}

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
        return {"mode": self.mode, "version": self.version, "epoch": self.epoch, "history": [v["label"] for v in self.versions],
                "history_count": len(self.history), "restorable": self.restorable_versions(),
                "edited_links": sum(1 for _, _, e in self.kg.g.edges(data=True) if "user_edited" in e.get("provenance", [])),
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
                    "history": self.history, "seq": self.seq, "epoch": self.epoch,
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
            hierarchy.ensure_properties(self.kg)         # states saved before tiers and relations were stored
            self.kg.articles = data.get("articles", [])
            h = health(self.kg)
            if not h["ok"]:
                raise ValueError("saved state failed health checks: " + "; ".join(c["name"] for c in h["checks"] if not c["ok"]))
            self.version, self.mode = data.get("version", 0), data.get("mode", "dynamic")
            self.history, self.seq, self.epoch = list(data.get("history", [])), data.get("seq", 0), data.get("epoch", 0)
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
