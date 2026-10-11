import os
from typing import Optional, List, Dict, Any

from fastapi import Body, FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from fastapi.middleware.cors import CORSMiddleware

from impactgraph import assistant, cards as cardlib, explain, feeds, hedge, hierarchy, library, llm, market, quotes, store
from impactgraph.service import SAMPLES, Analyzer, llm_required

app = FastAPI(title="Apex Zenith")

# the frontend is served from another origin (Vercel). ZENITH_CORS_ORIGINS narrows it to that site, e.g.
# "https://apex-zenith.vercel.app"; no cookies are used, so credentials stay off (a wildcard origin must not allow them)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.environ.get("ZENITH_CORS_ORIGINS", "*").split(",") if o.strip()] or ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _warm_feeds():
    """Fetch the RSS feeds in the background once, so the first page load does not wait for them."""
    if os.environ.get("VERCEL"):
        return
    import threading
    threading.Thread(target=feeds.rss_items, daemon=True).start()     # RSS only: NewsAPI has a small daily quota, so it is never called at startup
analyzer = Analyzer(persist=not os.environ.get("VERCEL"))
LIB = library.AnalysisLibrary()      # every graph the generator produces, for the KG assistant and the chat history
ROOT = os.path.dirname(os.path.abspath(__file__))


class AnalyzeBody(BaseModel):
    text: str
    live: bool = False
    use_llm: bool = False
    title: Optional[str] = None      # the headline itself (lets the backend find the same story in other feeds)
    link: Optional[str] = None       # the article's URL, when the text is a headline from the feed
    full_text: bool = False          # also read the article body (robots.txt permitting) and analyse it too


@app.post("/api/analyze")
def analyze(body: AnalyzeBody):
    res = analyzer.analyze(body.text, live=body.live, use_llm=body.use_llm, link=body.link, full_text=body.full_text, title=body.title)
    if res.get("error"):
        raise HTTPException(status_code=503 if "LLM" in res["error"] else 400, detail=res["error"])
    rec = LIB.record(res, title=body.title, link=body.link)
    res["library_id"] = rec["id"] if rec else None
    return res


# ---- the analysis library: every generated graph, readable by the KG assistant --------------------------
@app.get("/api/analyses")
def analyses_list(limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0)):
    return LIB.summaries(limit, offset)


@app.get("/api/analyses/{rid}")
def analyses_get(rid: str):
    rec = LIB.get(rid)
    if rec is None:
        raise HTTPException(status_code=404, detail="no saved analysis with id %s" % rid)
    return {"record": rec, "result": LIB.full(rid)}


class ImportBody(BaseModel):
    items: List[Dict[str, Any]]


@app.post("/api/analyses/import")
def analyses_import(body: ImportBody):
    """Add analyses from the browser's chat history. Each item: {result, title?, link?, t?}. Ids already saved are kept."""
    if len(body.items) > library.MAX_IMPORT:
        raise HTTPException(status_code=400, detail="at most %d items per import" % library.MAX_IMPORT)
    return dict(LIB.import_items(body.items), total=len(LIB.records))


@app.delete("/api/analyses/{rid}")
def analyses_delete(rid: str):
    if not LIB.delete(rid):
        raise HTTPException(status_code=404, detail="no saved analysis with id %s" % rid)
    return {"ok": True, "total": len(LIB.records)}


@app.get("/api/samples")
def samples():
    return SAMPLES


@app.get("/api/status")
def status():
    p = llm.provider()
    has = lambda k: bool(os.environ.get(k, "").strip())
    return {"llm": p[0] if p else None, "llm_model": p[3] if p else None, "llm_required": llm_required(), "fred_key": has("FRED_API_KEY"),
            "news_key": has("NEWSAPI_KEY"), "graph": analyzer.kg.stats(),
            "kb": {"mode": analyzer.guard.mode, "version": analyzer.guard.version}, "durable_store": store.status()}


@app.get("/api/graph")
def graph():
    return analyzer.kg.full_json()


@app.get("/api/hierarchy")
def hierarchy_info():
    return {"layers": hierarchy.describe(), "audit": hierarchy.audit(analyzer.kg)}


class AssistantBody(BaseModel):
    question: str
    history: Optional[list] = None
    analysis_id: Optional[str] = None    # the news graph open in the app: "this story" means this one
    story: Optional[Dict[str, Any]] = None   # that story's title, text and summary, in case it is not in the library


@app.post("/api/assistant")
def assistant_answer(body: AssistantBody):
    """Answer a question from the knowledge graph. Read only: the question is never analysed as an article."""
    res = assistant.answer(analyzer.kg, {"version": analyzer.guard.version, "epoch": analyzer.guard.epoch}, body.question,
                           history=body.history or [], use_llm=True, library=LIB, analysis_id=body.analysis_id,
                           story=body.story)
    if res.get("error"):
        raise HTTPException(status_code=400, detail=res["error"])
    return res


@app.get("/api/kg/cards")
def kg_cards(tier: Optional[str] = None, node: Optional[str] = None, kind: Optional[str] = None,
             limit: int = Query(200, ge=1, le=2000), offset: int = Query(0, ge=0), analyses: bool = False):
    """The whole graph as citable text cards (nodes, links, sectors, tiers), pinned to the graph version. Filter by tier, node or kind.
    analyses=true (or kind=analysis) adds a card per saved analysis; the fingerprint always covers the graph's own cards only."""
    allc = cardlib.all_cards(analyzer.kg)
    gv = {"version": analyzer.guard.version, "epoch": analyzer.guard.epoch}
    pool = allc + ([cardlib.analysis_card(r, gv) for r in LIB.records] if analyses or kind == "analysis" else [])
    sel = cardlib.select(pool, tier, node, kind)
    return {"graph_version": gv, "fingerprint": cardlib.fingerprint(allc), "total_cards": len(allc), "analysis_cards": len(pool) - len(allc),
            "matched": len(sel), "cards": sel[offset:offset + limit]}


@app.get("/api/kg/cards/{card_id:path}")
def kg_card(card_id: str):
    c = cardlib.get_card(analyzer.kg, card_id, library=LIB,
                         graph_version={"version": analyzer.guard.version, "epoch": analyzer.guard.epoch})
    if c is None:
        raise HTTPException(status_code=404, detail="no such card: %s" % card_id)
    return {"graph_version": {"version": analyzer.guard.version, "epoch": analyzer.guard.epoch}, "card": c}


@app.get("/api/kg/paths")
def kg_paths(src: str, dst: Optional[str] = None, limit: int = Query(3, ge=1, le=10)):
    """Path cards out of one node (to dst, if given): the strongest chains the graph holds."""
    g = analyzer.kg.g
    if src not in g or (dst and dst not in g):
        raise HTTPException(status_code=404, detail="unknown node")
    cards = [cardlib.path_card(analyzer.kg, p) for p in cardlib.find_paths(analyzer.kg, src, dst, limit)]
    if dst and not cards:
        shared = cardlib.shared_drivers_card(analyzer.kg, src, dst)
        cards = [cardlib.gap_card(analyzer.kg, src, dst)] + ([shared] if shared else [])
    return {"graph_version": {"version": analyzer.guard.version, "epoch": analyzer.guard.epoch}, "cards": cards}


@app.get("/api/kg/explain")
def kg_explain(src: str, dst: str):
    """One relationship in plain English: what it says, why, how it was identified, the data check, how it is scored."""
    if not analyzer.kg.g.has_edge(src, dst):
        raise HTTPException(status_code=404, detail="the graph has no link %s -> %s" % (src, dst))
    return explain.explain_link(analyzer.kg, src, dst)


@app.get("/api/node/{node_id}")
def node_info(node_id: str):
    p = hierarchy.node_properties(analyzer.kg, node_id)
    if p is None:
        raise HTTPException(status_code=404, detail="no such node: %s" % node_id)
    return p


@app.post("/api/reset")
def reset():
    analyzer.reset()
    return {"ok": True, "graph": analyzer.kg.stats()}


class ShockItem(BaseModel):
    trigger: str
    magnitude_pct: float


class WhatIfBody(BaseModel):
    trigger: str = "crude_oil"
    magnitude_pct: float = 0.0
    horizon_days: Optional[int] = None
    live: bool = False
    shocks: Optional[list[ShockItem]] = None


@app.post("/api/whatif")
def whatif(body: WhatIfBody):
    shocks_data = [s.dict() for s in body.shocks] if body.shocks else None
    res = analyzer.whatif(body.trigger, body.magnitude_pct, body.horizon_days, body.live, shocks=shocks_data)
    if res.get("error"):
        raise HTTPException(status_code=400, detail=res["error"])
    return res


@app.get("/api/market")
def market_snapshot(refresh: bool = False):
    return market.snapshot(force=refresh)


@app.get("/api/events")
def events(limit: int = Query(8, ge=1, le=30), deduplicate: bool = Query(True)):
    out = []
    for i, h in enumerate(feeds.headlines(limit, deduplicate=deduplicate)):
        out.append({
            "id": "n%d" % i,
            "time": h.get("published") or "",
            "title": h["title"],
            "category": h["source"],
            "text": (h["title"] + ". " + h["summary"]).strip() if h.get("summary") else h["title"],
            "link": h.get("link", ""),
            "cluster_size": h.get("cluster_size", 1),
            "sources": h.get("sources", [h["source"]]),
            "priority_score": h.get("priority_score"),
            "trust_score": h.get("trust_score"),
            "speed_score": h.get("speed_score"),
            "quality_score": h.get("quality_score"),
            "duplicates_count": h.get("duplicates_count", 0),
            "duplicates": h.get("duplicates", []),
        })
    return out


@app.get("/api/analogs")
def analogs_endpoint(node_id: str = Query(..., min_length=1, max_length=80),
                     shock_pct: float = Query(5.0, ge=0.1, le=200.0),
                     live: bool = False):
    """Return historical analog windows for a knowledge-graph node.

    shock_pct is the magnitude of the current event in percent (absolute value;
    the endpoint finds both up and down shocks above 0.6 * shock_pct threshold).
    Past analogs do not constitute forecasts.
    """
    from impactgraph import analogs as _analogs
    return _analogs.historical_analogs(node_id, shock_pct=shock_pct, live=live)


@app.get("/api/forecast")
def forecast_endpoint(node_id: str = Query(..., min_length=1, max_length=80),
                      shock_pct: float = Query(0.0, ge=-90.0, le=200.0),
                      horizon: int = Query(30, ge=10, le=90),
                      simulations: int = Query(500, ge=100, le=2000),
                      live: bool = False):
    """Monte Carlo forward simulation fan chart for a knowledge-graph node.

    Calibrates on historical time-series volatility, injects shock_pct at Day 0,
    and returns percentile bands (p10, p25, p50, p75, p90) and risk metrics.
    """
    from impactgraph import forecast as _forecast
    return _forecast.simulate_monte_carlo(
        node_id=node_id,
        shock_pct=shock_pct,
        horizon_days=horizon,
        simulations=simulations,
        live=live
    )


# ---- live quotes (Yahoo Finance via yfinance: polled in the background, pushed over SSE) -------------
def _symbols(s):
    return [x for x in (s or "").replace(" ", "").split(",") if x]


@app.get("/api/quotes")
def get_quotes(symbols: str = Query("", max_length=1200)):
    return quotes.HUB.get(_symbols(symbols))


@app.get("/api/stream")
def stream(symbols: str = Query("", max_length=1200)):
    if not quotes.HUB.threaded:
        raise HTTPException(status_code=501, detail="streaming is unavailable on this host; poll /api/quotes instead")
    return StreamingResponse(quotes.HUB.stream(_symbols(symbols)), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"})


class WatchBody(BaseModel):
    symbol: str


@app.get("/api/watchlist")
def watchlist():
    return {"symbols": quotes.HUB.watch, **quotes.HUB.get(quotes.HUB.watch)}


@app.post("/api/watchlist")
def watchlist_add(body: WatchBody):
    res = quotes.HUB.add_watch(body.symbol)
    if res.get("error"):
        raise HTTPException(status_code=400, detail=res["error"])
    return res


@app.delete("/api/watchlist/{symbol}")
def watchlist_remove(symbol: str):
    res = quotes.HUB.remove_watch(symbol)
    if res.get("error"):
        raise HTTPException(status_code=404, detail=res["error"])
    return res


# ---- dynamic knowledge base: status, guarded changes, revert ------------------------------------------
@app.get("/api/kb")
def kb_status():
    return {**analyzer.guard.status(), "graph": analyzer.kg.stats()}


class RevertBody(BaseModel):
    to: str = "static"          # "static" | "previous"


@app.post("/api/kb/revert")
def kb_revert(body: RevertBody):
    if body.to not in ("static", "previous"):
        raise HTTPException(status_code=400, detail="to must be 'static' or 'previous'")
    analyzer.guard.revert(body.to)
    return {**analyzer.guard.status(), "graph": analyzer.kg.stats()}


class ModeBody(BaseModel):
    mode: str


@app.post("/api/kb/mode")
def kb_mode(body: ModeBody):
    try:
        analyzer.guard.set_mode(body.mode)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {**analyzer.guard.status(), "graph": analyzer.kg.stats()}


class AssetBody(BaseModel):
    ticker: str
    name: Optional[str] = None
    sector: Optional[str] = None


@app.post("/api/kb/asset")
def kb_add_asset(body: AssetBody):
    res = analyzer.add_asset(body.ticker, body.name, body.sector)
    if res.get("error"):
        raise HTTPException(status_code=400, detail=res["error"])
    quotes.HUB.touch([res["ticker"]])
    return res


@app.delete("/api/kb/asset/{node_id}")
def kb_remove_asset(node_id: str):
    res = analyzer.remove_asset(node_id)
    if res.get("error"):
        raise HTTPException(status_code=404, detail=res["error"])
    return res


class EdgeWeightBody(BaseModel):
    source: str
    target: str
    weight: Optional[float] = None
    strength: Optional[float] = None
    sign: Optional[int] = None
    reason: Optional[str] = None
    linked: Optional[List[Dict[str, Any]]] = None    # links sharing the same reason, adjusted in the same change


class EdgePreviewBody(BaseModel):
    source: str
    target: str
    weight: float
    accepted: Optional[List[str]] = None             # "source>target" keys of the linked links to include (None = defaults)
    analysis_id: Optional[str] = None                # measure the ripple with this analysis's events


def _edit_result(res):
    if res.get("error"):
        raise HTTPException(status_code=400, detail=res["error"])
    return res


@app.post("/api/kb/edge")
def kb_update_edge(body: EdgeWeightBody):
    return _edit_result(analyzer.update_edge(body.source, body.target, weight=body.weight, strength=body.strength,
                                             sign=body.sign, reason=body.reason, linked=body.linked))


@app.post("/api/kb/edge/preview")
def kb_edge_preview(body: EdgePreviewBody):
    """What a link edit would change, before it is saved: the links that share its reason (proposed for the same proportional
    change) and the ripple on every chain, sector and company. Read only."""
    from impactgraph import ripple
    if not analyzer.kg.g.has_edge(body.source, body.target):
        raise HTTPException(status_code=400, detail="Edge (%s -> %s) does not exist in graph." % (body.source, body.target))
    full = LIB.full(body.analysis_id) if body.analysis_id else None
    return ripple.preview(analyzer.kg, body.source, body.target, body.weight, body.accepted, full)


class RescoreBody(BaseModel):
    analysis_id: Optional[str] = None
    result: Optional[Dict[str, Any]] = None          # the analysis itself, when it is not in the library


@app.post("/api/analysis/rescore")
def analysis_rescore(body: RescoreBody):
    """Re-run a saved analysis on the current graph from its saved events (no language model, nothing learned)."""
    prev = (LIB.full(body.analysis_id) if body.analysis_id else None) or body.result
    if not prev:
        raise HTTPException(status_code=404, detail="That analysis is not in the library.")
    res = analyzer.rescore(prev)
    if res.get("error"):
        raise HTTPException(status_code=400, detail=res["error"])
    rec = LIB.record(res, title=(LIB.get(body.analysis_id) or {}).get("title") if body.analysis_id else None)
    res["library_id"] = rec["id"] if rec else None
    return res


class LinkBody(BaseModel):
    source: str
    target: str
    sign: int
    strength: float = 0.5
    lag: int = 1
    mechanism: str = ""
    relation: Optional[str] = None
    reason: Optional[str] = None


@app.post("/api/kb/link")
def kb_add_link(body: LinkBody):
    return _edit_result(analyzer.add_link(body.source, body.target, body.sign, body.strength, body.lag, body.mechanism,
                                          body.relation, body.reason))


@app.post("/api/kb/link/check")
def kb_check_link(body: LinkBody):
    """Dry run: the tier rules for this link, without adding it."""
    return hierarchy.check_link(analyzer.kg, body.source, body.target, body.relation)


class LinkRemoveBody(BaseModel):
    source: str
    target: str
    reason: Optional[str] = None


@app.post("/api/kb/link/remove")
def kb_remove_link(body: LinkRemoveBody):
    return _edit_result(analyzer.remove_link(body.source, body.target, body.reason))


class MoveBody(BaseModel):
    asset: str
    sector: str
    reason: Optional[str] = None


@app.post("/api/kb/move-asset")
def kb_move_asset(body: MoveBody):
    return _edit_result(analyzer.move_asset(body.asset, body.sector, body.reason))


@app.get("/api/kb/history")
def kb_history(limit: int = Query(50, ge=1, le=300), offset: int = Query(0, ge=0)):
    return analyzer.guard.history_view(limit, offset)


@app.get("/api/kb/history/{seq}")
def kb_history_entry(seq: int):
    e = analyzer.guard.entry(seq)
    if not e:
        raise HTTPException(status_code=404, detail="no such history entry")
    return e


class RestoreBody(BaseModel):
    version: int
    reason: Optional[str] = None


@app.post("/api/kb/restore")
def kb_restore(body: RestoreBody):
    try:
        e = analyzer.guard.restore_version(body.version, body.reason)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))
    return {**analyzer.guard.status(), "graph": analyzer.kg.stats(), "entry": {k: v for k, v in e.items() if k != "diff"}}


@app.get("/api/kb/export")
def kb_export():
    return analyzer.guard.export_state()


@app.post("/api/kb/import")
def kb_import(payload: dict = Body(...), reason: Optional[str] = None):
    res = analyzer.guard.import_state(payload, reason)
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res.get("error", "import failed") + (
            ": " + "; ".join(res["failed"]) if res.get("failed") else ""))
    return res


@app.get("/api/headlines")
def headlines():
    return feeds.headlines()


@app.get("/api/sec")
def sec(ticker: str = Query(..., min_length=1, max_length=10), form: str = "8-K"):
    res = feeds.sec_filings(ticker, form)
    if not res:
        raise HTTPException(status_code=404, detail="No SEC record for this ticker (US-listed companies only), or EDGAR could not be reached.")
    return res


class PortfolioHedgeBody(BaseModel):
    holdings: Optional[List[Dict[str, Any]]] = None
    preset: Optional[str] = "aviation_transport"
    total_value_usd: Optional[float] = 50000000.0
    text: Optional[str] = None
    analysis: Optional[Dict[str, Any]] = None


@app.get("/api/portfolio/presets")
def portfolio_presets():
    return {
        "presets": hedge.PORTFOLIO_PRESETS,
        "hedge_candidates": hedge.HEDGE_CANDIDATES,
    }


@app.post("/api/portfolio/hedge")
def portfolio_hedge(body: PortfolioHedgeBody):
    # Determine holdings: from preset or custom list
    holdings = body.holdings
    if not holdings and body.preset in hedge.PORTFOLIO_PRESETS:
        holdings = hedge.PORTFOLIO_PRESETS[body.preset]["holdings"]
    elif not holdings:
        holdings = hedge.PORTFOLIO_PRESETS["aviation_transport"]["holdings"]

    # Determine analysis: if not passed, analyze text or default shock
    analysis_res = body.analysis
    if not analysis_res:
        txt = body.text or "Brent crude jumped 12% following Middle East supply disruption"
        analysis_res = analyzer.analyze(txt, live=False)

    return hedge.analyze_portfolio_hedge(
        analyzer.kg,
        analysis_res,
        holdings,
        total_value_usd=body.total_value_usd or 50000000.0
    )


app.mount("/vendor", StaticFiles(directory=os.path.join(ROOT, "public", "vendor")), name="vendor")


@app.get("/")
def index():
    return FileResponse(os.path.join(ROOT, "public", "index.html"))
