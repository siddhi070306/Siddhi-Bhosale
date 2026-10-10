"""Optional live inputs: public finance RSS headlines and SEC EDGAR 8-K filing metadata.

Both are best-effort; every function returns [] on any failure so the offline demo is unaffected.
"""
import os
import re
import xml.etree.ElementTree as ET
from html import unescape

import requests

RSS_FEEDS = [
    ("CNBC Markets", "https://www.cnbc.com/id/10000664/device/rss/rss.html"),
    ("MarketWatch", "https://feeds.content.dowjones.io/public/rss/mw_topstories"),
    ("Yahoo Finance", "https://finance.yahoo.com/news/rssindex"),
]
_UA = {"User-Agent": "Mozilla/5.0 (compatible; ApexZenith/1.0)"}


def _clean(s):
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def newsapi_headlines(limit=25):
    """Business headlines from newsapi.org (US + India) when NEWSAPI_KEY is set."""
    key = os.environ.get("NEWSAPI_KEY", "").strip()
    if not key:
        return []
    out = []
    for country in ("us", "in"):
        try:
            r = requests.get("https://newsapi.org/v2/top-headlines", timeout=10, headers={"X-Api-Key": key},
                             params={"category": "business", "country": country, "pageSize": 20})
            r.raise_for_status()
            for a in r.json().get("articles", []):
                title = _clean(a.get("title"))
                if title and title != "[Removed]":
                    out.append({"source": "NewsAPI/" + ((a.get("source") or {}).get("name") or country.upper()),
                                "title": title, "summary": _clean(a.get("description") or a.get("content")),
                                "link": a.get("url") or "", "published": a.get("publishedAt") or ""})
        except Exception:
            continue
    return out[:limit]


def headlines(limit=25):
    api = newsapi_headlines(limit)
    if api:
        return api
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
    return out[:limit]


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
