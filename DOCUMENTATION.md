# Apex Zenith: Technical & System Documentation

Apex Zenith is an explainable financial intelligence platform that transforms unstructured financial news and economic shocks into a causal dependency graph. It traces how events propagate across commodities, macroeconomic indicators, industry sectors, and individual equities and ETFs, providing full provenance, transparent heuristic scores, and empirical time-series validation.

---

## 1. System Overview & Architecture

### 1.1 Architecture Flow

```mermaid
flowchart TD
    subgraph Input["1. Input Ingestion"]
        A[Financial News Article]
        B[Live Headlines / RSS / NewsAPI]
        C[SEC EDGAR 8-K Filings]
    end

    subgraph Extraction["2. Extraction Pipeline"]
        D[Entity Matcher (KB Aliases)]
        E[Regex Direction & Move Parser]
        F[Observed vs. Expected Classifier]
        G[Optional LLM Verifier (Groq/OpenRouter)]
    end

    subgraph KnowledgeGraph["3. Knowledge Graph Engine"]
        H[(Curated Seed KG<br/>56 Nodes, 90 Edges)]
        I[Dynamic Edge Ingestion & Evidence]
        J[Unlinked Company Inference]
    end

    subgraph Propagation["4. Propagation & Scoring Engine"]
        K[Anchor Identification]
        L[Depth-Limited Multi-Path DFS]
        M[Decay & Horizon Aggregation]
        N[Mixed-Signals & Agreement Penalizer]
    end

    subgraph Validation["5. Market Data Validation"]
        O[FRED St. Louis Fed Series]
        P[Yahoo Finance Market Data]
        Q[Lagged Correlation Checker]
    end

    subgraph Presentation["6. Presentation & API"]
        R[FastAPI Server (:8000)]
        S[D3.js Force-Directed Interactive Graph]
        T[Explainability & Checks Inspector]
    end

    Input --> Extraction
    Extraction --> KnowledgeGraph
    KnowledgeGraph --> Propagation
    Propagation --> Validation
    Validation --> Presentation
```

---

## 2. Core Concepts & Philosophical Principles

### 2.1 Fact vs. Inference
A foundational rule of Apex Zenith is that the system **never presents a guess as a fact**:
* **Observed (`obs`)**: Explicitly stated in the text as having already occurred (e.g., *"Brent crude jumped 12%"*). Quoted verbatim in the UI.
* **Expected (`exp`)**: Hedged statements, analyst warnings, forecasts, or forward-looking conditionals (*"could lift inflation"*, *"analysts warn"*).
* **Inferred (`inf`)**: Derived via graph propagation. Nodes downstream of the trigger carry compound uncertainty and are never presented as facts.

### 2.2 Plausibility vs. Probability
* Path and node scores represent **heuristic plausibility** ($0.0 \dots 1.0$), **not probability and not an investment forecast**.
* Scores decay per hop ($0.92^{\text{hop}}$) to penalize long theoretical transmission chains.
* Scores are capped at $0.92$ (`CONF_CAP`) to prevent noisy-OR compounding from overstating certainty.
* When opposing paths reach the same asset (e.g. rising crude helping an energy stock but hurting general market sentiment), an **agreement penalty** is applied:
  $$\text{Agreement} = \frac{\max(\text{pos}, \text{neg})}{\text{pos} + \text{neg}}$$
  If agreement drops below $0.70$ and opposing paths are material, the node is flagged with a **mixed signals** badge ($\pm$).

---

## 3. Knowledge Graph Specification

The baseline graph (`impactgraph/kb.py`) contains **56 curated nodes** and **90 directed causal relationships**:

### 3.1 Node Types
| Type | Description | Examples |
| :--- | :--- | :--- |
| `commodity` | Raw materials and energy | Crude Oil, Natural Gas, Gold, Wheat, Copper |
| `indicator` | Macroeconomic and rate variables | Inflation Expectations, Rate Expectations, US 10Y Yield, USD, USD/INR, Consumer Spending, Risk Aversion (VIX) |
| `event_class`| Macro / geopolitical event anchors | Geopolitical Tension, OPEC+ Supply Restraint |
| `sector` | Industry classifications | Oil & Gas Producers, Airlines, Chemicals, Autos, Banks, Real Estate, IT Services, Consumer Discretionary |
| `company` | Specific corporate entities | Exxon Mobil, Chevron, ONGC, Delta, United, IndiGo, HDFC Bank, SBI, Apple, Microsoft, TCS, Infosys |
| `instrument`| Tradable ETFs and index proxies | XLE, JETS, XLF, VNQ, SPY, Nifty 50, Nifty Bank, Nifty Realty |
| `central_bank`| Monetary policy regulators | Federal Reserve, Reserve Bank of India (RBI), ECB |

### 3.2 Edge Attributes
Every edge $(u \to v)$ defines:
* `sign` $\in \{+1, -1\}$: Directional relationship ($+1$ = co-directional, $-1$ = inverse).
* `strength` $\in [0.0, 1.0]$: Prior plausibility that transmission occurs.
* `lag`: Typical calendar horizon in days before shock transmits.
* `mechanism`: Plain-language economic rationale explaining the relationship.
* `provenance`: `["prior"]`, `["observed"]`, `["inferred"]`, or `["validated"]`.
* `evidence`: Citations of exact sentences from analyzed articles where both nodes co-occur.

---

## 4. Pipeline Modules Breakdown

### 4.1 Ingestion & Extraction (`impactgraph/extract.py`)
* **Deterministic Rules**: Token-matching with alias maps, case-sensitive ticker checks (e.g., `!VIX`, `!INR`), regex direction verbs (`jumped`, `plunged`, `hiked`), and percentage/basis point parsers.
* **Hedge Detection**: Detects conditional phrasing (`could`, `may`, `warns`, `risk of`) to distinguish *observed* facts from *expected* outcomes.
* **Unlinked Entities**: Automatically detects unknown corporate names using uppercase suffix heuristics (`Inc`, `Corp`, `Ltd`, `Airlines`, `Bank`) and creates temporary inferred nodes.

### 4.2 Dynamic Graph Layer (`impactgraph/graph.py`)
* Wraps NetworkX `DiGraph`.
* Ingests articles: sentences mentioning both source and destination nodes of an edge are preserved as evidence, boosting edge effective strength.
* Handles graph reset and serialization.

### 4.3 Propagation Engine (`impactgraph/propagate.py`)
* **Depth-Limited DFS**: Traverses outward from source triggers up to max depth (default 5 hops) with minimum score threshold ($0.04$).
* **Anchors**: Nodes that the text states *already moved* halt incoming paths from other triggers, serving as ground-truth anchor comparison points.
* **Aggregator**: Aggregates multi-path impact per node, computing direction, sensitivity, plausibility, and mixed-signal flags.

### 4.4 Time-Series Market Validation (`impactgraph/timeseries.py`)
* **Sources**: FRED (St. Louis Federal Reserve API / CSV downloads) and Yahoo Finance (`yfinance`).
* **Lagged Correlation**: Evaluates ~2 trading years (520 days) of daily returns at lags from $0$ to $10$ days.
* **Verdicts**:
  * `supported`: Empirically validated with statistically significant positive correlation matching sign.
  * `contradicted`: Empirical data opposes theoretical sign.
  * `no_data`: Series unavailable.
  * `simulated`: Fallback synthetic data (explicitly isolated and **never modifies confidence**).

### 4.5 LLM Layer (`impactgraph/llm.py`)
* Fully optional; supports Groq (`openai/gpt-oss-120b`) and OpenRouter (`meta-llama/llama-3.3-70b-instruct`).
* **Role**: Only proposes missing events and quote-verified links. Never invents graph scores or edge strengths.

### 4.6 Feeds & News (`impactgraph/feeds.py`)
* Public financial RSS feeds (CNBC, MarketWatch, Yahoo Finance).
* Business news headlines via NewsAPI (US + India).
* SEC EDGAR 8-K filing metadata retrieval.

---

## 5. REST API Reference

The server runs on FastAPI (`server.py`).

### `POST /api/analyze`
Analyzes a financial text block and returns the complete impact graph, extracted events, affected assets, and paths.

**Request Body:**
```json
{
  "text": "Brent crude jumped 12% on Monday after an attack on tankers near the Strait of Hormuz.",
  "live": false,
  "use_llm": false
}
```

**Response Format:**
```json
{
  "text": "...",
  "events": [
    {
      "id": "ev1",
      "trigger": "crude_oil",
      "direction": 1,
      "status": "observed",
      "label": "Crude Oil up 12%",
      "quote": "Brent crude jumped 12% on Monday..."
    }
  ],
  "assets": [
    {
      "node": "xle",
      "label": "XLE (Energy ETF)",
      "type": "instrument",
      "direction": 1,
      "confidence": 0.743,
      "confidence_label": "high",
      "mixed": false,
      "horizon_days": 2,
      "sensitivity": "strong",
      "n_paths": 1,
      "why": "ETF holds the sector"
    }
  ],
  "sectors": [...],
  "variables": [...],
  "paths": [...],
  "graph": {
    "nodes": [...],
    "links": [...]
  },
  "comparison": [
    {
      "node": "crude_oil",
      "stated": 1,
      "status": "observed",
      "predicted": 1,
      "verdict": "consistent"
    }
  ],
  "summary": "Reported (observed): Crude Oil up 12%...",
  "caveats": [...]
}
```

### `GET /api/samples`
Returns preset sample scenarios (Oil Shock, Fed 50bps hike, RBI banking rules, Gold safe-haven rally, Natural gas surge).

### `GET /api/status`
Returns service status, LLM availability, FRED/NewsAPI key configuration, and graph node/edge counts.

### `GET /api/graph`
Returns the static base knowledge graph structure in JSON format.

### `POST /api/reset`
Resets the knowledge graph and clears time-series cache back to analyst priors.

### `GET /api/headlines`
Fetches real-time RSS headlines and NewsAPI business stories.

### `GET /api/sec?ticker={TICKER}&form=8-K`
Fetches recent SEC filings metadata for a given company ticker.

---

## 6. Configuration & Environment Variables

All settings can be placed in `.env` in the project root:

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `ZENITH_REQUIRE_LLM` | `0` | Set `0` for offline/rules-only mode; `1` to require LLM. |
| `GROQ_API_KEY` | *(empty)* | Groq API key for high-speed LLM verification. |
| `OPENROUTER_API_KEY` | *(empty)* | OpenRouter fallback key. |
| `FRED_API_KEY` | *(empty)* | St. Louis Federal Reserve API key (falls back to public CSV). |
| `NEWSAPI_KEY` | *(empty)* | NewsAPI key for live global headlines. |
| `ZENITH_SEC_CONTACT` | `gauravchau2412@gmail.com` | User-agent header for SEC EDGAR compliance. |

---

## 7. Running & Testing

### 7.1 Start the Application
```bash
# Install dependencies
pip install -r requirements.txt

# Run the live server on http://127.0.0.1:8000
python run.py
```

### 7.2 Run Test Suite
```bash
python -m unittest discover tests
```
The test suite validates:
* Rule-based entity & direction extraction
* Graph connectivity and path scoring
* Anchor behavior and multi-path decay
* Fallback handling without external keys
* Isolation of simulated time-series data

---

## 8. Web User Interface Guide

The frontend ([public/index.html](file:///c:/Users/Shivendra/OneDrive/Desktop/Apex%20zenith/Siddhi-Bhosale/public/index.html)) provides a single-page interactive cockpit:

1. **Left Panel (Input & Extraction)**:
   * Event text editor with pre-loaded scenarios.
   * Observed vs. Expected tagged event cards with verbatim quoted text.
   * Real-time RSS headline feed for one-click analysis.
2. **Center Panel (Knowledge Graph)**:
   * Interactive D3 force-directed network graph.
   * Diamond nodes for triggers, circles for entities with direction arrows ($\uparrow$, $\downarrow$).
   * Solid green/pink arrows for direct positive/negative transmission.
   * Zoom, pan, and interactive node/edge inspection.
3. **Right Panel (Deep-Dive & Explanations)**:
   * **Assets Tab**: Top affected equities and ETFs ranked by plausibility score.
   * **Sectors & Variables Tab**: Macroeconomic and industry level transmission.
   * **Paths Tab**: Full step-by-step causal paths with hop-by-hop mechanisms.
   * **Explain Tab**: Grounded audit trail with article quotes and economic mechanisms.
   * **Checks Tab**: Model verification against stated facts and data provenance breakdown.
