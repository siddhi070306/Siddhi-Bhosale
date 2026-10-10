"""Optional live inputs: public finance RSS headlines and SEC EDGAR 8-K filing metadata.

Both are best-effort; every function returns [] on any failure so the offline demo is unaffected.
"""
import os
import re
import xml.etree.ElementTree as ET
import ipaddress
import socket
import time
from html import unescape
from urllib import robotparser
from urllib.parse import urljoin, urlparse

import requests

# Checked live 2026-10-11: Moneycontrol answers HTTP 403 to non-browser clients and Yahoo's old RSS index is a 404,
# so both were replaced by feeds that answer 200 (ET Markets and Livemint also cover India).
RSS_FEEDS = [
    ("CNBC Markets", "https://www.cnbc.com/id/10000664/device/rss/rss.html"),
    ("MarketWatch", "https://feeds.content.dowjones.io/public/rss/mw_topstories"),
    ("ET Markets", "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms"),
    ("Livemint", "https://www.livemint.com/rss/markets"),
]
_UA = {"User-Agent": "Mozilla/5.0 (compatible; ApexZenith/1.0)"}
_CACHE = {}


def _cached(key, ttl, fn):
    hit = _CACHE.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    val = fn()
    if val:                       # never cache a failure
        _CACHE[key] = (time.time(), val)
    return val


def _clean(s):
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()

# ---- fetching a full article, safely ----------------------------------------------------------------
# Rules this respects: only public http(s) hosts (no SSRF to localhost / private networks / cloud metadata,
# checked on every redirect), robots.txt (RFC 9309: 4xx = allowed, unreachable = refused), an honest
# User-Agent, a size cap, and no storage: the text is used for one analysis and discarded. Paywalled or
# blocked pages simply fall back to the headline + description. This is not legal advice: publishers' terms
# of use can still restrict automated reading even where robots.txt allows it. Residual risk: a hostile DNS
# server could answer differently between the check and the request (DNS rebinding).
ARTICLE_UA = "ApexZenith/1.0 (research prototype; respects robots.txt)"
MAX_BYTES = 1500000
MAX_ARTICLE_CHARS = 5000
MIN_ARTICLE_CHARS = 400
_ROBOTS = {}


def _public_host(host):
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError:
        return False
    return bool(infos) and all(ipaddress.ip_address(i[4][0]).is_global for i in infos)


def _url_problem(url):
    p = urlparse(url)
    if p.scheme not in ("http", "https") or not p.hostname:
        return "only http(s) URLs are allowed"
    if p.username or p.password or p.port not in (None, 80, 443):
        return "URL with credentials or a non-standard port refused"
    if not _public_host(p.hostname):
        return "host is not a public internet address"
    return None


def _safe_get(url, timeout=10, hops=4):
    """GET with manual redirects so every hop is re-checked. -> (response, None) or (None, reason)."""
    for _ in range(hops + 1):
        bad = _url_problem(url)
        if bad:
            return None, bad
        try:
            r = requests.get(url, headers={"User-Agent": ARTICLE_UA, "Accept": "text/html,text/plain,*/*;q=0.5"},
                             timeout=timeout, allow_redirects=False, stream=True)
        except requests.RequestException as e:
            return None, "request failed (%s)" % type(e).__name__
        if r.status_code in (301, 302, 303, 307, 308) and r.headers.get("location"):
            url = urljoin(url, r.headers["location"])
            r.close()
            continue
        return r, None
    return None, "too many redirects"


def _robots_allow(url):
    p = urlparse(url)
    root = "%s://%s" % (p.scheme, p.netloc)
    hit = _ROBOTS.get(root)
    if not hit or time.time() - hit[0] > 3600:
        r, why = _safe_get(root + "/robots.txt", timeout=6)
        if r is None:
            rp = None
        elif r.status_code == 200:
            rp = robotparser.RobotFileParser()
            rp.parse(r.raw.read(200000, decode_content=True).decode("utf-8", "replace").splitlines())
        elif 400 <= r.status_code < 500:
            rp = True            # no robots.txt: everything allowed
        else:
            rp = None            # server error: assume disallowed (RFC 9309)
        if r is not None:
            r.close()
        hit = _ROBOTS[root] = (time.time(), rp)
    rp = hit[1]
    if rp is None:
        return False
    return True if rp is True else rp.can_fetch(ARTICLE_UA, url)


def fetch_article(url):
    """-> {"ok", "text", "title", "reason"}. Never raises. text is capped and is not stored anywhere."""
    def fail(reason, meta=""):
        return {"ok": False, "text": "", "title": "", "reason": reason, "meta": meta}
    bad = _url_problem(url)
    if bad:
        return fail(bad)
    if not _robots_allow(url):
        return fail("the site's robots.txt does not allow automated access")
    r, why = _safe_get(url)
    if r is None:
        return fail(why)
    try:
        if r.status_code != 200:
            return fail("the site answered HTTP %d" % r.status_code)
        if "html" not in r.headers.get("content-type", "").lower():
            return fail("not an HTML page")
        raw = r.raw.read(MAX_BYTES, decode_content=True)
        html = raw.decode(r.encoding or "utf-8", "replace")
    except Exception as e:
        return fail("could not read the page (%s)" % type(e).__name__)
    finally:
        r.close()
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        return fail("beautifulsoup4 is not installed")
    soup = BeautifulSoup(html, "html.parser")
    for el in soup(["script", "style", "nav", "footer", "header", "aside", "form", "noscript", "figure"]):
        el.extract()
    root = soup.find("article") or soup.body or soup
    seen, paras = set(), []
    for p in root.find_all("p"):
        t = _clean(p.get_text(" "))
        if len(t) > 40 and t not in seen:
            seen.add(t)
            paras.append(t)
    text = " ".join(paras)[:MAX_ARTICLE_CHARS]
    title = _clean(soup.title.string) if soup.title and soup.title.string else ""
    meta = ""
    for attrs in ({"property": "og:description"}, {"name": "description"}, {"name": "twitter:description"}):
        tag = soup.find("meta", attrs=attrs)
        if tag and len(_clean(tag.get("content"))) > len(meta):
            meta = _clean(tag.get("content"))
    if len(text) < MIN_ARTICLE_CHARS:
        return fail("page has too little readable text (paywall, login wall or script-rendered)", meta)
    return {"ok": True, "text": text, "title": title, "reason": "", "meta": meta}


def scrape_article(url):
    """Back-compat wrapper: article text (with title) or "" when it cannot be read."""
    a = fetch_article(url)
    return (a["title"] + ".\n\n" + a["text"]).strip() if a["ok"] else ""


def article_snippet(a):
    """Everything NewsAPI gives for free: description plus the (200-char) content when it adds something."""
    desc = _clean(a.get("description"))
    content = re.sub(r"\s*\[\+\d+ chars\]\s*$", "", _clean(a.get("content"))).rstrip("\u2026. ")
    if content and desc and content.lower().startswith(desc.lower()[:60]):
        content = content[len(desc):].strip() if len(content) > len(desc) else ""    # keep only what the description lacks
    elif content and desc and content[:60].lower() in desc.lower():
        content = ""
    return " ".join(x for x in (desc, content) if x)


def newsapi_headlines(limit=25):
    """Business headlines from newsapi.org (US + India) when NEWSAPI_KEY is set."""
    key = os.environ.get("NEWSAPI_KEY", "").strip()
    if not key:
        return []
    out = []

    def add(articles, tag):
        for a in articles:
            title = _clean(a.get("title"))
            if title and title != "[Removed]":
                out.append({"source": "NewsAPI/" + ((a.get("source") or {}).get("name") or tag),
                            "title": title, "summary": article_snippet(a),
                            "link": a.get("url") or "", "published": a.get("publishedAt") or ""})

    def get(path, **params):
        for attempt in range(2):  # NewsAPI is occasionally slow; one retry before giving up on a call
            try:
                r = requests.get("https://newsapi.org/v2/" + path, timeout=25, headers={"X-Api-Key": key}, params=params)
                r.raise_for_status()
                return r.json().get("articles", [])
            except Exception:
                continue
        return []

    add(get("top-headlines", category="business", country="us", pageSize=20), "US")
    india = get("top-headlines", category="business", country="in", pageSize=20)
    if not india:  # NewsAPI often has no India business top-headlines; search instead
        india = get("everything", qInTitle="RBI OR Sensex OR Nifty OR rupee OR \"Indian economy\"", language="en",
                    sortBy="publishedAt", pageSize=15)
    add(india, "IN")
    # interleave US and India items so a short list shows both markets
    n_us = len(out) - len([1 for a in india if _clean(a.get("title")) and _clean(a.get("title")) != "[Removed]"])
    us_items, in_items = out[:n_us], out[n_us:]
    out = [x for pair in zip(us_items, in_items) for x in pair] + us_items[len(in_items):] + in_items[len(us_items):]
    return out[:limit]


def rss_items():
    """Items from every RSS feed (cached 5 minutes)."""
    def load():
        out = []
        for name, url in RSS_FEEDS:
            try:
                r = requests.get(url, headers=_UA, timeout=8)
                r.raise_for_status()
                root = ET.fromstring(r.content)
                for it in root.iter("item"):
                    title = _clean(it.findtext("title"))
                    if not title:
                        continue
                    out.append({"source": name, "title": title, "summary": _clean(it.findtext("description")),
                                "link": (it.findtext("link") or "").strip(), "published": (it.findtext("pubDate") or "").strip()})
            except Exception:
                continue
        return out
    return _cached("rss", 300, load)


def headlines(limit=25):
    api = _cached("newsapi:%d" % limit, 120, lambda: newsapi_headlines(limit))
    if api:
        return api
    return (rss_items() or [])[:limit]


def pool():
    """Every item we can see right now, from all feeds: used to find the same story with a better summary."""
    return (_cached("newsapi:40", 120, lambda: newsapi_headlines(40)) or []) + (rss_items() or [])


# ---- SEC EDGAR --------------------------------------------------------------------------------
_SEC_CONTACT = os.environ.get("ZENITH_SEC_CONTACT", "gauravchau2412@gmail.com")
_SEC_HEADERS = {"User-Agent": "ApexZenith research %s" % _SEC_CONTACT, "Accept-Encoding": "gzip, deflate"}
_CIK = {}
_8K_ITEMS = {
    "1.01": "Entry into a material agreement", "1.02": "Termination of a material agreement",
    "2.01": "Completion of acquisition or disposition", "2.02": "Results of operations",
    "2.03": "Creation of a direct financial obligation", "2.05": "Exit or disposal costs (restructuring)",
    "2.06": "Material impairments", "5.02": "Departure or appointment of officers/directors",
    "7.01": "Regulation FD disclosure", "8.01": "Other events",
}


def _cik(ticker):
    if not _CIK:
        r = requests.get("https://www.sec.gov/files/company_tickers.json", headers=_SEC_HEADERS, timeout=15)
        r.raise_for_status()
        for row in r.json().values():
            _CIK[str(row["ticker"]).upper()] = str(row["cik_str"]).zfill(10)
    return _CIK.get(ticker.upper())


def sec_filings(ticker, form="8-K", limit=8):
    """Recent filings of one form for a US-listed ticker, with SIC industry. Metadata only."""
    try:
        cik = _cik(ticker)
        if not cik:
            return {}
        r = requests.get("https://data.sec.gov/submissions/CIK%s.json" % cik, headers=_SEC_HEADERS, timeout=15)
        r.raise_for_status()
        d = r.json()
        rec = d["filings"]["recent"]
        rows = []
        for i, f in enumerate(rec["form"]):
            if f != form:
                continue
            items = [c.strip() for c in (rec.get("items", [""] * len(rec["form"]))[i] or "").split(",") if c.strip()]
            acc = rec["accessionNumber"][i]
            rows.append({"date": rec["filingDate"][i], "items": [{"code": c, "label": _8K_ITEMS.get(c)} for c in items],
                         "url": "https://www.sec.gov/Archives/edgar/data/%d/%s/%s" % (
                             int(cik), acc.replace("-", ""), rec["primaryDocument"][i])})
            if len(rows) >= limit:
                break
        return {"company": d.get("name"), "sic": d.get("sic"), "industry": d.get("sicDescription"), "filings": rows}
    except Exception:
        return {}
