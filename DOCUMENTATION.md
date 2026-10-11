# Apex Zenith: Complete System & Architectural Documentation

Apex Zenith is an explainable financial intelligence platform that transforms unstructured financial news and macroeconomic shocks into a causal dependency graph across commodities, macroeconomic indicators, industry sectors, and individual equities and ETFs. It provides complete provenance, transparent heuristic scoring, empirical time-series validation, historical analog matching, and real-time market data streaming.

---

## 1. System Architecture & High-Level Design

### 1.1 End-to-End Architecture Flow

```mermaid
flowchart TD
    subgraph Ingestion["1. Ingestion Layer"]
        A[User Text Input]
        B[RSS Feeds: CNBC, MarketWatch, Yahoo]
        C[NewsAPI Global Business Headlines]
        D[SEC EDGAR 8-K Regulatory Filings]
    end

    subgraph Extraction["2. Extraction & NLP Layer (extract.py & llm.py)"]
        E[Entity & Alias Matcher]
        F[Direction & Percentage Movement Parser]
        G[Hedge & Status Classifier: Observed vs Expected]
        H[Unlinked Company Entity Extractor]
        I[Optional LLM Verifier: Groq / OpenRouter]
    end

    subgraph KG["3. Dynamic Knowledge Graph (kb.py, graph.py, kbstate.py)"]
        J[(Curated Base Knowledge Graph<br/>56 Nodes, 90 Causal Edges)]
        K[Dynamic Evidence Attachment & Co-occurrence]
        L[KB State Guard & Regression Rollback Engine]
        M[User Asset & Custom Edge Ingestion]
    end

    subgraph Propagation["4. Propagation & Scoring (propagate.py)"]
        N[Anchor Event Identification]
        O[Depth-Limited Multi-Path DFS Search]
        P[Per-Hop Path Decay: 0.92^hop]
        Q[Noisy-OR Aggregator & Agreement Penalizer]
    end

    subgraph Quantitative["5. Quantitative & Market Layer (timeseries.py, analogs.py, quotes.py)"]
        R[FRED St. Louis Fed Daily Series]
        S[Yahoo Finance Historical Returns]
        T[Lagged Cross-Correlation Validator: -10d..+10d]
        U[Econometric Analog Episode Matcher]
        V[Live Quotes WebSocket & SSE Stream]
    end

    subgraph Delivery["6. Presentation & User Experience"]
        W[FastAPI Backend Server (:8000)]
        X[Vite + React 19 Frontend (:5173)]
        Y[Legacy D3 Offline Cockpit]
    end

    Ingestion --> Extraction
    Extraction --> KG
    KG --> Propagation
    Propagation --> Quantitative
    Quantitative --> Delivery
```

---

## 2. Core Methodological Principles

### 2.1 Fact vs. Inference
The foundational philosophy of Apex Zenith is that **the system never presents a model inference as an established fact**:
* **Observed (`obs`)**: Explicitly stated in the article text as having already occurred (e.g., *"Brent crude jumped 12%"*). Quoted verbatim with character offsets.
* **Expected (`exp`)**: Forward-looking, conditional, or analyst-hedged projections (*"could lift inflation"*, *"analysts warn"*).
* **Inferred (`inf`)**: Discovered through downstream propagation along the knowledge graph links. These carry compounding uncertainty and are tagged with step-by-step explanations.

### 2.2 Heuristic Plausibility vs. Probability
* Scores represent **heuristic plausibility** ($0.0 \dots 1.0$), **never probabilities or financial price targets**.
* **Path Score**:
  $$\text{score}(P) = \prod_{(u,v) \in P} \text{eff\_strength}(u,v) \times 0.92^{\text{hops}-1}$$
* **Noisy-OR Aggregation**:
  $$\text{miss} = \prod_{p \in \text{top } 4} (1 - \text{score}_p), \quad \text{conf} = \min(0.92, 1 - \text{miss})$$
* **Agreement Penalty & Mixed Signals**:
  $$\text{Agreement} = \frac{\max(\text{pos\_mass}, \text{neg\_mass})}{\text{pos\_mass} + \text{neg\_mass}}$$
  If opposing paths reach the same asset (e.g., higher oil directly boosting an oil producer but depressing broader market equities), confidence is scaled down:
  $$\text{conf} = \text{conf} \times (0.5 + 0.5 \times \text{Agreement})$$
  Nodes with agreement below $70\%$ and significant opposing scores are flagged with a **mixed signals** badge ($\pm$).

---

## 3. Knowledge Graph Engine

### 3.1 Base Entity Taxonomy (`impactgraph/kb.py`)
The base graph contains **56 entities** categorized across 7 types:
* **Commodities (5)**: Crude Oil (`crude_oil`), Natural Gas (`natural_gas`), Gold (`gold`), Wheat (`wheat`), Copper (`copper`).
* **Macro Indicators (8)**: Inflation Expectations (`inflation_exp`), Interest-Rate Expectations (`rate_exp`), US 10Y Yield (`us10y`), US Dollar Index (`usd`), USD/INR (`usdinr`), Economic Growth (`gdp_growth`), Consumer Spending (`consumer_spending`), Risk Aversion / VIX (`risk_aversion`).
* **Event Classes (2)**: Geopolitical Tension (`geopolitical_tension`), OPEC+ Supply Restraint (`opec_supply_cut`).
* **Sectors (8)**: Oil & Gas Producers (`oil_gas_producers`), Airlines (`airlines`), Chemicals (`chemicals`), Autos (`autos`), Banks (`banks`), Real Estate (`real_estate`), IT Services (`it_services`), Consumer Discretionary (`consumer_discretionary`).
* **Corporate Equities (12)**: Exxon Mobil (`exxon`), Chevron (`chevron`), ONGC (`ongc`), Delta Air Lines (`delta`), United Airlines (`united`), IndiGo (`indigo`), HDFC Bank (`hdfc_bank`), State Bank of India (`sbi`), Apple (`apple`), Microsoft (`msft`), TCS (`tcs`), Infosys (`infy`).
* **Tradable Instruments & Indices (8)**: XLE (`xle`), JETS (`jets`), XLF (`xlf`), VNQ (`vnq`), SPY (`spy`), Nifty 50 (`nifty50`), Nifty Bank (`nifty_bank`), Nifty Realty (`nifty_realty`).
* **Central Banks & Regulators (3)**: Federal Reserve (`fed`), Reserve Bank of India (`rbi`), European Central Bank (`ecb`).

### 3.2 Edge Attributes & Provenance
Every directed edge $(u \to v)$ encapsulates:
* `sign`: $+1$ (co-directional transmission) or $-1$ (inverse transmission).
* `strength`: Analyst-curated prior ($0.0 \dots 1.0$) indicating transmission plausibility.
* `base_strength`: Immutable baseline prior used for regression checks.
* `lag`: Characteristic propagation horizon in calendar days.
* `mechanism`: Plain-language narrative describing the economic transmission transmission channel.
* `provenance`: Lifecycle tags: `prior` (seed), `observed` (textual co-occurrence), `inferred` (algorithmic addition), or `validated` (market data verified).
* `evidence`: Exact article sentences supporting the relationship.

### 3.3 Dynamic State Guard & Rollback (`impactgraph/kbstate.py`)
To prevent drift or hallucinated edge pollution, the graph runs an automated safety guard:
* **Snapshots**: Every modification (article ingestion, asset addition) produces an isolated state snapshot.
* **Regression Testing**: Following updates, the system re-evaluates canonical reference articles. If any core transmission sign flips or strength drops out of bounds, the change is **automatically reverted**.
* **Integrity Modes**: Supports `dynamic` mode (learning with guardrails) and `static` mode (frozen seed priors).

---

## 4. Backend Engine Breakdown

| Module | Location | Responsibilities |
| :--- | :--- | :--- |
| `extract.py` | `impactgraph/extract.py` | Deterministic token regex, case-sensitive ticker aliases (`!VIX`, `!INR`), direction verbs (`surged`, `slumped`), percentage parsers, hedge classifier. |
| `graph.py` | `impactgraph/graph.py` | NetworkX DiGraph wrapper, article evidence indexing, unlinked company node synthesis. |
| `propagate.py` | `impactgraph/propagate.py` | Depth-limited DFS (max 5 hops), anchor blocking, decay math, noisy-OR aggregation, agreement penalty. |
| `timeseries.py` | `impactgraph/timeseries.py` | FRED & Yahoo Finance data pipelines, ~2 years (520 trading days) daily returns, lagged correlation (0 to 10 days), simulated data isolation. |
| `analogs.py` | `impactgraph/analogs.py` | Historical shock matching (e.g. 1973 Oil Crisis, 2022 Fed tightening cycle, 2020 COVID shock), analog recovery curves. |
| `quotes.py` | `impactgraph/quotes.py` | Real-time quote streaming via WebSocket & 20s polling, SSE stream endpoint (`/api/stream`), cache sync. |
| `llm.py` | `impactgraph/llm.py` | Optional Groq/OpenRouter provider, quote-verified event extraction, zero invented edges. |
| `service.py` | `impactgraph/service.py` | Central orchestration pipeline (`Analyzer`), what-if scenarios, portfolio exposures, analog lookups. |
| `server.py` | Workspace root | FastAPI application, REST endpoints, CORS, static file mounts. |

---

## 5. REST API Specification

### 5.1 Analysis & Core Endpoints

#### `POST /api/analyze`
Analyzes unstructured financial text, updates the knowledge graph, and returns affected assets, sectors, and propagation chains.
* **Request:**
  ```json
  {
    "text": "Brent crude jumped 12% on Monday following tanker attacks in the Strait of Hormuz.",
    "live": false,
    "use_llm": false,
    "title": "Oil surges on Hormuz attacks",
    "link": "https://example.com/article",
    "full_text": false
  }
  ```
* **Response Keys:**
  * `events`: Array of detected shock triggers with status (`observed` vs `expected`) and quotes.
  * `assets`: Affected equities and ETFs ranked by plausibility score, direction, horizon, sensitivity, and sparklines.
  * `sectors`: Sector-level impacts.
  * `variables`: Macroeconomic indicator changes.
  * `paths`: Step-by-step causal transmission paths with hop mechanisms.
  * `graph`: Exportable D3 node-link graph payload.
  * `comparison`: Model predictions cross-checked against stated article facts.
  * `summary`: Plain-language grounded synthesis.

#### `POST /api/whatif`
Runs multi-variable hypothetical macroeconomic shocks without modifying the persistent knowledge graph.
* **Request:**
  ```json
  {
    "trigger": "crude_oil",
    "magnitude_pct": 15.0,
    "horizon_days": 30,
    "live": false,
    "shocks": [
      { "trigger": "crude_oil", "magnitude_pct": 15.0 },
      { "trigger": "rate_exp", "magnitude_pct": 50.0 }
    ]
  }
  ```

#### `POST /api/portfolio`
Calculates net signed exposure, offsetting risk pairs, and uncovered asset percentages for user-supplied portfolio weights.
* **Request:**
  ```json
  {
    "portfolio": { "XLE": 0.4, "DAL": 0.3, "AAPL": 0.3 }
  }
  ```

### 5.2 Market Data & Historical Analogs

* `GET /api/quotes?symbols=AAPL,XLE,DAL`: Fetches real-time price, change %, bid/ask, and source badge.
* `GET /api/stream`: Server-Sent Events (SSE) stream providing live quote ticks.
* `GET /api/analogs?node_id=crude_oil&shock_pct=10.0&live=false`: Fetches historical analog trajectories, event dates, and baseline overlay series.
* `GET /api/forecast?node_id=crude_oil&shock_pct=10.0&horizon=30&live=false`: Computes empirical forecast envelopes and confidence bands.
* `GET /api/market`: Returns open/closed status for major global exchanges (NYSE, NASDAQ, LSE, NSE, Tokyo).

### 5.3 Knowledge Base Management

* `GET /api/kb`: Returns current KB integrity status, dynamic version, and node/edge metrics.
* `POST /api/kb/mode`: Toggles KB mode (`dynamic` vs `static`).
* `POST /api/kb/revert`: Reverts to previous snapshot (`previous`) or baseline seed (`static`).
* `POST /api/kb/asset`: Adds a custom asset ticker to a sector.
* `DELETE /api/kb/asset/{node_id}`: Removes a user-added asset.
* `POST /api/kb/edge`: Updates or fine-tunes edge weight, strength, or sign.
* `POST /api/reset`: Resets graph and clears memory caches.

---

## 6. Frontend Application Architecture (`frontend/`)

Built with **React 19**, **Vite 8**, and **Lucide React**, the frontend provides 8 specialized analytical views:

```
frontend/src/
├── pages/
│   ├── EventAnalysis.jsx       # News ingestion, headline feeds, entity/status tagging
│   ├── ImpactGraph.jsx         # Interactive D3 graph, pathway tracer, audit view
│   ├── AssetImpact.jsx         # Equities & ETFs ranked impact table, sparklines
│   ├── ScenarioSimulator.jsx   # Interactive what-if sliders, multi-shock modeling
│   ├── EconometricAnalogs.jsx  # Historical shock comparisons & trajectory chart
│   ├── MarketIntelligence.jsx  # Live quotes ticker, market hours, watchlist
│   ├── ChatInterface.jsx       # Conversational Q&A over graph impacts
│   └── Settings.jsx            # KB safety modes, rollback controls, API keys
├── components/
│   ├── charts/
│   │   ├── AnalogChart.jsx     # High-precision SVG analog chart with hover crosshairs
│   │   ├── Sparkline.jsx       # Trend mini-charts
│   │   └── ForecastChart.jsx   # Cone-of-uncertainty trajectory chart
│   ├── graph/
│   │   ├── ForceGraph.jsx      # Force-directed D3 network renderer
│   │   └── PathInspector.jsx   # Hop-by-hop transmission details
│   └── layout/
│       ├── Header.jsx          # Live market pulse, global status indicator
│       └── Sidebar.jsx         # Primary navigation & mode switcher
└── services/
    └── api.js                  # Unified API client with automatic error mapping
```

---

## 7. Testing & Quality Assurance

The codebase includes an extensive automated test suite (`tests/test_pipeline.py`) comprising **96 test cases**:

```bash
# Run all tests
python -m unittest discover tests
```

### Coverage Highlights:
1. **Extraction Tests**: Directional verb recognition, basis point conversions, negative/positive hedges, ticker capitalization sensitivity.
2. **Knowledge Graph Tests**: Graph topology, cycle detection, edge validity, base strength retention.
3. **Propagation Tests**: Anchor isolation, multi-path depth capping, decay monotonicity, agreement penalty behavior.
4. **Time-Series Tests**: Lagged cross-correlation calculations, cache read/write integrity, simulated data confidence isolation.
5. **State Guard Tests**: Rollback verification on adversarial edge insertion, regression testing on sample articles.
6. **What-If & Analogs Tests**: Multi-shock aggregation, historical episode matching, portfolio exposure calculations.

---

## 8. Configuration & Deployment

### 8.1 Environment Variables (`.env`)

```ini
# Operating mode (0 = offline rules mode; 1 = require LLM)
ZENITH_REQUIRE_LLM=0

# LLM Providers (Optional)
GROQ_API_KEY=
OPENROUTER_API_KEY=
ZENITH_LLM_PROVIDER=groq
ZENITH_GROQ_MODEL=openai/gpt-oss-120b
ZENITH_OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct

# Market & News APIs (Optional)
FRED_API_KEY=
NEWSAPI_KEY=

# SEC Compliance Header
ZENITH_SEC_CONTACT=gauravchau2412@gmail.com
```

### 8.2 Execution Commands

```bash
# Backend (Port 8000)
python run.py

# Frontend (Port 5173)
cmd /c npm --prefix frontend run dev
```
