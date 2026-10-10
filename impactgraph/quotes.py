"""Live quotes from Yahoo Finance (via yfinance), polled in the background and pushed to browsers.

Honest notes
  * Yahoo offers no webhooks. Two real feeds are used instead: (1) yfinance's WebSocket (wss://streamer.finance.yahoo.com),
    which pushes a tick whenever a symbol trades, and (2) a batched poll every POLL_SECONDS that supplies the
    previous close and covers anything the socket is silent on (closed markets send no ticks). Both feed one
    cache, and every update is pushed to browsers over Server-Sent Events (/api/stream). Prices can be delayed
    by the exchange and are never simulated.
  * If Yahoo throttles or is unreachable, the last good quote stays visible with an error and an age;
    nothing is invented.
  * On serverless hosts (VERCEL) background threads do not persist, so only on-demand fetching is used.
"""
import json
import os
import re
import threading
import time

from . import timeseries as ts

SYMBOL_RE = re.compile(r"^[A-Za-z0-9^][A-Za-z0-9.=\-^]{0,14}$")
POLL_SECONDS = 20
WANTED_TTL = 180          # a symbol a browser asked for stays polled this long after its last request
MAX_SYMBOLS = 60
CHUNK = 25
SOURCE = "Yahoo Finance (yfinance)"
WATCH_FILE = (None if os.environ.get("VERCEL") else
              os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "watchlist.json"))


def valid_symbol(s):
    return bool(s) and bool(SYMBOL_RE.match(s))


def _series(df, sym, many):
    """Close series for one symbol from a yfinance frame, tolerant of both column layouts."""
    for getter in (lambda: df[sym]["Close"], lambda: df["Close"][sym], lambda: df["Close"]):
        try:
            s = getter()
        except Exception:
            continue
        if hasattr(s, "columns"):
            if sym in getattr(s, "columns", []):
                s = s[sym]
            elif not many and s.shape[1] >= 1:
                s = s.iloc[:, 0]
            else:
                continue
        return s.dropna()
    return None


def download(symbols):
    """-> {symbol: quote or {'error': ...}} for up to CHUNK symbols, one Yahoo request. Raises on transport failure."""
    import yfinance as yf
    if time.time() < ts._YF_FAILS[1]:
        raise RuntimeError("Yahoo Finance paused for a few minutes after repeated failures (rate limit?)")
    many = len(symbols) > 1
    with ts._YF_LOCK:     # yfinance shares global state between threads; one download at a time
        try:
            df = yf.download(symbols if many else symbols[0], period="5d", interval="1d", group_by="ticker",
                             progress=False, auto_adjust=False, threads=False, timeout=10)
        except Exception as e:
            df = None
            err = str(e)[:120]
    if df is None or df.empty:
        why = " ".join(str(v) for v in getattr(yf.shared, "_ERRORS", {}).values()).lower() if df is not None else ""
        if df is not None and why and not any(k in why for k in ("rate", "too many", "timed out", "connection")):
            # Yahoo answered, but has nothing for these symbols (typo / delisted): not a transport failure
            now = time.time()
            return {s: {"symbol": s, "error": "no data for this symbol on Yahoo Finance (check the ticker)", "fetched": now}
                    for s in symbols}
        ts._YF_FAILS[0] += 1
        if ts._YF_FAILS[0] >= 3:
            ts._YF_FAILS[1] = time.time() + 300
        raise RuntimeError("Yahoo Finance returned no data" + (": " + err if df is None else (" (rate limited?)" if why else "")))
    ts._YF_FAILS[0] = 0
    now, out, tails = time.time(), {}, {}
    for sym in symbols:
        s = _series(df, sym, many)
        if s is None or len(s) < 1:
            out[sym] = {"symbol": sym, "error": "no data for this symbol on Yahoo Finance", "fetched": now}
            continue
        price = float(s.iloc[-1])
        prev = float(s.iloc[-2]) if len(s) > 1 else None
        tail = tuple(round(float(v), 4) for v in s.iloc[-5:])
        tails.setdefault(tail, []).append(sym)
        out[sym] = {"symbol": sym, "price": price, "prev_close": prev,
                    "change": (price - prev) if prev else None,
                    "change_pct": ((price / prev - 1) * 100) if prev else None,
                    "asof": s.index[-1].strftime("%Y-%m-%d"), "fetched": now, "source": SOURCE}
    for tail, syms in tails.items():       # identical series for different symbols = a data mix-up: discard
        if len(syms) > 1 and len(tail) >= 3:
            for sym in syms:
                out[sym] = {"symbol": sym, "error": "identical series returned for %s; discarded" % ", ".join(syms), "fetched": now}
    return out


class QuoteHub:
    def __init__(self, fetcher=download, poll=POLL_SECONDS, watch_file=WATCH_FILE, threaded=None):
        self.fetcher, self.poll, self.watch_file = fetcher, poll, watch_file
        self.threaded = (not os.environ.get("VERCEL")) if threaded is None else threaded
        self.cache, self.wanted = {}, {}
        self.cond = threading.Condition()
        self.version = 0
        self.last_error, self.last_ok = None, 0.0
        self._thread = None
        self._lock = threading.Lock()
        self._ws, self._ws_syms, self._ws_started = None, set(), 0.0
        self.ws_state, self.ws_error = "off", None     # off | connecting | connected | reconnecting | unavailable
        self._dirty, self._last_notify = False, 0.0
        self.watch = self._load_watch()

    # ---- watchlist ----------------------------------------------------------------------------
    def _load_watch(self):
        try:
            with open(self.watch_file, encoding="utf-8") as f:
                return [s for s in json.load(f) if valid_symbol(s)]
        except Exception:
            return []

    def _save_watch(self):
        if not self.watch_file:
            return
        try:
            os.makedirs(os.path.dirname(self.watch_file), exist_ok=True)
            with open(self.watch_file, "w", encoding="utf-8") as f:
                json.dump(self.watch, f)
        except Exception:
            pass

    def add_watch(self, symbol):
        sym = (symbol or "").strip().upper()
        if not valid_symbol(sym):
            return {"error": "not a valid ticker symbol: %r" % symbol}
        if sym in self.watch:
            return {"error": "%s is already on the watchlist" % sym}
        if len(self.watch) >= MAX_SYMBOLS:
            return {"error": "watchlist is full (%d)" % MAX_SYMBOLS}
        q = self.fetch_now([sym]).get(sym)
        if not q or q.get("error"):
            return {"error": (q or {}).get("error", "no quote")}
        self.watch.append(sym)
        self._save_watch()
        self.start()
        return {"symbol": sym, "quote": q}

    def remove_watch(self, symbol):
        sym = (symbol or "").strip().upper()
        if sym not in self.watch:
            return {"error": "%s is not on the watchlist" % sym}
        self.watch.remove(sym)
        self._save_watch()
        return {"ok": True}

    # ---- fetching -----------------------------------------------------------------------------
    def fetch_now(self, symbols):
        """Synchronously fetch and cache; returns {symbol: quote-or-error}. Never raises."""
        symbols = [s for s in dict.fromkeys(symbols) if valid_symbol(s)][:MAX_SYMBOLS]
        out = {}
        for i in range(0, len(symbols), CHUNK):
            chunk = symbols[i:i + CHUNK]
            try:
                got = self.fetcher(chunk)
                self.last_ok, self.last_error = time.time(), None
            except Exception as e:
                self.last_error = str(e)[:160]
                got = {}
                for s in chunk:                       # keep the last good quote, flagged with the failure
                    old = self.cache.get(s)
                    got[s] = dict(old, error=self.last_error) if old and "price" in old else {"symbol": s, "error": self.last_error, "fetched": time.time()}
            self._store(got)                  # publish each chunk as soon as it arrives
            out.update(got)
        return out

    def _store(self, got):
        now = time.time()
        for s, q in got.items():           # a very recent websocket tick is fresher than the polled daily bar
            old = self.cache.get(s)
            if old and "price" in q and old.get("tick_t", 0) > now - 2 * self.poll:
                q["price"], q["tick_t"], q["source"] = old["price"], old["tick_t"], old["source"]
                if q.get("prev_close"):
                    q["change"] = q["price"] - q["prev_close"]
                    q["change_pct"] = (q["price"] / q["prev_close"] - 1) * 100
        with self.cond:
            self.cache.update(got)
            self._bump()

    def _bump(self):
        """Caller holds self.cond."""
        self.version += 1
        self._dirty, self._last_notify = False, time.time()
        self.cond.notify_all()

    def touch(self, symbols):
        now = time.time()
        for s in symbols:
            if valid_symbol(s):
                self.wanted[s] = now

    def active(self):
        now = time.time()
        for s in [s for s, t in self.wanted.items() if now - t > WANTED_TTL]:
            del self.wanted[s]
        return list(dict.fromkeys(self.watch + list(self.wanted)))[:MAX_SYMBOLS]

    def ensure(self, symbols):
        """Fetch synchronously whatever is missing or older than two polls."""
        now = time.time()
        need = [s for s in symbols if s not in self.cache or now - self.cache[s].get("fetched", 0) > self.poll * 2]
        if need:
            self.fetch_now(need)

    def snapshot(self, symbols):
        now = time.time()
        quotes = {}
        for s in symbols:
            q = self.cache.get(s)
            if q is not None:
                quotes[s] = dict(q, age_s=round(now - q.get("fetched", now)))
        for q in quotes.values():
            q["live_tick"] = bool(q.get("tick_t") and now - q["tick_t"] < 120)
        return {"quotes": quotes, "t": now, "poll_seconds": self.poll, "streaming": self.threaded,
                "transport": "websocket+poll" if self.ws_state == "connected" else "poll",
                "ws_state": self.ws_state, "ws_error": self.ws_error,
                "last_error": self.last_error, "source": SOURCE}

    def get(self, symbols):
        symbols = [s.strip().upper() for s in symbols if valid_symbol(s.strip().upper())][:MAX_SYMBOLS]
        self.touch(symbols)
        self.ensure(symbols)
        self.start()
        return self.snapshot(symbols)

    # ---- background poller + push -------------------------------------------------------------
    def start(self):
        if not self.threaded:
            return
        with self._lock:
            if self._thread and self._thread.is_alive():
                return
            self._thread = threading.Thread(target=self._loop, name="quote-poller", daemon=True)
            self._thread.start()

    def _loop(self):
        threading.Thread(target=self._ws_loop, name="quote-websocket", daemon=True).start()
        last_poll = 0.0
        while True:
            time.sleep(2)
            now, syms = time.time(), self.active()
            if syms and now - last_poll >= self.poll:
                last_poll = now
                self.fetch_now(syms)
            if self._dirty and now - self._last_notify > 0.5:       # flush throttled websocket ticks
                with self.cond:
                    self._bump()
            # the socket subscribes to a fixed set: reconnect when the wanted set has changed
            if self._ws is not None and set(syms) != self._ws_syms and now - self._ws_started > 10:
                try:
                    self._ws.close()
                except Exception:
                    pass

    def _on_tick(self, msg):
        """One yfinance WebSocket message -> cache."""
        try:
            sym, price = msg.get("id"), float(msg["price"])
        except (KeyError, TypeError, ValueError):
            return
        if not sym or price <= 0:
            return
        now = time.time()
        old = self.cache.get(sym) or {}
        chg = msg.get("change")
        prev = old.get("prev_close") or ((price - float(chg)) if chg is not None else None)
        try:
            t = int(msg.get("time") or 0) / 1000.0
        except ValueError:
            t = now
        self.cache[sym] = dict(old, symbol=sym, price=price, prev_close=prev,
                               change=(price - prev) if prev else None,
                               change_pct=((price / prev - 1) * 100) if prev else msg.get("change_percent"),
                               asof=time.strftime("%Y-%m-%d", time.localtime(t or now)), fetched=now, tick_t=now,
                               source=SOURCE.replace(")", " WebSocket)"), error=None)
        self._dirty = True

    def _ws_loop(self):
        try:
            import yfinance as yf
            WS = yf.WebSocket
        except Exception:
            self.ws_state = "unavailable"
            return
        while True:
            syms = self.active()
            if not syms:
                time.sleep(2)
                continue
            self.ws_state = "connecting"
            ws = WS(verbose=False)
            self._ws, self._ws_syms, self._ws_started = ws, set(syms), time.time()
            try:
                ws.subscribe(syms)
                self.ws_state, self.ws_error = "connected", None
                ws.listen(self._on_tick)                      # returns when the socket closes
            except Exception as e:
                self.ws_error = str(e)[:120]
            self._ws, self.ws_state = None, "reconnecting"
            time.sleep(3)

    def stream(self, symbols, heartbeat=15):
        """Generator of Server-Sent-Event strings: a snapshot now, then one on every poller update."""
        symbols = [s.strip().upper() for s in symbols if valid_symbol(s.strip().upper())][:MAX_SYMBOLS]
        self.touch(symbols)
        self.start()
        # send what is cached right away; missing quotes are fetched in the background and pushed when they arrive
        threading.Thread(target=self.ensure, args=(symbols,), daemon=True).start()
        last = -1
        while True:
            with self.cond:
                if self.version == last:
                    self.cond.wait(timeout=heartbeat)
                v = self.version
            self.touch(symbols)
            if v != last:
                last = v
                yield "event: quotes\ndata: %s\n\n" % json.dumps(self.snapshot(symbols))
            else:
                yield ": keepalive\n\n"


HUB = QuoteHub()
