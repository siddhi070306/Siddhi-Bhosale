import os
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from impactgraph import feeds, llm, market, quotes
from impactgraph.service import SAMPLES, Analyzer, llm_required

app = FastAPI(title="Apex Zenith")
analyzer = Analyzer(persist=not os.environ.get("VERCEL"))
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
    return res


@app.get("/api/samples")
def samples():
    return SAMPLES


@app.get("/api/status")
def status():
    p = llm.provider()
    has = lambda k: bool(os.environ.get(k, "").strip())
    return {"llm": p[0] if p else None, "llm_model": p[3] if p else None, "llm_required": llm_required(), "fred_key": has("FRED_API_KEY"),
            "news_key": has("NEWSAPI_KEY"), "graph": analyzer.kg.stats(),
            "kb": {"mode": analyzer.guard.mode, "version": analyzer.guard.version}}


@app.get("/api/graph")
def graph():
    return analyzer.kg.full_json()


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
def events(limit: int = Query(8, ge=1, le=30)):
    out = []
    for i, h in enumerate(feeds.headlines(limit)):
        out.append({"id": "n%d" % i, "time": h.get("published") or "", "title": h["title"], "category": h["source"],
                    "text": (h["title"] + ". " + h["summary"]).strip() if h.get("summary") else h["title"],
                    "link": h.get("link", "")})
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


@app.post("/api/kb/edge")
def kb_update_edge(body: EdgeWeightBody):
    res = analyzer.update_edge(body.source, body.target, weight=body.weight, strength=body.strength, sign=body.sign)
    if res.get("error"):
        raise HTTPException(status_code=400, detail=res["error"])
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


app.mount("/vendor", StaticFiles(directory=os.path.join(ROOT, "public", "vendor")), name="vendor")


@app.get("/")
def index():
    return FileResponse(os.path.join(ROOT, "public", "index.html"))
