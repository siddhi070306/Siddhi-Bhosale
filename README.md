# Apex Zenith - financial event impact graph

Turns a piece of financial news into a **dependency graph** that shows how the event may propagate through
economic variables, sectors and assets - and explains every link, the evidence behind it, and how sure we are.

> Example chain the system traces: crude oil +12% -> inflation expectations up -> rate expectations up ->
> real estate down / banks mixed -> Nifty Realty, DLF, S&P 500 ...

## Run it

```bash
pip install -r requirements.txt
python run.py                      # http://127.0.0.1:8000
python -m unittest discover tests  # 22 tests
```

Open the page, pick a sample event (or paste text), press **Analyse event**.
Open `http://127.0.0.1:8000/#demo0` (or `#demo1` ... `#demo4`) to auto-run a sample.

Copy `.env.example` to `.env` and add keys. **An LLM key (`GROQ_API_KEY` or `OPENROUTER_API_KEY`) is required**:
the LLM proposes events and cause->effect links on every analysis, and the system keeps only proposals whose
supporting quote appears verbatim in the article. (`ZENITH_REQUIRE_LLM=0` gives an offline rules-only mode,
used by the tests.)

| Setting | What it adds |
|---|---|
| `GROQ_API_KEY` / `OPENROUTER_API_KEY` | Required LLM step: extra events, quote-verified links, grounded summary. |
| `FRED_API_KEY` | Official FRED API for economic series (falls back to FRED's public CSV download without it). |
| `NEWSAPI_KEY` | Business headlines from NewsAPI (US + India); falls back to public RSS feeds. |
| **Live market data** toggle | Real FRED and Yahoo Finance series; each link is checked with lagged correlations. First run downloads ~40 series (cached 6 h under `data/cache`). |
| `GET /api/sec?ticker=DAL` | Recent SEC 8-K filing metadata (set `ZENITH_SEC_CONTACT`). |

## How it works

1. **Extraction** (`impactgraph/extract.py`) - rules find entities (commodities, indicators, sectors, companies,
   indices, central banks) and events (price moves, central-bank decisions, OPEC+ decisions, geopolitical
   shocks, regulation). Each event is tagged **observed** (reported as happened) or **expected** (hedged:
   "could", "analysts warn", "if ...").
2. **Knowledge graph** (`kb.py`, `graph.py`) - 56 entities and 90 curated causal links, each with a sign,
   strength, typical lag and a one-line mechanism. Articles update the graph: sentences where both ends of a
   link appear are stored as evidence and nudge its strength; unknown companies are added as *inferred* nodes.
3. **Propagation** (`propagate.py`) - depth-limited multi-path search. A path scores the product of its link
   strengths with a per-hop decay. Nodes the article says have *already moved* are **anchors**: other paths stop
   there so the model can be compared with what actually happened, and the observed move is traced onward.
   Regulatory actions are scoped to the regulator's market.
4. **Data** (`timeseries.py`) - for each link that matters, correlate the two series over ~2 years of daily data
   at plausible lags and label the link `supported`, `contradicted` or `inconclusive`.
5. **Explanation** (`service.py`, UI) - every path is shown step by step with mechanism, strength, lag, provenance
   (`prior` / `observed` / `inferred` / `validated`), data check and the article sentences that support it.

## What is fact and what is inference

* **Observed** = the text says it happened. Quoted verbatim next to the event.
* Everything downstream is **inferred** and labelled so. The "Checks" tab compares the model's prediction with
  each move the article states and reports `consistent`, `graph disagrees`, `model mixed`, or `no path`.
* Scores are **heuristic plausibility** from analyst-set priors plus evidence - **not probabilities and not
  forecasts**. Confidence is discounted when paths disagree, and nodes with conflicting paths are flagged
  "mixed signals".

## Honest limits

* Link strengths are expert priors, not fitted coefficients; data validation covers only links with series.
* Correlation is not causation, and relationships change between regimes.
* **Simulated data** is used only when no real series is reachable; it is labelled "simulated" everywhere and
  **never** changes any confidence (checking a prior against data generated from it would be circular).
* The rule-based extractor handles common phrasing, not arbitrary prose; the LLM option widens coverage but its
  events must quote the article and are shown with an `LLM` badge.
* Not investment advice.

## Layout

```
impactgraph/  kb.py extract.py graph.py propagate.py timeseries.py llm.py feeds.py service.py
public/       index.html (D3 UI, vendored d3 for offline use)
server.py     FastAPI app      run.py   launcher      tests/   unit + end-to-end tests
```
