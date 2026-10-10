"""Optional live inputs: public finance RSS headlines and SEC EDGAR 8-K filing metadata.

Both are best-effort; every function returns [] on any failure so the offline demo is unaffected.
"""
import os
import re
import xml.etree.ElementTree as ET
from html import unescape

import requests

RSS_FEEDS = [
    ("Moneycontrol", "https://www.moneycontrol.com/rss/business.xml"),
    ("CNBC Markets", "https://www.cnbc.com/id/10000664/device/rss/rss.html"),
    ("MarketWatch", "https://feeds.content.dowjones.io/public/rss/mw_topstories"),
    ("Yahoo Finance", "https://finance.yahoo.com/news/rssindex"),
]
_UA = {"User-Agent": "Mozilla/5.0 (compatible; ApexZenith/1.0)"}


def _clean(s):
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()

def scrape_article(url):
    """Scrape the main text content from a given news URL."""
    try:
        from bs4 import BeautifulSoup
        r = requests.get(url, headers=_UA, timeout=10)
        r.raise_for_status()
        soup = BeautifulSoup(r.content, "html.parser")
        
        # Remove script, style, nav, footer, header elements
        for element in soup(["script", "style", "nav", "footer", "header", "aside"]):
            element.extract()
            
        # Get all text paragraphs
        paragraphs = soup.find_all("p")
        text = " ".join([p.get_text(strip=True) for p in paragraphs if len(p.get_text(strip=True)) > 20])
        
        if text:
            title = soup.title.string if soup.title else ""
            return (title + ".\n\n" + text).strip()
        return ""
    except Exception:
        return ""


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
                            "title": title, "summary": _clean(a.get("description") or a.get("content")),
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
