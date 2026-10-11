"""The analysis library: every graph the Knowledge Graph Generator produces, kept so the KG assistant can read it.

The knowledge graph keeps only what an article teaches it (evidence on links, learned entities). The analysis of the article
itself (what it reported, the chains the model traced, the assets it ranked, the hypotheses it drew) used to live only in the
browser. The library keeps it on the backend:

    data/analyses/index.json        one compact record per analysis, newest first: what the assistant searches and the
                                     sidebar lists
    data/analyses/<id>.json.gz      the full analysis result (without sparklines), so a saved graph can be reopened with
                                     every dashboard

A record separates what the article REPORTED (events marked observed, with their quote) from what the model INFERRED (paths,
affected assets, at a stated graph version) and from model HYPOTHESES (dashed themes and possible drivers). The record id is the
article id (a hash of the analysed text), so re-analysing the same text replaces its record instead of adding a duplicate.

Nothing here changes the knowledge graph. Imported items come from the user's own browser history and are treated as data.
"""
import copy
import gzip
import hashlib
import json
import os
import re
import threading
import time

from . import kb

DIR = (None if os.environ.get("VERCEL") else
       os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "analyses"))
MAX_RECORDS = 200
MAX_IMPORT = 100
_ID_RE = re.compile(r"^[0-9a-f]{6,40}$")


def _clip(s, n):
    s = re.sub(r"\s+", " ", str(s or "")).strip()
    return s if len(s) <= n else s[:n - 1].rstrip() + "…"


def _row(r):
    return {"node": r.get("node"), "label": _clip(r.get("label"), 80), "direction": r.get("direction"),
            "confidence": r.get("confidence"), "confidence_label": r.get("confidence_label"), "mixed": bool(r.get("mixed"))}


def _slim(res):
    """The full result without the parts that are large and can be rebuilt (sparklines)."""
    out = copy.deepcopy(res)
    out.pop("sparks", None)
    for k in ("assets", "sectors", "variables"):
        for r in out.get(k) or []:
            r.pop("spark", None)
    return out


def compact(res, title=None, link=None, t=None, origin="generator"):
    """A compact record of one analysis, or None if it holds no event (nothing was drawn)."""
    if not isinstance(res, dict) or not isinstance(res.get("events"), list) or not res["events"]:
        return None
    text = str(res.get("text") or "")
    rid = str(res.get("article_id") or "")
    if not _ID_RE.match(rid):
        rid = hashlib.sha1(text.encode("utf-8")).hexdigest()[:10]
    events = []
    for e in res["events"][:20]:
        if not isinstance(e, dict) or e.get("trigger") not in kb.NODES:
            continue
        events.append({"label": _clip(e.get("label"), 100), "trigger": e["trigger"], "direction": e.get("direction"),
                       "status": e.get("status") if e.get("status") in ("observed", "expected", "hypothesis") else "expected",
                       "type": e.get("type"), "source": e.get("source"), "quote": _clip(e.get("quote"), 240)})
    if not events:
        return None
    paths = []
    for p in (res.get("paths") or [])[:6]:
        if isinstance(p, dict) and p.get("nodes"):
            paths.append({"text": _clip(p.get("tier_sentence") or p.get("headline"), 300),
                          "nodes": [n for n in p["nodes"] if n in kb.NODES], "score": p.get("score"),
                          "horizon_days": p.get("horizon_days")})
    hyp = res.get("hypothesis") or {}
    ctx = res.get("context") or {}
    hypotheses = ([{"kind": "theme", "text": _clip("%s %s: %s" % (kb.NODES[th["node"]]["label"], "up" if th.get("direction", 0) > 0 else "down",
                                                                th.get("why") or ""), 200), "node": th["node"]}
                   for th in (hyp.get("themes") or []) if isinstance(th, dict) and th.get("node") in kb.NODES] +
                  [{"kind": "possible driver", "text": _clip(d.get("chain"), 200), "node": d.get("node")}
                   for d in (ctx.get("drivers") or [])[:4] if isinstance(d, dict)])
    assets = [_row(r) for r in (res.get("assets") or [])[:8] if isinstance(r, dict)]
    sectors = [_row(r) for r in (res.get("sectors") or [])[:5] if isinstance(r, dict)]
    variables = [_row(r) for r in (res.get("variables") or [])[:5] if isinstance(r, dict)]
    nodes = {e["trigger"] for e in events}
    for p in paths:
        nodes.update(p["nodes"])
    nodes.update(r["node"] for r in assets + sectors + variables if r["node"] in kb.NODES)
    first = re.split(r"(?<=[.!?])\s", text.strip(), maxsplit=1)[0] if text else ""
    return {
        "id": rid, "title": _clip(title or first or "Untitled analysis", 140), "t": t or time.strftime("%Y-%m-%d %H:%M:%S"),
        "origin": origin, "link": _clip(link, 400) if link else None, "excerpt": _clip(text, 500),
        "quality": (res.get("input") or {}).get("quality"),
        "kb_version": res.get("kb_version") if isinstance(res.get("kb_version"), dict) else None,
        "events": events, "paths": paths, "assets": assets, "sectors": sectors, "variables": variables,
        "comparison": [{"label": _clip(c.get("label"), 80), "stated": c.get("stated"), "predicted": c.get("predicted"),
                        "verdict": c.get("verdict"), "status": c.get("status")}
                       for c in (res.get("comparison") or [])[:12] if isinstance(c, dict)],
        "hypotheses": hypotheses, "summary": _clip(res.get("summary"), 700), "nodes": sorted(nodes),
    }


class AnalysisLibrary:
    def __init__(self, directory=DIR):
        self.dir = directory
        self.lock = threading.Lock()
        self.records = []          # newest first
        self._full = {}            # in-memory full results when there is no directory (serverless, tests)
        self._load()

    # -- persistence
    def _index_path(self):
        return os.path.join(self.dir, "index.json") if self.dir else None

    def _load(self):
        p = self._index_path()
        if not p or not os.path.exists(p):
            return
        try:
            with open(p, encoding="utf-8") as f:
                data = json.load(f)
            self.records = [r for r in data.get("records", []) if isinstance(r, dict) and _ID_RE.match(str(r.get("id", "")))]
        except Exception:
            self.records = []

    def _save_index(self):
        p = self._index_path()
        if not p:
            return
        try:
            os.makedirs(self.dir, exist_ok=True)
            tmp = p + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump({"format": "apex-zenith-analyses", "schema": 1, "records": self.records}, f, default=str)
            os.replace(tmp, p)
        except Exception:
            pass                    # the library must never break an analysis

    def _write_full(self, rid, res):
        if not self.dir:
            self._full[rid] = _slim(res)
            return
        try:
            os.makedirs(self.dir, exist_ok=True)
            with gzip.open(os.path.join(self.dir, rid + ".json.gz"), "wt", encoding="utf-8") as f:
                json.dump(_slim(res), f, default=str)
        except Exception:
            pass

    def _drop_full(self, rid):
        self._full.pop(rid, None)
        if self.dir:
            try:
                os.remove(os.path.join(self.dir, rid + ".json.gz"))
            except OSError:
                pass

    # -- writing
    def _put(self, rec, res):
        old = next((r for r in self.records if r["id"] == rec["id"]), None)
        rec["runs"] = (old.get("runs", 1) + 1) if old else 1
        self.records = [rec] + [r for r in self.records if r["id"] != rec["id"]]
        self._write_full(rec["id"], res)
        for gone in self.records[MAX_RECORDS:]:
            self._drop_full(gone["id"])
        del self.records[MAX_RECORDS:]

    def record(self, res, title=None, link=None):
        """File one analysis just produced by the generator. Returns the record, or None if nothing was drawn."""
        rec = compact(res, title, link)
        if rec is None:
            return None
        with self.lock:
            self._put(rec, res)
            self._save_index()
        return rec

    def import_items(self, items):
        """Add analyses from the user's browser history. Each item: {result, title?, link?, t?}. Existing ids are kept as they are."""
        out = {"imported": 0, "already_in_library": 0, "skipped": 0, "ids": []}
        with self.lock:
            have = {r["id"] for r in self.records}
            for it in (items or [])[:MAX_IMPORT]:
                res = it.get("result") if isinstance(it, dict) else None
                t = it.get("t") if isinstance(it, dict) else None
                rec = compact(res, it.get("title"), it.get("link"), t=_clip(t, 19) if t else None, origin="import") if res else None
                if rec is None:
                    out["skipped"] += 1
                    continue
                if rec["id"] in have:
                    out["already_in_library"] += 1
                    continue
                rec["runs"] = 1
                self.records.append(rec)
                self._write_full(rec["id"], res)
                have.add(rec["id"])
                out["imported"] += 1
                out["ids"].append(rec["id"])
            self.records.sort(key=lambda r: r.get("t") or "", reverse=True)
            for gone in self.records[MAX_RECORDS:]:
                self._drop_full(gone["id"])
            del self.records[MAX_RECORDS:]
            self._save_index()
        out["skipped"] += max(0, len(items or []) - MAX_IMPORT)
        return out

    def delete(self, rid):
        with self.lock:
            n = len(self.records)
            self.records = [r for r in self.records if r["id"] != rid]
            if len(self.records) == n:
                return False
            self._drop_full(rid)
            self._save_index()
        return True

    # -- reading
    def get(self, rid):
        return next((r for r in self.records if r["id"] == rid), None)

    def full(self, rid):
        if rid in self._full:
            return self._full[rid]
        if not self.dir or not _ID_RE.match(rid or ""):
            return None
        try:
            with gzip.open(os.path.join(self.dir, rid + ".json.gz"), "rt", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return None

    def summaries(self, limit=50, offset=0):
        rows = [{"id": r["id"], "title": r["title"], "t": r["t"], "origin": r["origin"], "quality": r.get("quality"),
                 "events": len(r["events"]), "paths": len(r["paths"]), "runs": r.get("runs", 1),
                 "kb_version": r.get("kb_version"),
                 "headline": r["events"][0]["label"] if r["events"] else None}
                for r in self.records]
        return {"total": len(rows), "items": rows[offset:offset + limit]}

    def mentioning(self, nodes, limit=3):
        """Most recent analyses that touch any of these graph nodes."""
        want = set(nodes)
        return [r for r in self.records if want & set(r.get("nodes") or [])][:limit]

    def latest(self, limit=3):
        return self.records[:limit]
