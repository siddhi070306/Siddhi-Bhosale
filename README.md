# Apex Zenith - financial event impact graph

Turns a piece of financial news into a **dependency graph** that shows how the event may propagate through
economic variables, sectors and assets - and explains every link, the evidence behind it, and how sure we are.

> Example chain the system traces: crude oil +12% -> inflation expectations up -> rate expectations up ->
> real estate down / banks mixed -> Nifty Realty, DLF, S&P 500 ...

## Run it

```bash
pip install -r requirements.txt
python run.py                      # http://127.0.0.1:8000
python -m unittest discover tests  # 228 tests
ZENITH_REQUIRE_LLM=0 python research/evaluate.py   # the paper's experiments (offline, ~5 s; needs data/cache)
```

A research-paper write-up of the method and its evaluation is in `research/PAPER.md`; the full technical reference is `DOCUMENTATION.md`.

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

## Hierarchical knowledge graph

The graph is organised in four tiers, from the cause of a move down to what an investor can hold: **0 Events & policy**
(event classes, institutions, the events an article reports), **1 Economic variables** (commodities, indicators),
**2 Sectors**, **3 Assets** (companies, indices, instruments). `impactgraph/hierarchy.py` derives each node's tier from its
type (nothing is learned or guessed) and classifies every link as `next` (one tier down), `skip` (more than one tier),
`lateral` (same tier) or `feedback` (back up). The curated graph has 2 feedback links (banks to growth and to consumer
spending); the guard rejects any link learned at run time that points up from an asset. A sector also *contains* the
companies and funds linked to it as members, so an impact on a sector can be read down to its members.

Tiers are stored data, not just labels. Every node carries its `tier`, `origin` (curated, learned from an article, or added by a user), `market`, `first_seen` and the articles that mention it. Every link carries a `relation`: `causes`, `policy_reaction`, `member_of` (company in a sector), `tracks` (a fund or sector index follows a sector, commodity or yield) or `weight_in` (a sector or company is part of a broad index). The relation says what a link means, and sector membership is read from it, not from the mechanism text. The tier-crossing kind (`next`, `skip`, `lateral`, `feedback`) is information only and blocks nothing. `GET /api/node/{id}` returns the properties that belong to a node's tier (for example a sector's members, a variable's measure and whether it has market data, an asset's ticker and parent sector). A graph saved before these fields existed is filled in when it loads.

Where you see it: tier headers on the Impact Graph, a **Hierarchy** tab (per-tier roll-up of the analysis and a
sector-to-members drill-down), the tier and containing sector in Node Details, a tier label on every hop of the causal
walkthrough, and `hierarchy` in the `/api/analyze` and `/api/whatif` results. `GET /api/hierarchy` returns the tiers and an
audit of the links. The roll-up only re-groups the impact rows the analysis already produced; it adds no new estimates.

## Editable, versioned graph

Every change to the graph is one recorded, guarded change: an article folded in, a weight edited, a link added or removed, an
asset added, removed or moved to another sector, a restore, a reset, an import. `impactgraph/changelog.py` records, for each,
who made it (user or system), the tiers it touched, a reason if the user gave one, and an exact diff computed by comparing the
graph before and after (entities and links added or removed, and every changed field with its before and after).

- **History:** `GET /api/kb/history` and `/api/kb/history/{seq}`; the Settings page lists it with details.
- **Restore:** `POST /api/kb/restore {version}` brings back the graph as it was at one of the last 30 versions of the session. A
  restore is a new forward change, so nothing is erased; older entries stay readable but cannot be restored. A reset to the curated
  baseline starts a new epoch and keeps the earlier history.
- **Edits go through the health checks.** A deliberate user edit is judged on structure only (the regression against the curated
  baseline is skipped, because the user is choosing to depart from it) and the link is marked `user_edited`.
- **Tier rules for edits:** `POST /api/kb/link` adds a link, `/api/kb/link/check` is a dry run, `/api/kb/link/remove` removes one the
  user added, `/api/kb/move-asset` moves a user-added or learned asset to another sector. A link that skips a tier, stays within one,
  or goes back up gets a warning; a link pointing up from an asset is refused. Curated links cannot be removed and curated sector
  memberships cannot be moved; edit a weight or add a link instead.
- **Export and import:** `GET /api/kb/export` and `POST /api/kb/import`. An import must pass the health checks and the tier rules or
  nothing changes.
- **Every analysis records the graph version it ran on** (`kb_version`).

## Asking the graph (KG assistant)

`POST /api/assistant {question, history}` answers a question from the knowledge graph and nothing else, and never changes it (a
question is not analysed as an article). `impactgraph/assistant.py` finds the graph entities in the question, retrieves tier-aware
*cards* straight from the graph (an entity card, a link card with its mechanism, basis, data check and evidence quotes, a path card
with its plausibility, a sector-to-members view, or a note that the graph holds no path between two entities), and asks the LLM to
answer from those cards only, citing them. A citation that is not a real card is removed, and an answer with no valid citation is
replaced by a plain answer built from the cards. The response carries the answer, the cited sources and the graph version. With no
LLM, the cards themselves are the answer. A question that names no entity gets no answer, only suggestions.

**Every generated graph is in the RAG.** `impactgraph/library.py` files each graph the Knowledge Graph Generator produces
(`data/analyses/`: a compact index plus one compressed full result per article, newest 200). The assistant retrieves the analyses that
touched the entities a question names, or the latest ones for a question about the news ("what did the last article report?"), as
`a:<id>` cards that keep apart what the article **reported**, what the model **inferred** (at a stated graph version) and its
**hypotheses**. *Import my chat history* on the assistant page sends the graphs already in the browser's history to the library, and the
sidebar's Recent chats list library graphs too (library icon) and reopen them with every dashboard. API: `GET /api/analyses`,
`GET /api/analyses/{id}`, `POST /api/analyses/import`, `DELETE /api/analyses/{id}`. For a one-topic question ("what happens if oil rises?")
the retrieved chains are diversified, one per channel, instead of three variants of the strongest branch.

## Reading the graph tier by tier, and exporting it as cards

- **Node Details** shows what the graph knows about the selected node, from `GET /api/node/{id}`: the properties that belong to its
  tier (a variable's measure and whether it has market data, a sector's members, an asset's ticker, parent sector and what it
  tracks), where the node came from, and how many analysed articles mention it.
- **A sentence per tier** for every affected asset and every path (`tier_sentence`), for example *Event: Crude Oil up 12% →
  Variable: Crude Oil ↑ → Sector: Oil & Gas Producers ↑ → Asset: Exxon Mobil ↑*. It is built from the strongest path, not by the LLM,
  and is shown on Asset Impact and in the causal walkthrough.
- **Tier view:** the Impact Graph can hide whole tiers or fold each sector's member assets into the sector. It is a view only; the
  graph, the paths and every number stay the same.
- **Evidence mix** (Hierarchy tab, `evidence` in `hierarchy.layers`): for each tier, how the links that arrive at it are supported
  over the distinct links on the analysed paths. Each link counts once under the strongest claim that applies: added or edited by a
  user, contradicted by market data, observed in the article, supported by market data, proposed by the LLM, or analyst prior only.
  This re-groups what the graph records; it is not a probability. With live data off, little can be marked as data-supported.
- **Cards export** (`impactgraph/cards.py`): `GET /api/kg/cards` returns the graph as citable text cards (tier, sector, node and link
  cards) with stable ids (`n:<node>`, `l:<from>><to>`, `s:<sector>`, `t:<tier>`), each listing its tiers and the nodes it mentions.
  Filter with `tier`, `node` or `kind`, and page with `limit` and `offset`. The response is pinned to the graph version and carries a
  `fingerprint` that changes exactly when the graph's facts change, so a retrieval system can tell its copy has gone stale.
  `GET /api/kg/cards/{id}` returns one card (path cards, `p:a>b>c`, are rebuilt from their id) and `GET /api/kg/paths?src=&dst=`
  returns the strongest path cards. The chatbot builds its context from the same card builders, so both read the same text.
  Embeddings and vector search are not part of this.

## Live quotes, watchlist and the dynamic knowledge base

**Live numbers.** Asset prices and day changes come from Yahoo Finance through `yfinance` (>= 0.2.66). Yahoo offers no webhooks, so the
backend uses two real feeds: yfinance's WebSocket (a push tick whenever a symbol trades) and a batched poll every 20 s (previous close,
and coverage while a market is closed). Both feed one cache that is pushed to the browser over Server-Sent Events (`GET /api/stream`),
with `GET /api/quotes` as the polling fallback (used on serverless hosts, where background threads do not persist). Quotes can be
delayed by the exchange and are never simulated; if Yahoo fails, the last good quote stays visible with the error.
In the UI every number is tagged **LIVE** (Yahoo), **FRED** (official daily series) or **MODEL** (estimated by the knowledge graph).

**Watchlist and assets.** `POST /api/watchlist` adds any ticker (verified against Yahoo first). `POST /api/kb/asset` adds an asset to the
graph as a low-confidence, user-added link from a sector (you pick it, or the LLM suggests one from the curated list).

**Dynamic knowledge base with automatic revert** (`impactgraph/kbstate.py`). Every change (article learned, asset added) is snapshotted,
then checked: curated entities/links intact, strengths in range, bounded growth per change, runtime links a minority, and a regression
test (the built-in sample articles must still give the same signs as the static baseline). A failed check rolls the change back.
Runtime links that market data contradicts are pruned. `GET /api/kb`, `POST /api/kb/mode` (`dynamic` | `static`), `POST /api/kb/revert`
(`previous` | `static`). State is saved to `data/kb_state.json` (local runs) and re-checked on load; a state that fails is discarded.
