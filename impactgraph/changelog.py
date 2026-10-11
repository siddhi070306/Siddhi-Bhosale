"""Change history for the knowledge graph.

Every change to the graph (an article folded in, an edit, an added or removed asset, a restore) is recorded as one entry:

    seq        increasing id, never reused (an undone change keeps its entry, marked `undone`)
    epoch      bumped each time the graph is reset to the curated baseline
    version    the graph version this change produced
    parent     the version it started from
    actor      who made it: "user", "system" (an article or the guard) or "restore"
    action     what kind of change: ingest, edit_link, add_link, remove_link, move_asset, add_asset, remove_asset, restore, import
    summary    one line a person can read
    reason     the reason the user gave, if any
    tiers      which tiers of the hierarchy the change touched
    diff       exactly what changed: nodes and links added or removed, and every changed field with its before and after

The diff is computed by comparing the graph before and after, so it is correct for any kind of change and cannot drift from
what actually happened.
"""
from __future__ import annotations

import time

from . import hierarchy

LINK_FIELDS = ("sign", "strength", "lag", "relation", "mechanism")
MAX_LISTED = 40


def _node_info(g, n):
    d = g.nodes[n]
    return {"id": n, "label": d.get("label"), "type": d.get("type"), "tier": d.get("tier") or (hierarchy.layer_of(d.get("type")) or {}).get("id")}


def _link_info(g, u, v):
    e = g[u][v]
    return {"src": u, "dst": v, "src_label": g.nodes[u].get("label"), "dst_label": g.nodes[v].get("label"),
            "sign": e.get("sign"), "strength": e.get("strength"), "relation": hierarchy.rel(g, u, v),
            "provenance": list(e.get("provenance") or [])}


def _norm(field, value):
    return round(value, 4) if field == "strength" and isinstance(value, (int, float)) else value


def diff_graphs(old, new):
    """What changed between two graphs (networkx DiGraphs). Lists are capped; the counts are always exact."""
    on, nn = set(old.nodes), set(new.nodes)
    oe, ne = set(old.edges), set(new.edges)
    changed = []
    for u, v in sorted(oe & ne):
        a, b = old[u][v], new[u][v]
        fields = []
        for f in LINK_FIELDS:
            av, bv = _norm(f, a.get(f)), _norm(f, b.get(f))
            if f == "relation":
                av, bv = hierarchy.rel(old, u, v), hierarchy.rel(new, u, v)
            if av != bv:
                fields.append({"field": f, "before": av, "after": bv})
        ea, eb = len(a.get("evidence") or []), len(b.get("evidence") or [])
        if ea != eb:
            fields.append({"field": "evidence_count", "before": ea, "after": eb})
        pa, pb = set(a.get("provenance") or []), set(b.get("provenance") or [])
        if pa != pb:
            fields.append({"field": "provenance", "before": sorted(pa), "after": sorted(pb)})
        if fields:
            changed.append({"src": u, "dst": v, "src_label": new.nodes[u].get("label"), "dst_label": new.nodes[v].get("label"),
                            "fields": fields})
    added_n, removed_n = sorted(nn - on), sorted(on - nn)
    added_e, removed_e = sorted(ne - oe), sorted(oe - ne)
    return {
        "counts": {"nodes_added": len(added_n), "nodes_removed": len(removed_n), "links_added": len(added_e),
                   "links_removed": len(removed_e), "links_changed": len(changed)},
        "nodes_added": [_node_info(new, n) for n in added_n[:MAX_LISTED]],
        "nodes_removed": [_node_info(old, n) for n in removed_n[:MAX_LISTED]],
        "links_added": [_link_info(new, u, v) for u, v in added_e[:MAX_LISTED]],
        "links_removed": [_link_info(old, u, v) for u, v in removed_e[:MAX_LISTED]],
        "links_changed": changed[:MAX_LISTED],
    }


def is_empty(diff):
    return not any(diff["counts"].values())


def entry(old, new, *, seq, epoch, version, parent, actor, action, summary, reason=None, article_id=None):
    """Build one history entry from the graph before and after a change."""
    diff = diff_graphs(old, new)
    tiers = set()
    for n in diff["nodes_added"] + diff["nodes_removed"]:
        if n.get("tier"):
            tiers.add(n["tier"])
    for l in diff["links_added"] + diff["links_changed"]:
        for k in ("src", "dst"):
            tiers.add(new.nodes[l[k]].get("tier") or (hierarchy.layer_of(new.nodes[l[k]].get("type")) or {}).get("id"))
    for l in diff["links_removed"]:
        for k in ("src", "dst"):
            if l[k] in old.nodes:
                tiers.add(old.nodes[l[k]].get("tier") or (hierarchy.layer_of(old.nodes[l[k]].get("type")) or {}).get("id"))
    order = [x["id"] for x in hierarchy.LAYERS]
    return {"seq": seq, "epoch": epoch, "version": version, "parent": parent, "t": time.strftime("%Y-%m-%d %H:%M:%S"),
            "actor": actor, "action": action, "summary": summary, "reason": reason, "article_id": article_id,
            "tiers": [t for t in order if t in tiers], "diff": diff, "undone": False}
