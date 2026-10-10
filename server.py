import os

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from impactgraph import feeds, llm, market
from impactgraph.service import SAMPLES, Analyzer, llm_required

app = FastAPI(title="Apex Zenith")
analyzer = Analyzer()
ROOT = os.path.dirname(os.path.abspath(__file__))


class AnalyzeBody(BaseModel):
    text: str
    live: bool = False
    use_llm: bool = False


@app.post("/api/analyze")
def analyze(body: AnalyzeBody):
    res = analyzer.analyze(body.text, live=body.live, use_llm=body.use_llm)
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
            "news_key": has("NEWSAPI_KEY"), "graph": analyzer.kg.stats()}


@app.get("/api/graph")
def graph():
    return analyzer.kg.full_json()


@app.post("/api/reset")
def reset():
    analyzer.reset()
    return {"ok": True, "graph": analyzer.kg.stats()}


class WhatIfBody(BaseModel):
    trigger: str = "crude_oil"
    magnitude_pct: float
    horizon_days: int = None
    live: bool = False


@app.post("/api/whatif")
def whatif(body: WhatIfBody):
    res = analyzer.whatif(body.trigger, body.magnitude_pct, body.horizon_days, body.live)
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


@app.get("/api/headlines")
def headlines():
    return feeds.headlines()


@app.get("/api/sec")
def sec(ticker: str = Query(..., min_length=1, max_length=10), form: str = "8-K"):
    return feeds.sec_filings(ticker, form)


app.mount("/vendor", StaticFiles(directory=os.path.join(ROOT, "public", "vendor")), name="vendor")


@app.get("/")
def index():
    return FileResponse(os.path.join(ROOT, "public", "index.html"))
