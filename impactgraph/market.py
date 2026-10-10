"""Headline market levels for the dashboard, from FRED (real data only; nothing is invented).

Each item is fetched through timeseries.fetch_fred (official API if FRED_API_KEY is set, else the
public CSV) and cached on disk like every other series. If a series cannot be fetched it is simply
left out; if none can, the caller gets available=False.
"""
import time
from concurrent.futures import ThreadPoolExecutor

from . import timeseries as ts

ITEMS = [
    ("sp500", "S&P 500", "SP500", 2),
    ("nasdaq", "NASDAQ Composite", "NASDAQCOM", 2),
    ("dow", "Dow Jones", "DJIA", 2),
    ("brent", "Brent Crude ($/bbl)", "DCOILBRENTEU", 2),
    ("us10y", "US 10Y Yield (%)", "DGS10", 2),
    ("vix", "VIX", "VIXCLS", 2),
]
_TTL = 900
_cache = {"t": 0, "val": None}


def _levels(sid):
    key = "lvl_fred_" + sid
    hit = ts._cache_read(key)
    if hit:
        return hit["dates"], hit["vals"]
    dates, vals = ts.fetch_fred(sid, 12)
    ts._cache_write(key, dates, vals)
    return dates, vals


def _one(item):
    id_, name, sid, dp = item
    try:
        dates, vals = _levels(sid)
        if len(vals) < 3:
            return None
        last, prev = vals[-1], vals[-2]
        pct = (last / prev - 1) * 100 if prev else 0.0
        return {"id": id_, "name": name, "series": sid, "source": "FRED:" + sid, "asof": dates[-1],
                "price": "{:,.{d}f}".format(last, d=dp), "change": "%+.2f%%" % pct, "isPositive": pct >= 0,
                "sparkline": [round(v, 4) for v in vals[-30:]]}
    except Exception:
        return None


def snapshot():
    if _cache["val"] is not None and time.time() - _cache["t"] < _TTL:
        return _cache["val"]
    with ThreadPoolExecutor(max_workers=6) as pool:
        got = [g for g in pool.map(_one, ITEMS) if g]
    out = {"available": bool(got), "tickers": got,
           "note": None if got else "FRED market series could not be reached."}
    if got:
        _cache.update(t=time.time(), val=out)
    return out
