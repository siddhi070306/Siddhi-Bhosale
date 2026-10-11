"""Market-data layer: fetch series, validate graph edges against data.

Source order for a node: FRED (no key needed), then Yahoo Finance, then a disk cache of an
earlier live fetch, and only then a *simulated* series. Simulated data is clearly labelled and
never changes any edge's confidence (validating a prior against data generated from that same
prior would be circular).
"""
import csv
import io
import json
import math
import os
import threading
import time
import zlib
from datetime import date, datetime, timedelta

import numpy as np
import requests

from . import kb

CACHE_DIR = (os.path.join("/tmp", "zenith-cache") if os.environ.get("VERCEL")   # serverless FS is read-only except /tmp
             else os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "cache"))
CACHE_TTL = 6 * 3600
WINDOW = 520          # ~2 trading years
MAX_LAG = 10
MIN_N = 120
_mem = {}
_YF_LOCK = threading.Lock()   # yfinance keeps shared global state: concurrent downloads mix tickers up
_YF_FAILS = [0, 0.0]        # consecutive failures, blocked-until timestamp (circuit breaker)
_FINGERPRINTS = {}          # ticker -> tail of its closes, to catch any cross-contamination


# ---------------------------------------------------------------------------------------------
UPSTASH_URL = os.environ.get("UPSTASH_REDIS_REST_URL", "").rstrip("/")
UPSTASH_TOKEN = os.environ.get("UPSTASH_REDIS_REST_TOKEN", "")


def _upstash_get(key):
    if not (UPSTASH_URL and UPSTASH_TOKEN):
        return None
    try:
        r = requests.get(f"{UPSTASH_URL}/get/{key}", headers={"Authorization": f"Bearer {UPSTASH_TOKEN}"}, timeout=2.5)
        if r.status_code == 200:
            val = r.json().get("result")
            if val:
                return json.loads(val) if isinstance(val, str) else val
    except Exception:
        pass
    return None


def _upstash_set(key, data, ex=CACHE_TTL):
    if not (UPSTASH_URL and UPSTASH_TOKEN):
        return False
    try:
        requests.post(f"{UPSTASH_URL}/set/{key}?ex={ex}", headers={"Authorization": f"Bearer {UPSTASH_TOKEN}"},
                      data=json.dumps(data), timeout=2.5)
        return True
    except Exception:
        pass
    return False


def _cache_path(key):
    return os.path.join(CACHE_DIR, key.replace("/", "_").replace("^", "_").replace("=", "_") + ".json")


def _cache_read(key, ignore_ttl=False):
    up = _upstash_get(key)
    if up and (ignore_ttl or time.time() - up.get("t", 0) < CACHE_TTL):
        return up
    try:
        with open(_cache_path(key), "r", encoding="utf-8") as f:
            d = json.load(f)
        if ignore_ttl or time.time() - d["t"] < CACHE_TTL:
            return d
    except Exception:
        pass
    return None


def _cache_write(key, dates, vals):
    payload = {"t": time.time(), "dates": dates, "vals": vals}
    _upstash_set(key, payload)
    try:
        os.makedirs(CACHE_DIR, exist_ok=True)
        with open(_cache_path(key), "w", encoding="utf-8") as f:
            json.dump(payload, f)
    except Exception:
        pass


def _get_with_retry(url, timeout=15, attempts=3):
    last = None
    for i in range(attempts):
        try:
            r = requests.get(url, timeout=timeout)
            r.raise_for_status()
            return r
        except Exception as exc:
            last = exc
            time.sleep(1.0 * (i + 1))
    raise last


def _fred_api(series_id, key, timeout):
    start = (date.today() - timedelta(days=int(WINDOW * 1.6))).isoformat()
    r = _get_with_retry("https://api.stlouisfed.org/fred/series/observations?series_id=%s&api_key=%s&file_type=json"
                        "&observation_start=%s" % (series_id, key, start), timeout)
    dates, vals = [], []
    for o in r.json().get("observations", []):
        try:
            vals.append(float(o["value"]))
            dates.append(o["date"])
        except (ValueError, KeyError):
            continue            # FRED marks missing days with "."
    return dates, vals


def fetch_fred(series_id, timeout=15):
    """Official FRED API when FRED_API_KEY is set (falls back to the public CSV download)."""
    key = os.environ.get("FRED_API_KEY", "").strip()
    if key:
        try:
            dates, vals = _fred_api(series_id, key, timeout)
            if len(vals) > 30:
                return dates[-WINDOW - 1:], vals[-WINDOW - 1:]
        except Exception:
            pass
    r = _get_with_retry("https://fred.stlouisfed.org/graph/fredgraph.csv?id=" + series_id, timeout)
    rows = list(csv.reader(io.StringIO(r.text)))[1:]
    dates, vals = [], []
    for row in rows:
        if len(row) < 2 or row[1].strip() in ("", "."):
            continue
        try:
            vals.append(float(row[1]))
            dates.append(row[0])
        except ValueError:
            continue
    return dates[-WINDOW - 1:], vals[-WINDOW - 1:]


def fetch_yf(ticker, timeout=10):
    import yfinance as yf
    if time.time() < _YF_FAILS[1]:
        raise RuntimeError("Yahoo Finance temporarily skipped after repeated failures")
    with _YF_LOCK:
        try:
            df = yf.download(ticker, period="2y", interval="1d", progress=False, auto_adjust=True,
                             timeout=timeout, threads=False)
        except Exception:
            df = None
    if df is None or df.empty:
        _YF_FAILS[0] += 1
        if _YF_FAILS[0] >= 3:               # throttled or offline: stop hammering for 5 minutes
            _YF_FAILS[1] = time.time() + 300
        raise ValueError("no data for " + ticker)
    _YF_FAILS[0] = 0
    close = df["Close"]
    if hasattr(close, "columns"):
        close = close.iloc[:, 0]
    close = close.dropna()
    dates = [d.strftime("%Y-%m-%d") for d in close.index][-WINDOW - 1:]
    vals = [float(x) for x in close.values][-WINDOW - 1:]
    tail = tuple(round(v, 4) for v in vals[-40:])
    for other, fp in _FINGERPRINTS.items():
        if other != ticker and fp == tail:
            raise ValueError("%s returned the same data as %s; discarded" % (ticker, other))
    _FINGERPRINTS[ticker] = tail
    return dates, vals


def fetch_live(src, sid):
    return fetch_fred(sid) if src == "fred" else fetch_yf(sid)


def _transform(dates, vals, kind):
    v = np.asarray(vals, dtype=float)
    if kind == "diff":
        r = np.diff(v)
    else:
        v = np.where(v <= 0, np.nan, v)
        r = np.diff(np.log(v))
    return dates[1:], r


# ---------------------------------------------------------------------------------------------
def _sim_factors(n=WINDOW):
    rs = np.random.RandomState(7)
    oil = rs.normal(0, 0.02, n + 20)
    infl = np.zeros(n + 20)
    rates = np.zeros(n + 20)
    infl[5:] = 0.4 * oil[:-5]
    infl += rs.normal(0, 0.012, n + 20)
    rates[10:] = 0.35 * infl[:-10]
    rates += rs.normal(0, 0.012, n + 20)
    risk = rs.normal(0, 0.012, n + 20)
    return oil[20:], infl[20:], rates[20:], risk[20:]


def _sim_series(node_id, n=WINDOW):
    f = _sim_factors(n)
    lo, li, lr, lk = kb.sim_loading(node_id)
    rs = np.random.RandomState(zlib.crc32(node_id.encode()) & 0xFFFFFFFF)
    r = lo * f[0] + li * f[1] + lr * f[2] + lk * f[3] + rs.normal(0, 0.006, n)
    end = date.today()
    ds, d = [], end
    while len(ds) < n:
        if d.weekday() < 5:
            ds.append(d.strftime("%Y-%m-%d"))
        d -= timedelta(days=1)
    ds.reverse()
    return ds, r


def get_returns(node_id, live=True):
    """-> (dates, returns ndarray, info dict) or None if the node has no series at all."""
    node = kb.NODES.get(node_id)
    if not node:
        return None
    key = "%s|%s" % (node_id, live)
    if key in _mem:
        return _mem[key]
    res = None
    for src, sid, kind in node["series"]:
        ck = "%s_%s" % (src, sid)
        if live:
            hit = _cache_read(ck)
            data = None
            if hit:
                data, label = (hit["dates"], hit["vals"]), "live (cached %s)" % datetime.fromtimestamp(hit["t"]).strftime("%b %d %H:%M")
            else:
                try:
                    data = fetch_live(src, sid)
                    _cache_write(ck, *data)
                    label = "live"
                except Exception:
                    old = _cache_read(ck, ignore_ttl=True)
                    if old:
                        data, label = (old["dates"], old["vals"]), "cached (stale, %s)" % datetime.fromtimestamp(old["t"]).strftime("%b %d")
            if data and len(data[0]) > MIN_N:
                d, r = _transform(data[0], data[1], kind)
                res = (d, r, {"source": src.upper() + ":" + sid, "mode": label, "simulated": False, "kind": kind})
                break
        else:
            old = _cache_read("%s_%s" % (src, sid), ignore_ttl=True)
            if old and len(old["dates"]) > MIN_N:
                d, r = _transform(old["dates"], old["vals"], kind)
                res = (d, r, {"source": src.upper() + ":" + sid, "mode": "cached", "simulated": False, "kind": kind})
                break
    if res is None and (node["series"] or node_id in kb.SIM_LOADINGS):
        d, r = _sim_series(node_id)
        res = (d, r, {"source": "simulated", "mode": "simulated", "simulated": True, "kind": "ret"})
    _mem[key] = res
    return res


def clear_memory_cache():
    _mem.clear()


# ---------------------------------------------------------------------------------------------
def _align(a, b):
    da, ra = a
    db, rb = b
    ia = {d: i for i, d in enumerate(da)}
    common = [d for d in db if d in ia]
    if len(common) < MIN_N:
        return None
    x = np.array([ra[ia[d]] for d in common])
    ib = {d: i for i, d in enumerate(db)}
    y = np.array([rb[ib[d]] for d in common])
    ok = np.isfinite(x) & np.isfinite(y)
    return x[ok], y[ok]


def validate_edge(kg, u, v, live=True):
    """Lagged correlation between u's and v's moves, compared with the edge's expected sign."""
    su, sv = get_returns(u, live), get_returns(v, live)
    if not su or not sv:
        return {"verdict": "no_data", "adjusts": False, "multiplier": 1.0, "note": "no market series for one endpoint"}
    if su[2]["source"] == sv[2]["source"] and not su[2]["simulated"]:
        return {"verdict": "same_series", "adjusts": False, "multiplier": 1.0,
                "note": "Both ends use the same market series (membership / ETF link); not independent evidence."}
    sim = su[2]["simulated"] or sv[2]["simulated"]
    pair = _align((su[0], su[1]), (sv[0], sv[1]))
    if pair is None:
        return {"verdict": "no_data", "adjusts": False, "multiplier": 1.0, "note": "too little overlapping history"}
    x, y = pair
    expected = kg.g[u][v]["sign"]
    kb_lag = kg.g[u][v]["lag"]
    max_lag = min(MAX_LAG, max(2, int(1.5 * kb_lag) + 1))
    cs = []
    for lag in range(0, max_lag + 1):
        if len(x) - lag < MIN_N:
            break
        c = float(np.corrcoef(x[:len(x) - lag], y[lag:])[0, 1]) if lag else float(np.corrcoef(x, y)[0, 1])
        if math.isfinite(c):
            cs.append((lag, c))
    if not cs:
        return {"verdict": "no_data", "adjusts": False, "multiplier": 1.0, "note": "correlation undefined"}
    top = max(abs(c) for _, c in cs)
    lag, c = next((l, c) for l, c in cs if abs(c) >= top - 0.02)   # shortest lag among near-ties
    thr = 2.8 / math.sqrt(len(x))
    if abs(c) < thr:
        verdict, mult = "inconclusive", 1.0
    elif (c > 0) == (expected > 0):
        verdict, mult = "supported", 1.0 + min(0.25, abs(c) / 2)
    else:
        verdict, mult = "contradicted", max(0.55, 1 - abs(c))

    # ---- Dynamic Rolling Transmission Lag & Volatility Regime ----
    # Shocks propagate faster in high-volatility regimes (margin calls, algorithmic de-risking)
    # and slower in low-volatility regimes (delayed quarterly contract repricing).
    vol_ratio = 1.0
    vol_regime = "normal"
    if len(x) >= 45:
        recent_std = float(np.std(x[-30:]))
        long_std = float(np.std(x))
        if long_std > 1e-6:
            vol_ratio = round(recent_std / long_std, 3)
            if vol_ratio >= 1.35:
                vol_regime = "high_volatility"
            elif vol_ratio >= 1.15:
                vol_regime = "elevated"
            elif vol_ratio <= 0.80:
                vol_regime = "low_volatility"
            else:
                vol_regime = "normal"

    vol_mult = 0.65 if vol_regime == "high_volatility" else (0.85 if vol_regime == "elevated" else (1.25 if vol_regime == "low_volatility" else 1.0))
    if kb_lag == 0:
        dynamic_lag = 0  # identity / index-weight link remains instantaneous
    else:
        alpha = min(0.70, abs(c)) if abs(c) >= thr else 0.0
        blended_lag = alpha * lag + (1.0 - alpha) * kb_lag
        dynamic_lag = max(1, int(round(blended_lag * vol_mult)))

    return {"verdict": verdict, "corr": round(c, 3), "lag_days": lag, "dynamic_lag": dynamic_lag,
            "base_lag": kb_lag, "vol_regime": vol_regime, "vol_ratio": vol_ratio,
            "n": int(len(x)), "threshold": round(thr, 3), "multiplier": round(mult, 3), "adjusts": not sim,
            "data": "%s -> %s" % (su[2]["source"], sv[2]["source"]), "simulated": sim,
            "mode": su[2]["mode"] if su[2]["mode"] == sv[2]["mode"] else "mixed",
            "note": ("Simulated data: shown for demonstration only, does not change confidence." if sim
                     else "Correlation over ~%d trading days; dynamic lag %d days (%s regime, vol ratio %.2f)." % (len(x), dynamic_lag, vol_regime, vol_ratio))}


def sparkline(node_id, live=True, points=90):
    s = get_returns(node_id, live)
    if not s:
        return None
    d, r, info = s
    if info["kind"] == "diff":
        lvl = np.cumsum(r[-points:])
    else:
        lvl = 100 * np.exp(np.cumsum(r[-points:]))
    return {"dates": d[-points:], "values": [round(float(x), 3) for x in lvl], "info": info}


def macro_snapshot(live=True):
    """Latest FRED macro backdrop (a few headline numbers)."""
    items = [("Fed funds (DFF)", "DFF", "level"), ("10Y yield (DGS10)", "DGS10", "level"),
             ("5Y breakeven inflation (T5YIE)", "T5YIE", "level"), ("PCE inflation y/y (PCEPI)", "PCEPI", "yoy")]
    out = []
    if not live:
        return out
    for label, sid, mode in items:
        try:
            ck = "fredm_" + sid
            hit = _cache_read(ck)
            if hit:
                dates, vals = hit["dates"], hit["vals"]
            else:
                r = _get_with_retry("https://fred.stlouisfed.org/graph/fredgraph.csv?id=" + sid, 12, 2)
                rows = [x for x in list(csv.reader(io.StringIO(r.text)))[1:] if len(x) > 1 and x[1] not in ("", ".")]
                dates, vals = [x[0] for x in rows][-400:], [float(x[1]) for x in rows][-400:]
                _cache_write(ck, dates, vals)
            if mode == "yoy":
                latest = datetime.strptime(dates[-1], "%Y-%m-%d")
                prior = None
                for dd, vv in zip(reversed(dates), reversed(vals)):
                    if datetime.strptime(dd, "%Y-%m-%d") <= latest - timedelta(days=365):
                        prior = vv
                        break
                val = (vals[-1] / prior - 1) * 100 if prior else None
            else:
                val = vals[-1]
            if val is not None:
                out.append({"label": label, "value": round(val, 2), "as_of": dates[-1], "source": "FRED"})
        except Exception:
            continue
    return out
